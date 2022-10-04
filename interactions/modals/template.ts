import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

module.exports = {
  name: "template",
  async execute(interaction) {
    interaction.reply("This is a template");
  },
};
