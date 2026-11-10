const { randomUUID } = require("node:crypto");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");
const { pickParticipant, legacyParticipant } = require("../domain/participant");

const room = "global";
const historyKey = "psiu:room:global:messages";
const sessionTTL = 86_400;
const presenceKey = (sessionId, socketId) => `psiu:presence:${sessionId}:${socketId}`;
const sessionKey = sessionId => `psiu:session:${sessionId}`;

async function connectRedisChat(url) {
  const state = createClient({ url, disableOfflineQueue: true });
  const publisher = state.duplicate();
  const subscriber = state.duplicate();
  const clients = [state, publisher, subscriber];
  for (const client of clients) {
    client.on("error", () => console.error("Conexão com Redis indisponível."));
  }
  await Promise.all(clients.map(client => client.connect()));

  return {
    adapter: createAdapter(publisher, subscriber, { key: "psiu:socket.io" }),
    room,
    isReady: () => clients.every(client => client.isReady),
    onInterruption(handler) {
      for (const client of clients) client.on("reconnecting", handler);
    },
    close() {
      for (const client of clients) client.destroy();
    },
    async restoreSession(token) {
      if (typeof token === "string" && /^[a-f0-9-]{36}$/.test(token)) {
        const saved = await state.getEx(sessionKey(token), { EX: sessionTTL });
        if (saved) {
          const session = JSON.parse(saved);
          session.participant ??= legacyParticipant(session.sessionId);
          return { ...session, isNew: false };
        }
      }
      const session = { token: randomUUID(), sessionId: randomUUID(), room, participant: pickParticipant() };
      await state.set(sessionKey(session.token), JSON.stringify(session), { EX: sessionTTL });
      return { ...session, isNew: true };
    },
    async renewPresence(session, socketId) {
      await state.multi()
        .expire(sessionKey(session.token), sessionTTL)
        .set(presenceKey(session.sessionId, socketId), session.room, { EX: 30 })
        .exec();
    },
    removePresence: (sessionId, socketId) => state.del(presenceKey(sessionId, socketId)),
    async history() {
      return (await state.lRange(historyKey, 0, -1)).map(entry => JSON.parse(entry));
    },
    async append(message) {
      if (!clients.every(client => client.isReady)) {
        throw new Error("Chat temporariamente indisponível. Tente novamente.");
      }
      try {
        await state.multi().rPush(historyKey, JSON.stringify(message)).lTrim(historyKey, -100, -1).exec();
      } catch {
        throw new Error("Não foi possível confirmar o envio. Verifique a conversa antes de tentar novamente.");
      }
    },
  };
}

module.exports = { connectRedisChat };
