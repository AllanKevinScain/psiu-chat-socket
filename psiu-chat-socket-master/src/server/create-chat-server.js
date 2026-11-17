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
  const io = new Server(server);
  if (distributed) io.adapter(distributed.adapter);
  const activity = [];
  const pendingActivity = new Set();
  function recordActivity(action, actor = instance) {
    const event = { time: new Date().toISOString(), action, actor, instance };
    if (!distributed) {
      activity.unshift(event);
      if (activity.length > 200) activity.pop();
      return Promise.resolve();
    }
    const write = distributed.recordActivity(event)
      .catch(() => console.error("Não foi possível registrar um evento do chat."))
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
      res.json(distributed ? await distributed.readActivity() : activity);
    } catch {
      res.status(503).json({ error: "Histórico temporariamente indisponível." });
    }
  });
  app.get("/styles.css", (req, res) => res.sendFile(join(root, "styles.css")));
  app.use("/js", express.static(join(root, "src/client")));

  const broadcaster = createSocketBroadcaster(io, distributed);
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
  registerSocketChat(io, { publishMessage, publishEntry, distributed, recordActivity });
  return { app, server, io, recordActivity, flushActivity: () => Promise.all(pendingActivity) };
}

module.exports = { createChatServer };
