export function createSocketChatGateway(socket, storage) {
  const storageKey = "psiu.session";
  const seen = new Set();
  let sessionToken = storage?.getItem(storageKey);
  let sessionId;
  let ready = false;
  let pending = [];
  let failures = [];
  try { failures = JSON.parse(storage?.getItem("psiu.failures") || "[]"); } catch {}
  if (!Array.isArray(failures)) failures = [];
  failures = failures.filter(report => typeof report?.details === "string" &&
    report.details.length <= 300 && Number.isFinite(Date.parse(report.time))).slice(-30);
  let reporting = false;
  function saveFailures() {
    try { storage?.setItem("psiu.failures", JSON.stringify(failures)); } catch {}
  }
  async function reportFailures() {
    if (reporting || !ready || !socket.connected) return;
    reporting = true;
    try {
      while (failures.length && ready && socket.connected) {
        await socket.timeout(5000).emitWithAck("chat failure", failures[0]);
        failures.shift();
        saveFailures();
      }
    } catch {
      // A reconexão ou o próximo envio tenta registrar novamente.
    } finally {
      reporting = false;
    }
  }
  function recordFailure(details) {
    failures.push({ id: crypto.randomUUID(), time: new Date().toISOString(), details: details.slice(0, 300) });
    failures = failures.slice(-30);
    saveFailures();
    reportFailures();
  }
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
        reportFailures();
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
        const details = "Sem conexão. Aguarde a reconexão e tente novamente.";
        recordFailure(details);
        return Promise.reject(new Error(details));
      }
      return new Promise((resolve, reject) => {
        socket.timeout(8000).emit("chat message", text, (error, response) => {
          if (error) {
            recordFailure("Não foi possível confirmar o envio após 8 segundos.");
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
