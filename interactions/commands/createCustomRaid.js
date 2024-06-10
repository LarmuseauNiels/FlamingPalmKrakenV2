const { SlashCommandBuilder } = require("discord.js");
module.exports = {
    name: "custom-raid",
    data: new SlashCommandBuilder()
        .setName("custom-raid")
        .setDescription("Initiate a new raid without preset times, so you can add your own!")
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
                    "The minimum players needed to pick a time"
                )
                .setRequired(true)
        ),
    isGuild: false,
    async execute(interaction) {
        const title = interaction.options.getString("title");
        const minPlayers = interaction.options.getInteger("minplayers");

        let newraid = await global.client.prisma.raids.create({
            data: {
                Title: title,
                MinPlayers: minPlayers,
                Creator: interaction.user.id,
                Status: 5
            },
        });
        interaction.reply({
            content:
                "Successfully created a custom raid! you can add your own scheduling options to raid id: " + newraid.ID + " by typing /add-schedule",
            ephemeral: true,
        });
    },
};
