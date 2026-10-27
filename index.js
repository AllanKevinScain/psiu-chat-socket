const { createChatServer } = require("./src/server/create-chat-server");
const { server } = createChatServer();
const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log(`psiu running at http://localhost:${port}`);
});
