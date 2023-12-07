const { SlashCommandBuilder } = require("discord.js");
module.exports = {
  name: "toggle-achievement-notifications",
  data: new SlashCommandBuilder()
    .setName("toggle-achievement-notifications")
    .setDescription("toggle if you receive notifications for achievements"),
  async execute(interaction) {
    let isEnabling = true;
    let result = await global.client.prisma.members.findUnique({
      where: {
        ID: interaction.user.id,
      },
      select: {
        AchievementNotifications: true,
      },
    });
    if (result.AchievementNotifications) {
      isEnabling = false;
    }
    await global.client.prisma.members.update({
      where: {
        ID: interaction.user.id,
      },
      data: {
        AchievementNotifications: isEnabling,
      },
    });
    interaction.reply({
      content: `You have ${
        isEnabling ? "enabled" : "disabled"
      } achievement notifications`,
      ephemeral: true,
    });
  },
};
