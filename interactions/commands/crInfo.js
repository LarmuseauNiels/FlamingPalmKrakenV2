const { SlashCommandBuilder, EmbedBuilder} = require("discord.js");
const {RaidModule} = require("../../islander/RaidModule");

module.exports = {
    name: "cr-info",
    data: new SlashCommandBuilder()
        .setName("cr-info")
        .setDescription("Get information about a custom raid")
        .addIntegerOption((option) =>
            option
                .setName("raid")
                .setDescription("The raid to get information about")
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
                Title: true,
                MinPlayers: true,
                Status: true,
                Creator: true,
                RaidAttendees: {
                    select: {
                        MemberId: true,
                        Members:{
                            select:{
                                DisplayName: true
                            }
                        }
                    }
                },
                RaidSchedulingOption: {
                    select: {
                        ID: true,
                        Option: true,
                        Timestamp: true
                    }
                }
            }
        });
        const embed = new EmbedBuilder()
            .setColor("#FD8612")
            .setTitle(raid.Title)

        let attendees = raid.RaidAttendees.map((attendee) => attendee.Members.DisplayName).join(",")
        let scheduleOptions = raid.RaidSchedulingOption.map((option) => `${option.Option}:${option.Timestamp}` ).join(",")

        embed.addFields({
            name: "Minimum Players",
            value: raid.MinPlayers.toString(),
            inline: true
        },{
            name: "Status",
            value: raid.Status.toString(),
            inline: true
        },{
            name: "Creator",
            value: raid.Creator.toString(),
            inline: true
        },{
            name: "Attendees",
            value: attendees,
            inline: true
        },{
            name: "Scheduling Options",
            value: scheduleOptions,
            inline: true
        }
        );

        interaction.reply({ embeds: [embed] });

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
    }
};