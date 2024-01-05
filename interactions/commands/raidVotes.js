const { SlashCommandBuilder } = require("discord.js");
const { RaidModule } = require("../../islander/RaidModule");

module.exports = {
  name: "raid-votes",
  data: new SlashCommandBuilder()
    .setName("raid-votes")
    .setDescription("Check the votes on a raid that is currently in scheduling")
    .addIntegerOption((option) =>
      option
        .setName("raid")
        .setDescription("The raid ID to check the votes on")
        .setRequired(true)
    ),
  isGuild: false,
  async execute(interaction) {
    const raidID = interaction.options.getInteger("raid");
    let results = await RaidModule.showVotes(raidID);

    interaction.reply({
      embeds: [results],
      ephemeral: true,
    });
  },
};
