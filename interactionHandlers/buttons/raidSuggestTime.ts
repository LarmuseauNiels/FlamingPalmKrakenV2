import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";

export default class RaidSuggestTimeHandler implements IHandler {
  name = "raidSuggestTime";

  async execute(interaction: ButtonInteraction) {
    if (!interaction.isButton()) return;

    const raidId = interaction.customId.split("_")[1];

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

    await interaction.showModal(modal);
  }
}
