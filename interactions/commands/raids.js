const {
  SlashCommandBuilder
} = require("discord.js");
const {RaidModule} = require("../../islander/RaidModule");

module.exports = {
  name: "raids",
  data: new SlashCommandBuilder()
    .setName("raids")
    .setDescription("See all the available raids!"),
  isGuild: false,
  async execute(interaction) {
    let message = await RaidModule.getRaidMessage();
    interaction.reply({
      embeds: message.embeds,
      components: message.components,
      ephemeral: true,
    });
  },
};
