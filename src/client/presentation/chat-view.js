export function createChatView(document) {
  const form = document.getElementById("composer");
  const input = document.getElementById("message-input");
  const messages = document.getElementById("messages");
  const button = form.querySelector('button[type="submit"]');
  const toast = document.getElementById("toast");
  let toastTimer;
  return {
    onSubmit(handler) {
      form.addEventListener("submit", event => {
        event.preventDefault();
        handler();
      });
      input.addEventListener("keydown", event => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          form.requestSubmit();
        }
      });
    },
    getText: () => input.value,
    clear: () => { input.value = ""; },
    setSending(sending) {
      input.disabled = sending;
      button.disabled = sending;
      form.setAttribute("aria-busy", String(sending));
      if (!sending) input.focus();
    },
    addMessage({ text, mine, senderId }) {
      const row = document.createElement("div");
      row.className = mine ? "message mine" : "message";
      const wrap = document.createElement("div");
      wrap.className = "bubble-wrap";
      const sender = document.createElement("div");
      sender.className = "message-sender";
      sender.textContent = senderId;
      sender.setAttribute("aria-label", `Identificador do remetente: ${senderId}`);
      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.textContent = text;
      wrap.append(sender, bubble);
      row.append(wrap);
      messages.append(row);
      messages.scrollTop = messages.scrollHeight;
    },
    notify(text) {
      toast.textContent = text;
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
    },
  };
}
