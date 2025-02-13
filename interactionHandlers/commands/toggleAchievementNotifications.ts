import { SlashCommandBuilder, CommandInteraction } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";

export default class ToggleAchievementNotificationsHandler implements IHandler {
  name = "toggle-achievement-notifications";
  data = new SlashCommandBuilder()
    .setName("toggle-achievement-notifications")
    .setDescription("toggle if you receive notifications for achievements");

  async execute(interaction: CommandInteraction) {
    let isEnabling = true;
    const result = await global.client.prisma.members.findUnique({
      where: { ID: interaction.user.id },
      select: { AchievementNotifications: true },
    });

    if (result?.AchievementNotifications) {
      isEnabling = false;
    }

    await global.client.prisma.members.update({
      where: { ID: interaction.user.id },
      data: { AchievementNotifications: isEnabling },
    });

    await interaction.reply({
      content: `You have ${
        isEnabling ? "enabled" : "disabled"
      } achievement notifications`,
      ephemeral: true,
    });
  }
}
