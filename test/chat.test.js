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

test("gateway restaura a sessão e combina histórico com eventos sem duplicar", async () => {
  const { createSocketChatGateway } = await import("../src/client/infrastructure/socket-chat-gateway.js");
  const handlers = {};
  const socket = { id: "self", connected: false, on: (name, handler) => { handlers[name] = handler; } };
  let token = "saved-token";
  const storage = {
    getItem: () => token,
    setItem: (key, value) => { token = value; },
  };
  const gateway = createSocketChatGateway(socket, storage);
  const received = [];
  gateway.onMessage(message => received.push(message));
  socket.auth(auth => assert.deepEqual(auth, { sessionToken: "saved-token" }));
  const own = { id: "1", text: "oi", senderId: "stable-session" };
  handlers["chat message"](own);
  assert.equal(received.length, 0);
  handlers["chat ready"]({ sessionId: "stable-session", sessionToken: "new-token", history: [own] });
  handlers["chat message"]({ id: "2", text: "olá", senderId: "other" });
  assert.equal(token, "new-token");
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
    let packets = await poll();
    let ready = packets.find(packet => packet.startsWith('42["chat ready"'));
    if (!ready) {
      packets = await poll();
      ready = packets.find(packet => packet.startsWith('42["chat ready"'));
    }
    return { post, poll, id: JSON.parse(ready.slice(2))[1].sessionId };
  }
  const a = await connect(), b = await connect();
  await a.post('420["chat message","  Olá mundo  "]');
  const ownPackets = await a.poll(), otherPackets = await b.poll();
  const readMessages = packets => packets
    .filter(packet => packet.startsWith("42"))
    .map(packet => JSON.parse(packet.slice(2))[1]);
  const ownEvents = readMessages(ownPackets);
  const entry = ownEvents.find(message => message.type === "entry");
  assert.equal(entry.senderId, b.id);
  assert.match(entry.text, /entrou na conversa/);
  const ownMessages = ownEvents.filter(message => message.type !== "entry");
  assert.equal(ownMessages.length, 1);
  const [message] = ownMessages;
  assert.equal(message.text, "Olá mundo");
  assert.equal(message.senderId, a.id);
  assert.ok(message.id);
  assert.deepEqual(readMessages(otherPackets).find(event => event.type !== "entry"), message);
  assert.ok(ownPackets.some(packet => packet === '430[{"ok":true}]'));
  await a.post('421["chat message","   "]');
  const rejected = await a.poll();
  assert.ok(rejected.some(packet => packet.startsWith('431[{"ok":false')));
  assert.ok(rejected.every(packet => !packet.startsWith("42")));
  const failures = await (await fetch(base + "/historico/eventos")).json();
  assert.ok(failures.some(event => event.action === "falha no envio" && event.details.includes("Escreva")));
  const attachment = { name: "teste.txt", data: "data:text/plain;base64,b2k=" };
  await a.post('422' + JSON.stringify(["chat message", { text: "", attachment }]));
  const attachedPackets = await a.poll();
  assert.ok(attachedPackets.includes('432[{"ok":true}]'));
  assert.deepEqual(readMessages(attachedPackets)[0].attachment, attachment);
  assert.deepEqual(readMessages(await b.poll())[0].attachment, attachment);
  const report = { time: new Date().toISOString(), details: "Envio sem conexão" };
  await a.post('423' + JSON.stringify(["chat failure", report]));
  assert.ok((await a.poll()).includes('433[{"ok":true}]'));
  const reports = await (await fetch(base + "/historico/eventos")).json();
  assert.ok(reports.some(event => event.action === "falha no envio" && event.details === report.details));
});
