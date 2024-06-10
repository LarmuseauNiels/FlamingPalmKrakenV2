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
        .addIntegerOption((option) =>
            option
                .setName("Month")
                .setDescription("Month")
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(12)
        )
        .addIntegerOption((option) =>
            option
                .setName("Day")
                .setDescription("Day")
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(31)
        )
        .addIntegerOption((option) =>
            option
                .setName("Hour")
                .setDescription("Hour")
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(23)
        )
        .addIntegerOption((option) =>
            option
                .setName("Minute")
                .setDescription("Minute")
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(59)
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
        //const schedule = interaction.options.getString("datetime");
        const timezone = interaction.options.getString("timezone");
        const month = interaction.options.getInteger("Month");
        const day = interaction.options.getInteger("Day");
        const hour = interaction.options.getInteger("Hour");
        const minute = interaction.options.getInteger("Minute");
        let year = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;
        if (month < currentMonth) {
            year++;
        }
        const schedule = `${year}-${month}-${day} ${hour}:${minute}`;
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