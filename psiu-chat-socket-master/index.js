const { createChatServer } = require("./src/server/create-chat-server");
const port = process.env.PORT || 3000;

async function start() {
  const distributed = process.env.REDIS_URL
    ? await require("./src/server/infrastructure/redis-chat").connectRedisChat(process.env.REDIS_URL)
    : undefined;
  const { server, io, recordActivity, flushActivity } = createChatServer({
    distributed,
    instance: process.env.CHAT_INSTANCE,
  });
  const instance = process.env.CHAT_INSTANCE;
  const peer = process.env.CHAT_PEER;
  const monitor = distributed && instance && peer
    ? () => distributed.monitorInstance(instance, peer).catch(() => {
      console.error("Não foi possível verificar a disponibilidade das instâncias.");
    })
    : undefined;
  let heartbeat;
  let monitoring;
  distributed?.onInterruption(() => {
    for (const socket of io.sockets.sockets.values()) socket.conn.close();
  });
  let stopping = false;
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, async () => {
      if (stopping) return;
      stopping = true;
      clearInterval(heartbeat);
      await monitoring;
      if (monitor) {
        await distributed.stopInstance(instance).catch(() => {
          console.error("Não foi possível registrar o desligamento da instância.");
        });
      } else {
        await recordActivity("instância desligada");
      }
      await io.close();
      await flushActivity();
      distributed?.close();
    });
  }
  server.listen(port, () => {
    if (stopping) return;
    recordActivity("instância iniciada");
    if (monitor) {
      const tick = () => {
        if (!monitoring) monitoring = monitor().finally(() => { monitoring = undefined; });
      };
      tick();
      heartbeat = setInterval(tick, 2000);
    }
    console.log(`psiu running on port ${port}`);
  });
}

start().catch(() => {
  console.error("Falha ao iniciar o chat.");
  process.exit(1);
});
