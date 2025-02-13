const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  name: "referrals",
  data: new SlashCommandBuilder()
    .setName("referrals")
    .setDescription("shows your referrals"),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    // add the code for showing user's referrals here
    let member = await global.client.prisma.members.findUnique({
      where: { ID: interaction.user.id },
      include: {
        Refferals_MembersToRefferals_refferer: {
          include: {
            Members_MembersToRefferals_userid: true,
          },
        },
      },
    });
    console.log(member);

    let fields = member.Refferals_MembersToRefferals_refferer.map((r) => {
      return {
        name: `${r.Members_MembersToRefferals_userid.DisplayName}`,
        value: `MemberReward: ${r.RegularRewarded != null}, RegularReward: ${
          r.RegularRewarded != null
        }`,
        inline: false,
      };
    });

    let embed = new EmbedBuilder()
      .setColor("#FD8612")
      .setTitle(
        `You have ${member.Refferals_MembersToRefferals_refferer.length} referrals`
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
    await interaction.editReply({ embeds: [embed], ephemeral: true });
  },
  isGuild: true,
};
