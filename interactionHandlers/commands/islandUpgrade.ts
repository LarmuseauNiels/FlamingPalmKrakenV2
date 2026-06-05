import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { IslanderModule } from "../../islander/IslanderModule";
import { levelStats, tierNameFor } from "../../islander/data/balance";
import { createLogger } from "../../utils/logger";

const log = createLogger("IslandUpgradeCommand");

// /upgrade <building> — upgrade an existing building to its next level.
export default class IslandUpgradeCommand implements IHandler {
  name = "upgrade";
  isGuild = true;
  data = new SlashCommandBuilder()
    .setName("upgrade")
    .setDescription("Upgrade a building on your island")
    .addStringOption((opt) =>
      opt
        .setName("building")
        .setDescription("Which building to upgrade")
        .setRequired(true)
        .setAutocomplete(true)
    ) as SlashCommandBuilder;

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const key = interaction.options.getString("building", true);
      const res = await IslanderModule.startUpgrade(interaction.user.id, key);
      await interaction.editReply({ content: res.message });
    } catch (error) {
      log.error("upgrade failed:", error);
      await interaction.editReply({ content: "Something went wrong." });
    }
  }

  async autocomplete(interaction: AutocompleteInteraction) {
    try {
      const island = await IslanderModule.fetch(interaction.user.id);
      const typed = interaction.options.getFocused().toString().toLowerCase();
      const lines = island ? IslanderModule.upgradeableLines(island) : [];
      const choices = lines
        .filter(({ line, level }) =>
          tierNameFor(line, level).toLowerCase().includes(typed)
        )
        .slice(0, 25)
        .map(({ line, level, next }) => {
          const s = levelStats(line, next);
          return {
            name: `${tierNameFor(line, level)} → Lv ${next} — 🪵${s.wood} 🪨${s.stone}`,
            value: line.key,
          };
        });
      await interaction.respond(choices);
    } catch (error) {
      log.error("upgrade autocomplete failed:", error);
      await interaction.respond([]).catch(() => {});
    }
  }
}
