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
    .setDescription(
      "shows the flamingpalm points store"
    ) as SlashCommandBuilder;

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
      include: {
        RewardItem: { where: { RedeemedBy: "" }, select: { RewardItemID: true } },
      },
      orderBy: { Price: "asc" },
    });

    // Embeds accept at most 25 fields. Past that `addFields` throws
    // "Invalid number value" and the whole command fails, so keep a slot free
    // for an overflow notice once the store outgrows the limit.
    const MAX_EMBED_FIELDS = 25;
    const visibleRewards = rewards.filter((reward) => reward.visible);
    const shownRewards =
      visibleRewards.length > MAX_EMBED_FIELDS
        ? visibleRewards.slice(0, MAX_EMBED_FIELDS - 1)
        : visibleRewards;

    shownRewards.forEach((reward) => {
      const stock = reward.RewardItem.length;
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
    });

    const hidden = visibleRewards.length - shownRewards.length;
    if (hidden > 0) {
      embed.addFields({
        name: `+${hidden} more`,
        value: "Use the buttons below to see the full store.",
        inline: true,
      });
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setURL(
          `https://discord.com/oauth2/authorize?scope=identify+guilds&response_type=code&approval_prompt=auto&client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.CALLBACK_URL)}`
        )
        .setLabel("Redeem on website")
        .setStyle(ButtonStyle.Link)
    );

    // Only offer the in-Discord storefront once Activities are switched on in
    // the developer portal — launching one otherwise just errors for the user.
    if (process.env.ACTIVITY_ENABLED === "true") {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("openStore")
          .setLabel("Open in Discord")
          .setStyle(ButtonStyle.Primary)
      );
    }

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: false,
    });
  }
}
