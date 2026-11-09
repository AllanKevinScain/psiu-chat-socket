const { createChatServer } = require("./src/server/create-chat-server");
const port = process.env.PORT || 3000;

async function start() {
  const distributed = process.env.REDIS_URL
    ? await require("./src/server/infrastructure/redis-chat").connectRedisChat(process.env.REDIS_URL)
    : undefined;
  const { server, io } = createChatServer({ distributed });
  distributed?.onInterruption(() => {
    for (const socket of io.sockets.sockets.values()) socket.conn.close();
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, async () => {
      await io.close();
      distributed?.close();
    });
  }
  server.listen(port, () => console.log(`psiu running on port ${port}`));
}

start().catch(() => {
  console.error("Falha ao iniciar o chat.");
  process.exit(1);
});
