import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from "discord.js";
import { RaidModule } from "../../modules/RaidModule";
import { IHandler } from "../../interfaces/IHandler";

export default class CrAddAttendeeHandler implements IHandler {
  name = "cr-add-attendee";
  data = new SlashCommandBuilder()
    .setName("cr-add-attendee")
    .setDescription("add a attendee to the raid")
    .addIntegerOption((option) =>
      option
        .setName("raid")
        .setDescription("The raid to add attendee to")
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addUserOption((option) =>
      option
        .setName("attendee")
        .setDescription("Attendee to add to the raid")
        .setRequired(true)
    ) as SlashCommandBuilder;

  async execute(interaction: ChatInputCommandInteraction) {
    const raidId = interaction.options.getInteger("raid");
    const user = interaction.options.getUser("attendee");

    await RaidModule.AddAttendeeToRaid(raidId, user.id);

    interaction.reply({
      content: `Successfully added ${user.username} to raid ${raidId}!`,
      ephemeral: true,
    });
  }

  async autocomplete(interaction: AutocompleteInteraction) {
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
