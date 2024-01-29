const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { RaidModule } = require("../../islander/RaidModule");

module.exports = {
  name: "raid-resend",
  data: new SlashCommandBuilder()
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
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  isGuild: true,
  async execute(interaction) {
    const raidID = interaction.options.getInteger("raid");
    const user = interaction.options.getUser("user");
    interaction.deferReply({ ephemeral: true });
    let result = await RaidModule.resendRaid(raidID, user);
    await interaction.editReply({
      content: result,
      ephemeral: true,
    });
  },
};
