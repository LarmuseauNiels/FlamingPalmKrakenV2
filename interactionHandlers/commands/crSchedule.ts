import {
  SlashCommandBuilder,
  CommandInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { RaidModule } from "../../modules/RaidModule";

export default class CrScheduleCommand implements IHandler {
  name = "cr-schedule";
  data = new SlashCommandBuilder()
    .setName("cr-schedule")
    .setDescription("Move custom raid to scheduling phase!")
    .addIntegerOption((option) =>
      option
        .setName("raid")
        .setDescription("The raid move to scheduling phase")
        .setAutocomplete(true)
        .setRequired(true)
    ) as SlashCommandBuilder;

  async execute(interaction: ChatInputCommandInteraction) {
    const raidId = interaction.options.getInteger("raid");

    //get raid
    const raid = await global.client.prisma.raids.findUnique({
      where: {
        ID: raidId,
      },
      select: {
        ID: true,
        Status: true,
        RaidAttendees: true,
        RaidSchedulingOption: true,
      },
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
    if (raid.RaidSchedulingOption.length < 1) {
      interaction.reply({
        content: `Raid ${raidId} needs at least 1 scheduling options to start scheduling!`,
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
  }

  async autocomplete(interaction) {
    global.client.prisma.raids
      .findMany({
        where: {
          Status: 5,
          Creator: interaction.user.id,
        },
        select: {
          ID: true,
          Title: true,
        },
      })
      .then(async (raids) => {
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
}
