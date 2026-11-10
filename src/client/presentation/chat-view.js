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
    addMessage({ text, mine, senderId, type, participant }) {
      const row = document.createElement("div");
      const avatar = document.createElement("img");
      if (participant?.img) {
        avatar.className = "message-avatar";
        avatar.alt = "";
        avatar.referrerPolicy = "no-referrer";
        avatar.addEventListener("error", () => avatar.remove(), { once: true });
        avatar.src = participant.img;
      }
      if (type === "entry") {
        row.className = "message-entry";
        if (participant?.img) row.append(avatar);
        row.append(text);
        messages.append(row);
        messages.scrollTop = messages.scrollHeight;
        return;
      }
      row.className = mine ? "message mine" : "message";
      const wrap = document.createElement("div");
      wrap.className = "bubble-wrap";
      const sender = document.createElement("div");
      sender.className = "message-sender";
      if (participant?.img) sender.append(avatar);
      sender.append(participant?.name || senderId);
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
