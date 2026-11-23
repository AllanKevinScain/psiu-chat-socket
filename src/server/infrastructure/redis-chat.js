const { randomUUID } = require("node:crypto");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");
const { pickParticipant, legacyParticipant } = require("../domain/participant");

const room = "global";
const historyKey = "psiu:room:global:messages";
const activityKey = "psiu:activity";
const activeInstances = "psiu:active-instances";
const heartbeatKey = instance => `psiu:heartbeat:${instance}`;
const recordStoppedInstance = `
  if redis.call('SREM', KEYS[1], ARGV[1]) == 1 then
    redis.call('LPUSH', KEYS[2], ARGV[2])
    redis.call('LTRIM', KEYS[2], 0, 199)
  end
`;

function stoppedEvent(instance) {
  return JSON.stringify({
    time: new Date().toISOString(), action: "instância desligada", actor: instance, instance,
  });
}
const sessionTTL = 86_400;
const presenceKey = (sessionId, socketId) => `psiu:presence:${sessionId}:${socketId}`;
const sessionKey = sessionId => `psiu:session:${sessionId}`;

async function connectRedisChat(url) {
  const state = createClient({ url, disableOfflineQueue: true });
  const publisher = state.duplicate();
  const subscriber = state.duplicate();
  const clients = [state, publisher, subscriber];
  let monitoringSince = Date.now();
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
    async recordActivity(event) {
      await state.eval(`
        if redis.call('SET', KEYS[2], '1', 'NX', 'EX', 86400) then
          redis.call('LPUSH', KEYS[1], ARGV[1])
          redis.call('LTRIM', KEYS[1], 0, 199)
        end
      `, {
        keys: [activityKey, `psiu:activity-seen:${event.id}`],
        arguments: [JSON.stringify(event)],
      });
    },
    async monitorInstance(instance, peer) {
      if (!clients.every(client => client.isReady)) {
        monitoringSince = Date.now();
        return;
      }
      await state.eval(`
        redis.call('SET', KEYS[3], '1', 'EX', 8)
        redis.call('SADD', KEYS[1], ARGV[3])
        if ARGV[4] == '1' and redis.call('EXISTS', KEYS[4]) == 0 then
          ${recordStoppedInstance}
        end
      `, {
        keys: [activeInstances, activityKey, heartbeatKey(instance), heartbeatKey(peer)],
        arguments: [peer, stoppedEvent(peer), instance,
          Date.now() - monitoringSince >= 8000 ? "1" : "0"],
      });
    },
    async stopInstance(instance) {
      await state.eval(`
        redis.call('DEL', KEYS[3])
        ${recordStoppedInstance}
      `, {
        keys: [activeInstances, activityKey, heartbeatKey(instance)],
        arguments: [instance, stoppedEvent(instance)],
      });
    },
    async readActivity() {
      return (await state.lRange(activityKey, 0, 199)).map(entry => JSON.parse(entry));
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
