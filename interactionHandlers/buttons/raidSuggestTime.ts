import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { buildTimezonePicker, getMemberTimezone } from "../../modules/TimezonePrompt";

export function buildSuggestTimeModal(raidId: string): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`raidCustomTimeModal_${raidId}`)
    .setTitle("Suggest Custom Raid Time");

  const timeInput = new TextInputBuilder()
    .setCustomId("customTime")
    .setLabel("Enter custom date and time")
    .setPlaceholder("e.g., 15/03 18:30, Saturday 20:00")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(timeInput);
  modal.addComponents(row);
  return modal;
}

export default class RaidSuggestTimeHandler implements IHandler {
  name = "raidSuggestTime";

  async execute(interaction: ButtonInteraction) {
    if (!interaction.isButton()) return;

    const raidId = interaction.customId.split("_")[1];

    // A typed time means nothing without a timezone — ask first instead of
    // silently reading "20:00" as UTC. The picker opens the modal afterwards.
    if (!(await getMemberTimezone(interaction.user.id))) {
      await interaction.reply({
        content: "Before you suggest a time: which timezone are you in? (I'll remember it.)",
        components: [buildTimezonePicker(`timezonePick_suggest_${raidId}`, interaction.locale)],
        ephemeral: true,
      });
      return;
    }

    await interaction.showModal(buildSuggestTimeModal(raidId));
  }
}
