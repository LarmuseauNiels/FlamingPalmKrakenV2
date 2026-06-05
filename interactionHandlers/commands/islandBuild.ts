import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { IslanderModule } from "../../islander/IslanderModule";
import { levelStats } from "../../islander/data/balance";
import { createLogger } from "../../utils/logger";

const log = createLogger("IslandBuildCommand");

// /build <building> — start constructing a new building on your island.
export default class IslandBuildCommand implements IHandler {
  name = "build";
  isGuild = true;
  data = new SlashCommandBuilder()
    .setName("build")
    .setDescription("Construct a new building on your island")
    .addStringOption((opt) =>
      opt
        .setName("building")
        .setDescription("Which building to construct")
        .setRequired(true)
        .setAutocomplete(true)
    ) as SlashCommandBuilder;

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const key = interaction.options.getString("building", true);
      const res = await IslanderModule.startBuild(interaction.user.id, key);
      await interaction.editReply({ content: res.message });
    } catch (error) {
      log.error("build failed:", error);
      await interaction.editReply({ content: "Something went wrong." });
    }
  }

  async autocomplete(interaction: AutocompleteInteraction) {
    try {
      const island = await IslanderModule.fetch(interaction.user.id);
      const typed = interaction.options.getFocused().toString().toLowerCase();
      const lines = island ? IslanderModule.buildableLines(island) : [];
      const choices = lines
        .filter((l) => l.tierNames[0].toLowerCase().includes(typed))
        .slice(0, 25)
        .map((l) => {
          const s = levelStats(l, 1);
          return {
            name: `${l.tierNames[0]} — 🪵${s.wood} 🪨${s.stone}${s.food ? ` 🍖${s.food}` : ""}`,
            value: l.key,
          };
        });
      await interaction.respond(choices);
    } catch (error) {
      log.error("build autocomplete failed:", error);
      await interaction.respond([]).catch(() => {});
    }
  }
}
