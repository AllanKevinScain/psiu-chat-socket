const { randomInt } = require("node:crypto");
const profiles = require("../../assets/100_nomes_com_imagens.json");

function pickParticipant() {
  return profiles[randomInt(profiles.length)];
}

function legacyParticipant(sessionId) {
  return profiles[parseInt(sessionId.slice(0, 8), 16) % profiles.length];
}

module.exports = { pickParticipant, legacyParticipant };
