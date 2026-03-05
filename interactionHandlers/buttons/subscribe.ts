import { IHandler } from "../../interfaces/IHandler";
import { createLogger } from "../../utils/logger";

const log = createLogger("Subscribe");

export default class Subscribe implements IHandler {
  name = "subscribe";

  async execute(interaction) {
    const role_name = interaction.customId.split("_")[1];

    interaction.message.guild.roles
      .fetch()
      .then((roles) => {
        const hasRole = interaction.member.roles.cache.some(
          (role) => role.name === role_name
        );

        if (!hasRole) {
          interaction.member.roles
            .add(roles.find((val) => val.name === role_name))
            .catch((err) => log.error("Failed to add role:", err));
          interaction
            .reply({ ephemeral: true, content: "Added role " + role_name })
            .catch((err) => log.error("Failed to reply:", err));
        } else {
          interaction.member.roles
            .remove(roles.find((val) => val.name === role_name))
            .catch((err) => log.error("Failed to remove role:", err));
          interaction
            .reply({ ephemeral: true, content: "Removed role " + role_name })
            .catch((err) => log.error("Failed to reply:", err));
        }
      })
      .catch((err) => {
        log.error("Failed to fetch roles:", err);
        interaction
          .reply({ ephemeral: true, content: "Failed to update role." })
          .catch((e) => log.error("Failed to reply with error:", e));
      });
  }
}
