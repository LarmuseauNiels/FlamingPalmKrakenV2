const { SlashCommandBuilder } = require("discord.js");
module.exports = {
  name: "website",
  data: new SlashCommandBuilder()
    .setName("toggle-achievement-notifications")
    .setDescription("toggle if you receive notifications for achievements"),
  async execute(interaction) {
    let isEnabling = true;
    global.client.prisma.members
      .findFirst({
        where: {
          ID: interaction.user.id,
        },
        select: {
          AchievementNotifications: true,
        },
      })
      .then((result) => {
        console.log(result);
        if (result) {
          isEnabling = false;
        }

        global.client.prisma.members.update({
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
      });
  },
};
