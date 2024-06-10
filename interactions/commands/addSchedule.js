const { SlashCommandBuilder } = require("discord.js");
const moment = require('moment-timezone');
const {RaidModule} = require("../../islander/RaidModule");

module.exports = {
    name: "add-schedule",
    data: new SlashCommandBuilder()
        .setName("add-schedule")
        .setDescription("Add a schedule option to a custom raid")
        .addIntegerOption((option) =>
            option
                .setName("raid")
                .setDescription("The raid to add a schedule to")
                .setAutocomplete(true)
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName("datetime")
                .setDescription("YYYY-MM-DD HH:MM")
                .setRequired(true)
        )
        .addStringOption((option) =>
                option
                    .setName("timezone")
                    .setDescription("Select the timezone for the schedule")
                    .setRequired(true)
                    .addChoices(
                        {name : "Pacific Time (LA)", value : "America/Los_Angeles"},
                            {name : "Mountain Time (Denver)", value : "America/Denver"},
                            {name : "Central Time (Chicago)", value : "America/Chicago"},
                            {name : "Eastern Time (NY)", value : "America/New_York"},
                            {name : "BST (London)", value : "Europe/London"},
                            {name : "CET (Brussels)", value : "Europe/Brussels"},
                            {name : "EET (Sofia)", value : "Europe/Sofia"},
                            {name : "MSK (Moscow)", value : "Asia/Beirut"},
                            {name : "UAE-ST (Dubai)", value : "Asia/Dubai" },
                    )
        ),
    async execute(interaction) {
        const raidId = interaction.options.getInteger("raid");
        const schedule = interaction.options.getString("datetime");
        const timezone = interaction.options.getString("timezone");

        const date = moment.tz(schedule, timezone);
        await RaidModule.AddSingleSchedulingOptionToRaid(raidId, date.toDate());

        interaction.reply({
            content: `Successfully added a scheduling option <t:${date.unix()}:f> to raid ${raidId}!`,
            ephemeral: true,
        });
    },
    async autocomplete(interaction) {
        global.client.prisma.raids.findMany({
            where: {
                Status: 5,
                Creator: interaction.user.id
            },
            select: {
                ID: true,
                Title: true
            }
        }).then(async (raids) => {
            const focusedValue = interaction.options.getFocused();
            const options = raids
                .filter((raid) =>
                    raid.Title.toLowerCase().includes(focusedValue.toLowerCase())
                )
                .map((raid) => {
                    return {
                        name: raid.Title,
                        value: raid.ID.toString(),
                    };
                });
            interaction.respond(options);
        });
    },
};