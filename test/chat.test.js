const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createPublishMessage } = require("../src/server/application/publish-message");
const { createChatServer } = require("../src/server/create-chat-server");

test("valida conteúdo antes de publicar e gera a mensagem no servidor", () => {
  const published = [];
  const publish = createPublishMessage({
    broadcaster: { publish: message => published.push(message) },
    generateId: () => "message-1",
  });
  for (const text of [null, {}, "  ", "x".repeat(4001)]) {
    assert.throws(() => publish({ text, senderId: "sender" }));
  }
  assert.equal(published.length, 0);
  assert.deepEqual(publish({ text: "  oi\n tudo bem?  ", senderId: "sender" }), {
    id: "message-1", text: "oi\n tudo bem?", senderId: "sender",
  });
  assert.equal(published.length, 1);
});

test("controlador preserva o texto em falhas, evita envios simultâneos e limpa após confirmação", async () => {
  const { createChatController } = await import("../src/client/application/chat-controller.js");
  let submit, resolveSend, rejectSend, cleared = 0, sends = 0;
  const notices = [], states = [];
  const view = {
    onSubmit: handler => { submit = handler; }, getText: () => " oi ",
    clear: () => { cleared++; }, setSending: state => states.push(state),
    addMessage() {}, notify: message => notices.push(message),
  };
  const gateway = {
    onMessage() {}, onConnectionChange() {},
    send: () => { sends++; return new Promise((resolve, reject) => { resolveSend = resolve; rejectSend = reject; }); },
  };
  createChatController({ view, gateway }).start();
  const failed = submit();
  await submit();
  assert.equal(sends, 1);
  rejectSend(new Error("offline"));
  await failed;
  assert.equal(cleared, 0);
  assert.deepEqual(notices, ["offline"]);
  const successful = submit();
  resolveSend();
  await successful;
  assert.equal(cleared, 1);
  assert.deepEqual(states, [true, false, true, false]);
});

test("gateway identifica autoria e impede envio desconectado", async () => {
  const { createSocketChatGateway } = await import("../src/client/infrastructure/socket-chat-gateway.js");
  const handlers = {};
  const socket = { id: "self", connected: false, on: (name, handler) => { handlers[name] = handler; } };
  const gateway = createSocketChatGateway(socket);
  const received = [];
  gateway.onMessage(message => received.push(message));
  handlers["chat message"]({ text: "oi", senderId: "self" });
  handlers["chat message"]({ text: "olá", senderId: "other" });
  assert.deepEqual(received.map(message => message.mine), [true, false]);
  await assert.rejects(gateway.send("oi"), /Sem conexão/);
});

test("HTTP serve os módulos e Socket.IO transmite entre duas conexões sem duplicar", { timeout: 10000 }, async t => {
  const { server, io } = createChatServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => io.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ["/", "/styles.css", "/socket.io/socket.io.js", "/js/main.js", "/js/application/chat-controller.js", "/js/infrastructure/socket-chat-gateway.js", "/js/presentation/chat-view.js"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    const content = await response.text();
    if (path === "/") assert.doesNotMatch(content, /<script>/);
    if (path.startsWith("/js/")) assert.match(response.headers.get("content-type"), /javascript/);
  }
  assert.equal((await fetch(base + "/js/../server/create-chat-server.js")).status, 404);

  // Cliente mínimo usando o protocolo de polling do Engine.IO/Socket.IO.
  async function connect() {
    const endpoint = `${base}/socket.io/?EIO=4&transport=polling`;
    const handshake = await (await fetch(endpoint)).text();
    const sid = JSON.parse(handshake.slice(1)).sid;
    const url = `${endpoint}&sid=${sid}`;
    const post = body => fetch(url, { method: "POST", body, headers: { "Content-Type": "text/plain" } });
    const poll = async () => (await (await fetch(url)).text()).split("\x1e");
    await post("40");
    const connection = (await poll()).find(packet => packet.startsWith("40"));
    return { post, poll, id: JSON.parse(connection.slice(2)).sid };
  }
  const a = await connect(), b = await connect();
  await a.post('420["chat message","  Olá mundo  "]');
  const ownPackets = await a.poll(), otherPackets = await b.poll();
  const ownMessages = ownPackets.filter(packet => packet.startsWith("42"));
  assert.equal(ownMessages.length, 1);
  const message = JSON.parse(ownMessages[0].slice(2))[1];
  assert.equal(message.text, "Olá mundo");
  assert.equal(message.senderId, a.id);
  assert.ok(message.id);
  assert.deepEqual(JSON.parse(otherPackets.find(packet => packet.startsWith("42")).slice(2))[1], message);
  assert.ok(ownPackets.some(packet => packet === '430[{"ok":true}]'));
  await a.post('421["chat message","   "]');
  const rejected = await a.poll();
  assert.ok(rejected.some(packet => packet.startsWith('431[{"ok":false')));
  assert.ok(rejected.every(packet => !packet.startsWith("42")));
});
