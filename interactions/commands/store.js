const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  SlashCommandBuilder,
  ButtonStyle,
} = require("discord.js");

module.exports = {
  name: "store",
  data: new SlashCommandBuilder()
    .setName("store")
    .setDescription("shows the flamingpalm points store"),
  async execute(interaction) {
    let embed = new EmbedBuilder()
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
      //.setThumbnail('https://i.imgur.com/AfFp7pu.png')

      //.setImage('https://www.kenney.nl/assets/hexagon-kit/sample.png')
      .setTimestamp()
      .setFooter({
        text: "Work in progress flamingpalm store",
        iconURL: "https://flamingpalm.com/images/FlamingPalmLogoSmall.png",
      });
    let rewards = await client.prisma.reward.findMany({
      include: { RewardItem: true },
      orderBy: { Price: "asc" },
    });
    rewards.forEach((reward) => {
      let stock = reward.RewardItem.filter((x) => x.RedeemedBy == "").length;
      if (stock == 0)
        embed.addFields({
          name: reward.Title,
          value: `out of stock`,
          inline: true,
        });
      else
        embed.addFields({
          name: reward.Title,
          value: `**${reward.Price}:palm_tree:**`,
          inline: true,
        }); //${reward.Description }\n ${stock} key${stock == 1?'':'s'} in stock\n
    });
    let row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setURL("https://flamingpalm.com/members")
        .setLabel("Redeem on website")
        .setStyle(ButtonStyle.Link)
    );
    interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
  },
  isGuild: true,
};
