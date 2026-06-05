import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { IslanderModule } from "../../islander/IslanderModule";
import { createLogger } from "../../utils/logger";

const log = createLogger("IslandReloadCommand");

// /island-reload — admin-only. Re-seeds the Islander definition tables
// (i_Building / i_BuildingLevel / i_Unit) from islander/data/balance.ts so
// balance changes take effect without a manual DB step. Idempotent (upsert).
export default class IslandReloadCommand implements IHandler {
  name = "island-reload";
  isGuild = true;
  data = new SlashCommandBuilder()
    .setName("island-reload")
    .setDescription("(Admin) Re-seed Islander building/unit definitions from balance data")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) as SlashCommandBuilder;

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      await IslanderModule.reload();
      await interaction.editReply({ content: "✅ Islander definitions re-seeded from balance data." });
    } catch (error) {
      log.error("island-reload failed:", error);
      await interaction.editReply({ content: "Re-seed failed — check the logs." });
    }
  }
}
