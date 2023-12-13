const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  name: "create-event",
  data: new SlashCommandBuilder()
    .setName("create-event")
    .setDescription("Create a new pocket party event!")
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("Game or name of event")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("minplayers")
        .setDescription("The minimum attendees of your event")
        .setRequired(true)
    ),
  isGuild: true,
  async execute(interaction) {
    const title = interaction.options.getString("title");
    const minPlayers = interaction.options.getInteger("minplayers");

    await globalThis.client.prisma.pocketEvents.create({
      data: {
        Title: title,
        MinPlayers: minPlayers,
        Creator: interaction.user.id,
      },
    });

    interaction.reply({
      content: "Event created!",
      ephemeral: true,
    });
  },
};
