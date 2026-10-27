import { createChatController } from "./application/chat-controller.js";
import { createSocketChatGateway } from "./infrastructure/socket-chat-gateway.js";
import { createChatView } from "./presentation/chat-view.js";

const view = createChatView(document);
const gateway = createSocketChatGateway(window.io());
const chat = createChatController({ view, gateway });
chat.start();
