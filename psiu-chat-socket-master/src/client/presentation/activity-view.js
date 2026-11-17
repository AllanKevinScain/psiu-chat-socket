const status = document.querySelector("#status");
const list = document.querySelector("#events");
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const actions = new Map([
  ["entrou no chat", { label: "Conectou" }],
  ["desconectou", { label: "Desconectou" }],
  ["reconectou", { label: "Reconectou" }],
  ["instância desligada", { label: "Desligou", indicator: "X" }],
  ["instância iniciada", { label: "Ligou", indicator: "V" }],
]);
let lastSnapshot;

function renderEvent(event) {
  const row = document.createElement("li");
  const date = new Date(event.time);
  const { label, indicator } = actions.get(event.action) ?? { label: event.action };
  const time = document.createElement("time");
  time.dateTime = event.time;
  time.textContent = `${timeFormatter.format(date)} - ${dateFormatter.format(date)}`;
  const instance = document.createElement("span");
  instance.className = "instance";
  instance.textContent = indicator ?? event.instance;
  row.append(time, ` - ${event.actor} - ${label}`, document.createElement("br"), instance);
  return row;
}

async function refresh() {
  try {
    const response = await fetch("/historico/eventos", { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Histórico indisponível.");
    const snapshot = await response.text();
    if (snapshot !== lastSnapshot) {
      const events = JSON.parse(snapshot);
      list.replaceChildren(...events.map(renderEvent));
      lastSnapshot = snapshot;
    }
    status.textContent = list.childElementCount ? "" : "Nenhum evento registrado.";
  } catch {
    status.textContent = "Histórico temporariamente indisponível. Tentando novamente…";
  } finally {
    setTimeout(refresh, 2000);
  }
}

refresh();
