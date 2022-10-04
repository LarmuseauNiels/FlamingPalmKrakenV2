import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

module.exports = {
  name: "MsgSantaBtn",
  async execute(interaction) {
    let modal = new ModalBuilder()
      .setCustomId("MsgSantaModal")
      .setTitle("Message santa");

    let row: ActionRowBuilder<TextInputBuilder> = new ActionRowBuilder();
    row.addComponents(
      new TextInputBuilder()
        .setCustomId("MsgSantaInput")
        .setPlaceholder("Enter message")
        .setStyle(TextInputStyle.Short)
    );
    modal.addComponents([row]);
    await interaction.showModal({ modal });
  },
};
