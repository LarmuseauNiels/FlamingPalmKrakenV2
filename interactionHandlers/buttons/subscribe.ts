import { ButtonInteraction, GuildMember } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";

export default class Subscribe implements IHandler {
  name = "subscribe";

  /** Toggles the role named in the custom id (`subscribe_<role name>`). */
  async execute(interaction: ButtonInteraction) {
    const roleName = interaction.customId.split("_")[1];
    const member = interaction.member;
    if (!interaction.guild || !(member instanceof GuildMember)) {
      await interaction.reply({ ephemeral: true, content: "This button only works inside the server." });
      return;
    }

    const roles = await interaction.guild.roles.fetch();
    const role = roles.find((r) => r.name === roleName);
    if (!role) {
      // Used to reply "Added role" and then fail to add an undefined role.
      throw new Error(`subscribe: no role named "${roleName}"`);
    }

    // Reply only after the change went through, so the message is true.
    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role);
      await interaction.reply({ ephemeral: true, content: "Removed role " + roleName });
    } else {
      await member.roles.add(role);
      await interaction.reply({ ephemeral: true, content: "Added role " + roleName });
    }
  }
}
