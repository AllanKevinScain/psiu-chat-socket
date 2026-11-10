function createMessage({ text, senderId, participant }, { generateId }) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Escreva uma mensagem antes de enviar.");
  }
  const content = text.trim();
  if (content.length > 4000) {
    throw new Error("A mensagem deve ter no máximo 4000 caracteres.");
  }
  if (typeof senderId !== "string" || !senderId) {
    throw new Error("Não foi possível identificar a conexão.");
  }
  return Object.freeze({ id: generateId(), text: content, senderId, ...(participant && { participant }) });
}

module.exports = { createMessage };
