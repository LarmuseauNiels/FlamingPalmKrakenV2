import {
  SlashCommandBuilder,
  EmbedBuilder,
  CommandInteraction,
  InteractionEditReplyOptions,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";

export default class ReferralsHandler implements IHandler {
  name = "referrals";
  data = new SlashCommandBuilder()
    .setName("referrals")
    .setDescription("shows your referrals") as SlashCommandBuilder;

  async execute(interaction: CommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const member = await global.client.prisma.members.findUnique({
      where: { ID: interaction.user.id },
      include: {
        Refferals_MembersToRefferals_refferer: {
          include: {
            Members_MembersToRefferals_userid: true,
          },
        },
      },
    });

    const fields =
      member?.Refferals_MembersToRefferals_refferer.map((r) => ({
        name: `${r.Members_MembersToRefferals_userid.DisplayName}`,
        value: `MemberReward: ${r.RegularRewarded != null}, RegularReward: ${
          r.RegularRewarded != null
        }`,
        inline: false,
      })) || [];

    const embed = new EmbedBuilder()
      .setColor("#FD8612")
      .setTitle(
        `You have ${
          member?.Refferals_MembersToRefferals_refferer.length || 0
        } referrals`
      )
      .setDescription(
        "Ongoing referrals, check with administrator if a reward has not yet been given"
      )
      .addFields(fields)
      .setFooter({
        text: "Niels2398 FPG kraken bot",
        iconURL:
          "https://flamingpalm.com/assets/images/logo/FlamingPalmLogoSmall.png",
      });

    await interaction.editReply({
      embeds: [embed],
      ephemeral: true,
    } as InteractionEditReplyOptions);
  }
}
