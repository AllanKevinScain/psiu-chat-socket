export function createSocketChatGateway(socket) {
  return {
    onMessage(handler) {
      socket.on("chat message", message => {
        handler({ ...message, mine: message.senderId === socket.id });
      });
    },
    onConnectionChange(handler) {
      socket.on("connect", () => handler(true));
      socket.on("disconnect", () => handler(false));
      socket.on("connect_error", () => handler(false));
    },
    send(text) {
      if (!socket.connected) {
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
