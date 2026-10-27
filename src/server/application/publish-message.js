const { createMessage } = require("../domain/message");

function createPublishMessage({ broadcaster, generateId }) {
  return ({ text, senderId }) => {
    const message = createMessage({ text, senderId }, { generateId });
    broadcaster.publish(message);
    return message;
  };
}

module.exports = { createPublishMessage };
