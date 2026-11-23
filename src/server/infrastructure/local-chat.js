const { randomUUID } = require("node:crypto");
const { pickParticipant } = require("../domain/participant");

function createLocalChat() {
  const sessions = new Map();
  const messages = [];
  return {
    room: "global",
    async restoreSession(token) {
      const saved = sessions.get(token);
      if (saved && saved.expires > Date.now()) {
        saved.expires = Date.now() + 86_400_000;
        return { ...saved.session, isNew: false };
      }
      for (const [key, value] of sessions) {
        if (value.expires <= Date.now()) sessions.delete(key);
      }
      const session = { token: randomUUID(), sessionId: randomUUID(), room: "global", participant: pickParticipant() };
      sessions.set(session.token, { session, expires: Date.now() + 86_400_000 });
      return { ...session, isNew: true };
    },
    async history() { return [...messages]; },
    async append(message) {
      messages.push(message);
      if (messages.length > 100) messages.shift();
    },
    async renewPresence(session) {
      const saved = sessions.get(session.token);
      if (saved) saved.expires = Date.now() + 86_400_000;
    },
    async removePresence() {},
  };
}

module.exports = { createLocalChat };
