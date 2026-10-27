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

function createChatServer() {
  const root = join(__dirname, "../..");
  const app = express();
  const server = createServer(app);
  const io = new Server(server);

  app.get("/", (req, res) => res.sendFile(join(root, "index.html")));
  app.get("/styles.css", (req, res) => res.sendFile(join(root, "styles.css")));
  app.use("/js", express.static(join(root, "src/client")));

  const publishMessage = createPublishMessage({
    broadcaster: createSocketBroadcaster(io),
    generateId: randomUUID,
  });
  registerSocketChat(io, { publishMessage });
  return { app, server, io };
}

module.exports = { createChatServer };
