import { SlashCommandBuilder } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { createLogger } from "../../utils/logger";

const log = createLogger("SetTimezoneCommand");

// IANA timezone list derived from the Intl API (available in Node 21)
const IANA_TIMEZONES: string[] = (Intl as any).supportedValuesOf("timeZone");

export default class SetTimezoneCommand implements IHandler {
  name = "set-timezone";
  data = new SlashCommandBuilder()
    .setName("set-timezone")
    .setDescription("Set your timezone so the bot can parse date/time inputs correctly.")
    .addStringOption((option) =>
      option
        .setName("timezone")
        .setDescription("Your IANA timezone (e.g. Europe/Brussels, America/New_York)")
        .setRequired(true)
        .setAutocomplete(true)
    ) as SlashCommandBuilder;

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const timezone = interaction.options.getString("timezone");

    if (!IANA_TIMEZONES.includes(timezone)) {
      await interaction.editReply({
        content: `**${timezone}** is not a valid IANA timezone. Please select one from the autocomplete list.`,
      });
      return;
    }

    try {
      await global.client.prisma.members.upsert({
        where: { ID: interaction.user.id },
        update: { Timezone: timezone },
        create: { ID: interaction.user.id, Timezone: timezone },
      });

      await interaction.editReply({
        content: `Your timezone has been set to **${timezone}**.`,
      });
    } catch (error) {
      log.error("Failed to set timezone", error);
      await interaction.editReply({
        content: "Something went wrong while saving your timezone. Please try again.",
      });
    }
  }

  async autocomplete(interaction) {
    try {
      const focusedValue = interaction.options.getFocused().toLowerCase();
      const filtered = IANA_TIMEZONES.filter((tz) =>
        tz.toLowerCase().includes(focusedValue)
      ).slice(0, 25);

      await interaction.respond(
        filtered.map((tz) => ({ name: tz, value: tz }))
      );
    } catch (error) {
      log.error("Autocomplete error", error);
      await interaction.respond([]).catch(() => {});
    }
  }
}
