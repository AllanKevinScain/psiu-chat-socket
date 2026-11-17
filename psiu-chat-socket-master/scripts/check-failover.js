const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { on, once } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const { io } = require("socket.io-client");

const base = `http://127.0.0.1:${process.env.PUBLIC_PORT || 8080}`;
const clients = [];
const runId = randomUUID();

function compose(...args) {
  execFileSync("docker", ["compose", ...args], { stdio: "inherit" });
}

function next(socket, event) {
  return once(socket, event, { signal: AbortSignal.timeout(15_000) }).then(([data]) => data);
}

function backend(socket) {
  return new Map(socket.io.engine._cookieJar.cookies).get("PSIU_NODE")?.value;
}

function assertPresence(socket, sessionId) {
  const key = `psiu:presence:${sessionId}:${socket.id}`;
  const room = execFileSync("docker", ["compose", "exec", "-T", "redis", "redis-cli", "GET", key], {
    encoding: "utf8",
  }).trim();
  assert.equal(room, "global");
}

async function connect() {
  let sessionToken;
  const socket = io(base, {
    autoConnect: false,
    forceNew: true,
    transports: ["polling"],
    withCredentials: true,
    auth: reply => reply({ sessionToken }),
  });
  clients.push(socket);
  socket.on("chat ready", snapshot => { sessionToken = snapshot.sessionToken; });
  const ready = next(socket, "chat ready");
  socket.connect();
  return { socket, snapshot: await ready };
}

async function send(sender, receiver, label, senderId) {
  const text = `${runId} ${label}`;
  const events = on(receiver, "chat message", { signal: AbortSignal.timeout(15_000) });
  try {
    assert.deepEqual(await sender.timeout(3000).emitWithAck("chat message", text), { ok: true });
    for await (const [message] of events) {
      if (message.type === "entry") continue;
      assert.equal(message.text, text);
      assert.equal(message.senderId, senderId);
      return message;
    }
  } finally {
    await events.return();
  }
}

async function waitForBackend(node) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await fetch(base, { signal: AbortSignal.timeout(3000) });
    await response.body?.cancel();
    if (response.ok && response.headers.get("set-cookie")?.includes(`PSIU_NODE=${node};`)) return;
    await delay(500);
  }
  throw new Error(`A réplica ${node} não apareceu no balanceador.`);
}

async function check() {
  let stopped = false;
  try {
    await waitForBackend("a");
    await waitForBackend("b");
    const first = await connect();
    const second = await connect();
    assert.deepEqual([backend(first.socket), backend(second.socket)].sort(), ["a", "b"]);
    const [a, b] = backend(first.socket) === "a" ? [first, second] : [second, first];
    const before = await send(a.socket, b.socket, "A para B", a.snapshot.sessionId);
    assert.ok(before.participant?.name && before.participant?.img);
    await send(b.socket, a.socket, "B para A", b.snapshot.sessionId);

    // Deixa o transporte reconectar sozinho, mas só restaura a sessão
    // depois que a mensagem perdida estiver gravada.
    const resume = Promise.withResolvers();
    const authenticate = a.socket.auth;
    a.socket.auth = reply => {
      resume.promise.then(() => authenticate(reply));
    };
    const disconnected = next(a.socket, "disconnect");
    stopped = true;
    compose("stop", "chat-a");
    await disconnected;
    await waitForBackend("b");
    const fresh = await connect();
    assert.equal(backend(fresh.socket), "b");
    const missed = await send(b.socket, fresh.socket, "durante a queda", b.snapshot.sessionId);

    const recovered = next(a.socket, "chat ready");
    resume.resolve();
    const snapshot = await recovered;
    assert.equal(backend(a.socket), "b");
    assert.equal(snapshot.sessionId, a.snapshot.sessionId);
    assert.equal(snapshot.history.filter(message =>
      message.type === "entry" && message.senderId === snapshot.sessionId).length, 1);
    assert.ok(snapshot.history.some(message => message.id === missed.id),
      "A mensagem enviada antes da restauração deve estar no histórico.");
    assertPresence(a.socket, snapshot.sessionId);
    const after = await send(a.socket, b.socket, "após reconexão", a.snapshot.sessionId);
    assert.deepEqual(after.participant, before.participant);

    compose("start", "chat-a");
    stopped = false;
    await waitForBackend("a");
    let restarted = await connect();
    if (backend(restarted.socket) !== "a") restarted = await connect();
    assert.equal(backend(restarted.socket), "a");
    await send(restarted.socket, b.socket, "após retorno de A", restarted.snapshot.sessionId);
    console.log("Disponibilidade, afinidade, sincronização e failover verificados.");
  } finally {
    for (const socket of clients) socket.disconnect();
    if (stopped) compose("start", "chat-a");
  }
}

check().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
