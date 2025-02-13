const { SlashCommandBuilder } = require("discord.js");
const { ChannelUpdates } = require("../../islander/ChannelUpdates");

module.exports = {
  name: "create-raid",
  data: new SlashCommandBuilder()
    .setName("create-raid")
    .setDescription("Initiate a new raid and add it to the list!")
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("Name of the game/raid")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("minplayers")
        .setDescription(
          "The minimum players needed to start scheduling the raid"
        )
        .setRequired(true)
    ),
  isGuild: false,
  async execute(interaction) {
    const title = interaction.options.getString("title");
    const minPlayers = interaction.options.getInteger("minplayers");

    await global.client.prisma.raids.create({
      data: {
        Title: title,
        MinPlayers: minPlayers,
        Creator: interaction.user.id,
      },
    });
    ChannelUpdates.MessageWithRaid("New raid created: " + title);
    interaction.reply({
      content:
        "Successfully created a new raid! Check out the updated list by typing /raids.",
      ephemeral: true,
    });
  },
};
