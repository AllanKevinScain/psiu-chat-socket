const { createMessage } = require("../domain/message");

function createPublishMessage({ broadcaster, generateId }) {
  return ({ text, senderId }) => {
    const message = createMessage({ text, senderId }, { generateId });
    const publication = broadcaster.publish(message);
    if (typeof publication?.then === "function") return publication.then(() => message);
    return message;
  };
}

module.exports = { createPublishMessage };
