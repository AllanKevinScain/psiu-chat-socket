const express = require("express");
const { createServer } = require("node:http");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const { Server } = require("socket.io");
const { createPublishMessage } = require("./application/publish-message");
const {
  createSocketBroadcaster,
  registerSocketChat,
} = require("./infrastructure/socket-chat");

function createChatServer({ distributed, instance = "chat-local" } = {}) {
  const root = join(__dirname, "../..");
  const app = express();
  const server = createServer(app);
  const io = new Server(server, { maxHttpBufferSize: 3_000_000 });
  if (distributed) io.adapter(distributed.adapter);
  const activity = [];
  const pendingActivity = new Set();
  let flushingActivity;
  function flushBufferedActivity() {
    if (!distributed || !activity.length) return Promise.resolve();
    if (flushingActivity) return flushingActivity;
    flushingActivity = (async () => {
      while (activity.length) {
        const event = activity[0];
        await distributed.recordActivity(event);
        const index = activity.indexOf(event);
        if (index >= 0) activity.splice(index, 1);
      }
    })().finally(() => { flushingActivity = undefined; });
    return flushingActivity;
  }
  function recordActivity(action, actor = instance, details, time = new Date().toISOString(), id = randomUUID()) {
    const event = { id, time, action, actor, instance, ...(details && { details }) };
    if (!distributed) {
      if (activity.some(saved => saved.id === id)) return Promise.resolve();
      activity.unshift(event);
      if (activity.length > 200) activity.pop();
      return Promise.resolve();
    }
    const write = distributed.recordActivity(event)
      .catch(() => {
        activity.push(event);
        if (activity.length > 200) activity.shift();
        console.error("Evento aguardando o retorno do Redis.");
      })
      .finally(() => pendingActivity.delete(write));
    pendingActivity.add(write);
    return write;
  }

  app.get("/healthz", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.status(!distributed || distributed.isReady() ? 200 : 503).end();
  });
  app.get("/", (req, res) => res.sendFile(join(root, "index.html")));
  app.get("/historico", (req, res) => res.sendFile(join(root, "historico.html")));
  app.get("/historico/eventos", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      await flushBufferedActivity();
      const events = distributed ? await distributed.readActivity() : activity;
      res.json([...events].sort((a, b) => Date.parse(b.time) - Date.parse(a.time)));
    } catch {
      res.status(503).json({ error: "Histórico temporariamente indisponível." });
    }
  });
  app.get("/styles.css", (req, res) => res.sendFile(join(root, "styles.css")));
  app.get("/logo.svg", (req, res) => res.sendFile(join(root, "src/assets/logo.svg")));
  app.use("/js", express.static(join(root, "src/client")));

  const chatState = distributed || require("./infrastructure/local-chat").createLocalChat();
  const broadcaster = createSocketBroadcaster(io, chatState);
  const publishMessage = createPublishMessage({
    broadcaster,
    generateId: randomUUID,
  });
  const publishEntry = (senderId, participant) => broadcaster.publish({
    id: randomUUID(),
    type: "entry",
    senderId,
    participant,
    text: `${participant.name} entrou na conversa.`,
  });
  registerSocketChat(io, { publishMessage, publishEntry, distributed: chatState, recordActivity });
  return { app, server, io, recordActivity, flushActivity: () => Promise.all(pendingActivity) };
}

module.exports = { createChatServer };
