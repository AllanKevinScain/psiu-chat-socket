const { pickParticipant } = require("../domain/participant");

function createSocketBroadcaster(io, distributed) {
  if (!distributed) return { publish: message => io.emit("chat message", message) };
  return {
    async publish(message) {
      await distributed.append(message);
      io.to(distributed.room).emit("chat message", message);
    },
  };
}

function registerSocketChat(io, { publishMessage, publishEntry, distributed, recordActivity }) {
  io.on("connection", async socket => {
    let senderId = socket.id;
    let participant;
    let isNew = true;
    if (distributed) {
      try {
        const session = await distributed.restoreSession(socket.handshake.auth.sessionToken);
        senderId = session.sessionId;
        participant = session.participant;
        isNew = session.isNew;
        if (!socket.connected) return;
        await socket.join(session.room);
        const history = await distributed.history();
        if (!socket.connected) return;
        const renew = () => distributed.renewPresence(session, socket.id);
        const heartbeat = setInterval(() => {
          renew().catch(() => socket.conn.close());
        }, 10_000);
        socket.once("disconnect", () => {
          clearInterval(heartbeat);
          distributed.removePresence(senderId, socket.id).catch(() => {});
        });
        await renew();
        if (!socket.connected) {
          await distributed.removePresence(senderId, socket.id);
          return;
        }
        if (session.isNew) await publishEntry(senderId, participant);
        if (!socket.connected) return;
        socket.emit("chat ready", { sessionId: senderId, sessionToken: session.token, history });
      } catch {
        socket.conn.close();
        return;
      }
    } else {
      participant = pickParticipant();
    }

    recordActivity(isNew ? "entrou no chat" : "reconectou", participant.name);
    socket.once("disconnect", () => recordActivity("desconectou", participant.name));

    socket.on("chat failure", async (report, acknowledge) => {
      if (typeof report?.details !== "string" || report.details.length > 300 ||
          typeof report.time !== "string" || !Number.isFinite(Date.parse(report.time))) return;
      if (report.id !== undefined && (typeof report.id !== "string" ||
          !/^[a-f0-9-]{36}$/.test(report.id))) return;
      await recordActivity("falha no envio", participant.name,
        report.details, new Date(report.time).toISOString(), report.id);
      if (typeof acknowledge === "function") acknowledge({ ok: true });
    });
    socket.on("chat message", async (payload, acknowledge) => {
      const reply = typeof acknowledge === "function" ? acknowledge : () => {};
      try {
        const input = typeof payload === "string" ? { text: payload } : payload;
        await publishMessage({ text: input?.text, attachment: input?.attachment, senderId, participant });
        reply({ ok: true });
      } catch (error) {
        await recordActivity("falha no envio", participant.name, error.message);
        reply({ ok: false, error: error.message });
      }
    });
    if (!distributed) {
      publishEntry(senderId, participant);
      socket.emit("chat ready", { sessionId: senderId, history: [] });
    }
  });
}

module.exports = { createSocketBroadcaster, registerSocketChat };
