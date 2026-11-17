import { ButtonInteraction } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";

export default class ToggleAchievementNotifications implements IHandler {
  name = "toggleAchievementNotifications";

  async execute(interaction: ButtonInteraction) {
    const member = await global.client.prisma.members.findFirst({
      where: { ID: interaction.user.id },
      select: { AchievementNotifications: true },
    });
    if (!member) {
      await interaction.reply({
        content: "You don't have a profile yet — it's created within 15 minutes of joining.",
        ephemeral: true,
      });
      return;
    }

    // Flip the stored setting. (This used to test whether the row existed,
    // which it always does, so it could only ever disable notifications.)
    const isEnabling = !member.AchievementNotifications;
    await global.client.prisma.members.update({
      where: { ID: interaction.user.id },
      data: { AchievementNotifications: isEnabling },
    });

    await interaction.reply({
      content: `You have ${isEnabling ? "enabled" : "disabled"} achievement notifications`,
      ephemeral: true,
    });
  }
}
