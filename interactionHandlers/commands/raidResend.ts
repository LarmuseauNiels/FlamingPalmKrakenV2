import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { RaidModule } from "../../modules/RaidModule";
import { IHandler } from "../../interfaces/IHandler";

export default class RaidResendCommand implements IHandler {
  name = "raid-resend";
  isGuild = true;
  data = new SlashCommandBuilder()
    .setName("raid-resend")
    .setDescription("resend raid scheduling message")
    .addIntegerOption((option) =>
      option.setName("raid").setDescription("The raid ID").setRequired(true)
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to resend the raid message to")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ) as SlashCommandBuilder;

  async execute(interaction: any) {
    const raidID = interaction.options.getInteger("raid");
    const user = interaction.options.getUser("user");
    await interaction.deferReply({ ephemeral: true });
    const result = await RaidModule.resendRaid(raidID, user);
    await interaction.editReply({
      content: result,
      ephemeral: true,
    });
  }
}
