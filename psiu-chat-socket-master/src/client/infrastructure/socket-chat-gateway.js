export function createSocketChatGateway(socket, storage) {
  const storageKey = "psiu.session";
  const seen = new Set();
  let sessionToken = storage?.getItem(storageKey);
  let sessionId;
  let ready = false;
  let pending = [];
  socket.auth = callback => callback({ sessionToken });

  return {
    onMessage(handler) {
      const deliver = message => {
        if (message.id && seen.has(message.id)) return;
        if (message.id) seen.add(message.id);
        handler({ ...message, mine: message.senderId === (sessionId || socket.id) });
      };
      socket.on("chat message", message => {
        if (!ready) pending.push(message);
        else deliver(message);
      });
      socket.on("chat ready", snapshot => {
        sessionId = snapshot.sessionId;
        sessionToken = snapshot.sessionToken;
        if (sessionToken) storage?.setItem(storageKey, sessionToken);
        ready = true;
        for (const message of snapshot.history) deliver(message);
        for (const message of pending) deliver(message);
        pending = [];
      });
    },
    onConnectionChange(handler) {
      socket.on("chat ready", () => handler(true));
      socket.on("disconnect", () => {
        ready = false;
        pending = [];
        handler(false);
      });
      socket.on("connect_error", () => handler(false));
    },
    send(text) {
      if (!socket.connected || !ready) {
        return Promise.reject(new Error("Sem conexão. Aguarde a reconexão e tente novamente."));
      }
      return new Promise((resolve, reject) => {
        socket.timeout(8000).emit("chat message", text, (error, response) => {
          if (error) {
            reject(new Error("Não foi possível confirmar o envio. Verifique a conversa antes de tentar novamente."));
          } else if (!response?.ok) {
            reject(new Error(response?.error || "Não foi possível enviar a mensagem."));
          } else {
            resolve();
          }
        });
      });
    },
  };
}
