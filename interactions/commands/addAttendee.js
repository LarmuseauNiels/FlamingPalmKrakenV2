const { SlashCommandBuilder } = require("discord.js");
const moment = require('moment-timezone');
const {RaidModule} = require("../../islander/RaidModule");

module.exports = {
    name: "add-attendee",
    data: new SlashCommandBuilder()
        .setName("add-attendee")
        .setDescription("Add a schedule option to a custom raid")
        .addIntegerOption((option) =>
            option
                .setName("raid")
                .setDescription("The raid to add a schedule to")
                .setAutocomplete(true)
                .setRequired(true)
        )
        .addUserOption((option) =>
            option
                .setName("user")
                .setDescription("User to add to the raid")
                .setRequired(true)
        ),
    async execute(interaction) {
        const raidId = interaction.options.getInteger("raid");
        const user = interaction.options.getUser("user");

        await RaidModule.AddAttendeeToRaid(raidId, user.id);

        interaction.reply({
            content: `Successfully added ${user.username} to raid ${raidId}!`,
            ephemeral: true,
        });


    },
    /**
     * @param {{ user: { id: any; }; options: { getFocused: () => any; }; respond: (arg0: { name: string; value: string; }[]) => void; }} interaction
     */
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