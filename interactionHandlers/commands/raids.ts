import { SlashCommandBuilder } from "discord.js";
import { RaidModule } from "../../modules/RaidModule";
import { IHandler } from "../../interfaces/IHandler";

export default class RaidsCommand implements IHandler {
  name = "raids";
  data = new SlashCommandBuilder()
    .setName("raids")
    .setDescription("See all the available raids!");
  isGuild = false;

  async execute(interaction: any) {
    const message = await RaidModule.getRaidMessage();
    await interaction.reply({
      embeds: message.embeds,
      components: message.components,
      ephemeral: true,
    });
  }
}
