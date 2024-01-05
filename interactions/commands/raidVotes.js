const { SlashCommandBuilder } = require("discord.js");
const { RaidModule } = require("../../islander/RaidModule");

module.exports = {
  name: "raid-votes",
  data: new SlashCommandBuilder()
    .setName("raid-votes")
    .setDescription("Check the votes on a raid that is currently in scheduling")
    .addIntegerOption((option) =>
      option
        .setName("raidID")
        .setDescription("The raid ID to check the votes on")
        .setRequired(true)
    ),
  isGuild: false,
  async execute(interaction) {
    const raidID = interaction.options.getInteger("raidID");
    let results = RaidModule.showVotes(raidID);

    interaction.reply({
      content: "",
      embeds: [results],
      ephemeral: true,
    });
  },
};
