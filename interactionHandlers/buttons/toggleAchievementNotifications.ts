import { IHandler } from "../../interfaces/IHandler";
import { createLogger } from "../../utils/logger";

const log = createLogger("ToggleAchievementNotifications");

export default class ToggleAchievementNotifications implements IHandler {
  name = "toggleAchievementNotifications";

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

        global.client.prisma.members
          .update({
            where: {
              ID: interaction.user.id,
            },
            data: {
              AchievementNotifications: isEnabling,
            },
          })
          .catch((err) =>
            log.error("Failed to update achievement notifications:", err)
          );

        interaction
          .reply({
            content: `You have ${
              isEnabling ? "enabled" : "disabled"
            } achievement notifications`,
            ephemeral: true,
          })
          .catch((err) => log.error("Failed to reply:", err));
      })
      .catch((err) => {
        log.error("Failed to find member:", err);
        interaction
          .reply({ content: "Failed to update settings.", ephemeral: true })
          .catch((e) => log.error("Failed to reply with error:", e));
      });
  }
}
