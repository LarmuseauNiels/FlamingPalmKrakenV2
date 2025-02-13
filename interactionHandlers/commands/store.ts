import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  SlashCommandBuilder,
  ButtonStyle,
  CommandInteraction,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";

export default class StoreHandler implements IHandler {
  name = "store";
  data = new SlashCommandBuilder()
    .setName("store")
    .setDescription("shows the flamingpalm points store");

  async execute(interaction: CommandInteraction) {
    const embed = new EmbedBuilder()
      .setColor("#FD8612")
      .setTitle("Store")
      .setAuthor({
        name: interaction.user.username,
        iconURL:
          "https://cdn.discordapp.com/avatars/" +
          interaction.user.id +
          "/" +
          interaction.user.avatar,
        url: "https://flamingpalm.com",
      })
      .setDescription("Flamingpalm points store")
      .setTimestamp()
      .setFooter({
        text: "Flamingpalm store",
        iconURL:
          "https://flamingpalm.com/assets/images/logo/FlamingPalmLogoSmall.png",
      });

    const rewards = await global.client.prisma.reward.findMany({
      include: { RewardItem: true },
      orderBy: { Price: "asc" },
    });

    rewards.forEach((reward) => {
      if (reward.visible) {
        const stock = reward.RewardItem.filter(
          (x) => x.RedeemedBy === ""
        ).length;
        if (stock === 0) {
          embed.addFields({
            name: reward.Title,
            value: `out of stock`,
            inline: true,
          });
        } else if (reward.nonSalePrice && reward.nonSalePrice > 0) {
          embed.addFields({
            name: reward.Title,
            value: `~~${reward.nonSalePrice}~~ **${reward.Price}:palm_tree:**`,
            inline: true,
          });
        } else {
          embed.addFields({
            name: reward.Title,
            value: `**${reward.Price}:palm_tree:**`,
            inline: true,
          });
        }
      }
    });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setURL(
          "https://discord.com/oauth2/authorize?state=xIMl4hl4dpSusL6n3hahJ6P3IjV8i2O6&scope=identify+guilds&response_type=code&approval_prompt=auto&client_id=534686392589221898&redirect_uri=https%3A%2F%2Fflamingpalm.com%2Flogin"
        )
        .setLabel("Redeem on website")
        .setStyle(ButtonStyle.Link)
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: false,
    });
  }
}
