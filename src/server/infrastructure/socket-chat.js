function createSocketBroadcaster(io) {
  return { publish: (message) => io.emit("chat message", message) };
}

function registerSocketChat(io, { publishMessage }) {
  io.on("connection", (socket) => {
    console.log("🚀 ~ registerSocketChat ~ socket:", socket.id);

    socket.on("chat message", (text, acknowledge) => {
      const reply = typeof acknowledge === "function" ? acknowledge : () => {};
      try {
        publishMessage({ text, senderId: socket.id });
        reply({ ok: true });
      } catch (error) {
        reply({ ok: false, error: error.message });
      }
    });
  });
}

module.exports = { createSocketBroadcaster, registerSocketChat };
