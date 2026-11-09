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

function createChatServer({ distributed } = {}) {
  const root = join(__dirname, "../..");
  const app = express();
  const server = createServer(app);
  const io = new Server(server);
  if (distributed) io.adapter(distributed.adapter);

  app.get("/healthz", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.status(!distributed || distributed.isReady() ? 200 : 503).end();
  });
  app.get("/", (req, res) => res.sendFile(join(root, "index.html")));
  app.get("/styles.css", (req, res) => res.sendFile(join(root, "styles.css")));
  app.use("/js", express.static(join(root, "src/client")));

  const publishMessage = createPublishMessage({
    broadcaster: createSocketBroadcaster(io, distributed),
    generateId: randomUUID,
  });
  registerSocketChat(io, { publishMessage, distributed });
  return { app, server, io };
}

module.exports = { createChatServer };
