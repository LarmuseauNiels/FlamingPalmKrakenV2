const { SlashCommandBuilder } = require("discord.js");
const {RaidModule} = require("../../islander/RaidModule");

module.exports = {
    name: "custom-raid-schedule",
    data: new SlashCommandBuilder()
        .setName("custom-raid-schedule")
        .setDescription("Set a custom raid to scheduling")
        .addIntegerOption((option) =>
            option
                .setName("raid")
                .setDescription("The raid to add a schedule to")
                .setAutocomplete(true)
                .setRequired(true)
        ),
    async execute(interaction) {
        const raidId = interaction.options.getInteger("raid");

        //get raid
        const raid = await global.client.prisma.raids.findUnique({
            where: {
                ID: raidId
            },
            select: {
                ID: true,
                Status: true,
                RaidAttendees: true,
                RaidSchedulingOption: true
            }
        });
        // check if raid is status 5 and has atleast 2 attendees and 2 scheduling options
        if (raid.Status !== 5) {
            interaction.reply({
                content: `Raid ${raidId} is not in the correct status to start scheduling!`,
                ephemeral: true,
            });
            return;
        }
        if (raid.RaidAttendees.length < 2) {
            interaction.reply({
                content: `Raid ${raidId} needs at least 2 attendees to start scheduling!`,
                ephemeral: true,
            });
            return;
        }
        if (raid.RaidSchedulingOption.length < 2) {
            interaction.reply({
                content: `Raid ${raidId} needs at least 2 scheduling options to start scheduling!`,
                ephemeral: true,
            });
            return;
        }

        await global.client.prisma.raids.update({
            where: {
                ID: raidId,
            },
            data: {
                Status: 2,
            },
        });

        await RaidModule.SendSchedulingMessage(raidId);

        interaction.reply({
            content: `Successfully started scheduling for raid ${raidId}!`,
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