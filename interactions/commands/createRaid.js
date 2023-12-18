const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  name: "create-raid",
  data: new SlashCommandBuilder()
    .setName("create-raid")
    .setDescription("Add a new raid to the available raids list!")
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("Game or name of the raid")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("minplayers")
        .setDescription("The minimum attendees of your raid")
        .setRequired(true)
    ),
  isGuild: true,
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

    interaction.reply({
      content: "Raid created!",
      ephemeral: true,
    });
  },
};
