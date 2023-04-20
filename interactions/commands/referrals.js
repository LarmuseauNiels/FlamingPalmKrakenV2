const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  name: "referrals",
  data: new SlashCommandBuilder()
    .setName("referrals")
    .setDescription("shows your referrals"),

  async execute(interaction) {
    // add the code for showing user's referrals here
    let member = await global.client.prisma.members.findUnique({
      where: { ID: interaction.user.id },
      include: {
        Refferals_MembersToRefferals_refferer: true,
      },
    });
  },
  isGuild: true,
};
