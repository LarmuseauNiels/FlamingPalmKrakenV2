module.exports = {
  name: "toggleAchievementNotifications",
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
