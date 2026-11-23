function createMessage({ text, senderId, participant, attachment }, { generateId }) {
  if (typeof text !== "string" || (!text.trim() && !attachment)) {
    throw new Error("Escreva uma mensagem antes de enviar.");
  }
  const content = text.trim();
  if (content.length > 4000) {
    throw new Error("A mensagem deve ter no máximo 4000 caracteres.");
  }
  if (typeof senderId !== "string" || !senderId) {
    throw new Error("Não foi possível identificar a conexão.");
  }
  let file;
  if (attachment) {
    const { name, data } = attachment;
    if (typeof name !== "string" || !name.trim() || name.length > 255 ||
        typeof data !== "string" || data.length > 2_800_000 ||
        !/^data:[a-z0-9.+\/-]+;base64,/i.test(data)) {
      throw new Error("Anexo inválido. Use um arquivo de até 2 MB.");
    }
    const encoded = data.slice(data.indexOf(",") + 1);
    if (Buffer.from(encoded, "base64").toString("base64") !== encoded) {
      throw new Error("O conteúdo do anexo é inválido.");
    }
    if (Buffer.byteLength(encoded, "base64") > 2 * 1024 * 1024) {
      throw new Error("O anexo deve ter no máximo 2 MB.");
    }
    file = { name: name.trim(), data };
  }
  return Object.freeze({
    id: generateId(), text: content, senderId,
    ...(participant && { participant }), ...(file && { attachment: file }),
  });
}

module.exports = { createMessage };
