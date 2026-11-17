import { createChatController } from "./application/chat-controller.js";
import { createSocketChatGateway } from "./infrastructure/socket-chat-gateway.js";
import { createChatView } from "./presentation/chat-view.js";

const view = createChatView(document);
const socket = window.io({ autoConnect: false });
const gateway = createSocketChatGateway(socket, window.sessionStorage);
const chat = createChatController({ view, gateway });
chat.start();
socket.connect();
