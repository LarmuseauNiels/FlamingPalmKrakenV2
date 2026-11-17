import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from "discord.js";
import { RaidModule } from "../../modules/RaidModule";
import { IHandler } from "../../interfaces/IHandler";
import { respondWithOwnCustomRaids } from "../../modules/RaidAutocomplete";

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
    const raidId = interaction.options.getInteger("raid", true);
    const user = interaction.options.getUser("attendee", true);

    await RaidModule.AddAttendeeToRaid(raidId, user.id);

    await interaction.reply({
      content: `Successfully added ${user.username} to raid ${raidId}!`,
      ephemeral: true,
    });
  }

  async autocomplete(interaction: AutocompleteInteraction) {
    await respondWithOwnCustomRaids(interaction);
  }
}
