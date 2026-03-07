import axios from "axios";
import { PermissionFlagsBits } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { createLogger } from "../../utils/logger";

const log = createLogger("PelicanControl");

const SIGNAL_LABELS: Record<string, string> = {
  start:   "started",
  restart: "restarted",
  stop:    "stopped",
};

export default class PelicanControl implements IHandler {
  // customId format: pelican_<action>_<serverId>
  // The router splits by '_' and matches on the first segment ("pelican")
  name = "pelican";

  async execute(interaction: any): Promise<void> {
    // Only allow members with Manage Guild or Administrator permission
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: "You don't have permission to control servers.",
        ephemeral: true,
      });
      return;
    }

    // Parse: pelican_<action>_<serverId>
    const parts    = interaction.customId.split("_");
    const action   = parts[1];
    const serverId = parts[2];

    if (!action || !serverId || !SIGNAL_LABELS[action]) {
      await interaction.reply({ content: "Invalid button action.", ephemeral: true });
      return;
    }

    const baseUrl = process.env.PELICAN_URL?.replace(/\/$/, "");
    const apiKey  = process.env.PELICAN_API_KEY;

    if (!baseUrl || !apiKey) {
      await interaction.reply({
        content: "Pelican is not configured on this bot.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await axios.post(
        `${baseUrl}/api/client/servers/${serverId}/power`,
        { signal: action },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          timeout: 10000,
        }
      );

      // Strip the leading state emoji from the embed title to get the server name
      const embedTitle = interaction.message?.embeds[0]?.title ?? "";
      const serverName = embedTitle.replace(/^\S+ /, "") || serverId;

      await interaction.editReply({
        content: `**${serverName}** ${SIGNAL_LABELS[action]} successfully.`,
      });

      log.info(`${interaction.user.tag} sent "${action}" signal to server ${serverId}`);
    } catch (err: any) {
      const status = err?.response?.status;
      const msg    = status === 409
        ? "The server is already in that state."
        : status === 404
          ? "Server not found."
          : "Failed to send the power signal. Check the logs for details.";

      log.error(`Failed to send "${action}" to server ${serverId}:`, err);
      await interaction.editReply({ content: msg });
    }
  }
}
