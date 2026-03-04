import { SlashCommandBuilder } from "discord.js";
import { RaidModule } from "../../modules/RaidModule";
import { IHandler } from "../../interfaces/IHandler";

export default class RaidVotesCommand implements IHandler {
  name = "raid-votes";
  isGuild = false;

  data = new SlashCommandBuilder()
    .setName("raid-votes")
    .setDescription("Check the votes on a raid that is currently in scheduling")
    .addIntegerOption((option) =>
      option
        .setName("raid")
        .setDescription("The raid ID to check the votes on")
        .setRequired(true)
    ) as SlashCommandBuilder;

  async execute(interaction: any) {
    const raidID = interaction.options.getInteger("raid");
    await interaction.deferReply({ ephemeral: true });
    const results = await RaidModule.showVotes(raidID);

    await interaction.editReply({
      embeds: [results],
      ephemeral: true,
    });
  }
}
