export function createChatView(document) {
  const form = document.getElementById("composer");
  const input = document.getElementById("message-input");
  const messages = document.getElementById("messages");
  const button = form.querySelector('button[type="submit"]');
  const toast = document.getElementById("toast");
  const fileInput = document.getElementById("file-input");
  const attachButton = document.getElementById("attach-toggle");
  const emojiToggle = document.getElementById("emoji-toggle");
  const emojiPicker = document.getElementById("emoji-picker");
  const preview = document.getElementById("attachment-preview");
  const attachmentName = document.getElementById("attachment-name");
  const removeAttachment = document.getElementById("remove-attachment");
  const connectionStatus = document.getElementById("connection-status");
  let attachment;
  let readingFile = false;
  let sending = false;
  let toastTimer;
  function notify(text) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
  }
  function resize() {
    input.style.height = "auto";
    input.style.height = input.scrollHeight + "px";
  }
  function updateControls() {
    button.disabled = sending || readingFile;
    attachButton.disabled = sending || readingFile;
    removeAttachment.disabled = sending || readingFile;
    emojiToggle.disabled = sending;
    input.disabled = sending;
    form.setAttribute("aria-busy", String(sending || readingFile));
  }
  function selectFile(file) {
    if (!file || sending || readingFile) return;
    if (file.size > 2 * 1024 * 1024) {
      notify("O anexo deve ter no máximo 2 MB.");
      return;
    }
    readingFile = true;
    updateControls();
    const reader = new FileReader();
    reader.onload = () => {
      const encoded = String(reader.result).split(",")[1];
      const mime = /^[a-z0-9.+\/-]+$/i.test(file.type) ? file.type : "application/octet-stream";
      attachment = { name: file.name, data: `data:${mime};base64,${encoded}` };
      attachmentName.textContent = `${file.name} · ${Math.ceil(file.size / 1024)} KB`;
      preview.hidden = false;
    };
    reader.onerror = () => notify("Não foi possível ler o arquivo.");
    reader.onloadend = () => {
      readingFile = false;
      fileInput.value = "";
      updateControls();
    };
    reader.readAsDataURL(file);
  }
  input.addEventListener("input", resize);
  document.defaultView.addEventListener("resize", resize);
  input.addEventListener("paste", event => {
    const files = event.clipboardData?.files;
    if (files?.length) {
      event.preventDefault();
      selectFile(files[0]);
      if (files.length > 1) notify("Envie um arquivo por mensagem.");
    }
  });
  attachButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => selectFile(fileInput.files[0]));
  removeAttachment.addEventListener("click", () => {
    attachment = undefined;
    preview.hidden = true;
    input.focus();
  });
  function closeEmojis() {
    emojiPicker.hidden = true;
    emojiToggle.setAttribute("aria-expanded", "false");
  }
  for (const emoji of ["😀", "😊", "😂", "😍", "🥳", "🤔", "😎", "😢", "👍", "👎", "👏", "🙏", "❤️", "💚", "🎉", "✅", "🚀", "🔥", "👋", "💬"]) {
    const choice = document.createElement("button");
    choice.type = "button";
    choice.textContent = emoji;
    choice.setAttribute("aria-label", `Inserir ${emoji}`);
    choice.addEventListener("click", () => {
      if (input.value.length + emoji.length > input.maxLength) return;
      input.setRangeText(emoji, input.selectionStart, input.selectionEnd, "end");
      resize();
      closeEmojis();
      input.focus();
    });
    emojiPicker.append(choice);
  }
  emojiToggle.addEventListener("click", () => {
    emojiPicker.hidden = !emojiPicker.hidden;
    emojiToggle.setAttribute("aria-expanded", String(!emojiPicker.hidden));
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeEmojis();
  });
  resize();
  return {
    onSubmit(handler) {
      form.addEventListener("submit", event => {
        event.preventDefault();
        if (readingFile) return;
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
    getAttachment: () => attachment,
    clear() {
      input.value = "";
      attachment = undefined;
      preview.hidden = true;
      resize();
    },
    setSending(value) {
      sending = value;
      closeEmojis();
      updateControls();
      if (!value) input.focus();
    },
    setConnected(connected) {
      connectionStatus.textContent = connected ? "Conectado" : "Reconectando…";
      connectionStatus.classList.toggle("offline", !connected);
    },
    addMessage({ text, mine, senderId, type, participant, attachment: file }) {
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
      if (file) {
        const link = document.createElement("a");
        link.className = "message-attachment";
        link.href = "#";
        link.textContent = `↓ ${file.name}`;
        link.addEventListener("click", async event => {
          event.preventDefault();
          try {
            const blob = await (await fetch(file.data)).blob();
            const url = URL.createObjectURL(blob);
            const download = document.createElement("a");
            download.href = url;
            download.download = file.name;
            document.body.append(download);
            download.click();
            download.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch {
            notify("Não foi possível baixar o anexo.");
          }
        });
        if (/^data:image\/(png|jpeg|gif|webp);base64,/.test(file.data)) {
          const image = document.createElement("img");
          image.src = file.data;
          image.alt = file.name;
          image.className = "attachment-image";
          image.addEventListener("load", () => { messages.scrollTop = messages.scrollHeight; });
          bubble.append(image);
        }
        bubble.append(link);
      }
      wrap.append(sender, bubble);
      row.append(wrap);
      messages.append(row);
      messages.scrollTop = messages.scrollHeight;
    },
    notify,
  };
}
