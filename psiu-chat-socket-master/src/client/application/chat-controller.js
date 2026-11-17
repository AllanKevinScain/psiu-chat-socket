// view: onSubmit, getText, clear, setSending, addMessage, notify.
// gateway: onMessage, onConnectionChange, send.
// As implementações são recebidas na inicialização (injeção de dependências).
export function createChatController({ view, gateway }) {
  let sending = false;
  async function sendMessage() {
    if (sending) return;
    const text = view.getText().trim();
    if (!text) return;
    sending = true;
    view.setSending(true);
    try {
      await gateway.send(text);
      view.clear();
    } catch (error) {
      view.notify(error.message);
    } finally {
      sending = false;
      view.setSending(false);
    }
  }
  function start() {
    view.onSubmit(sendMessage);
    gateway.onMessage(message => view.addMessage(message));
    gateway.onConnectionChange(connected => {
      if (!connected) view.notify("Sem conexão. Aguardando reconexão para enviar mensagens.");
    });
  }
  return { start };
}
