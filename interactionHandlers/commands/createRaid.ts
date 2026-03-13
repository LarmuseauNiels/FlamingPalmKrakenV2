import { SlashCommandBuilder } from "discord.js";
import { ChannelUpdates } from "../../islander/ChannelUpdates";
import { IHandler } from "../../interfaces/IHandler";
import { createLogger } from "../../utils/logger";

const log = createLogger("CreateRaid");

export default class CreateRaidCommand implements IHandler {
  name = "create-raid";
  isGuild = false;
  data = new SlashCommandBuilder()
    .setName("create-raid")
    .setDescription("Initiate a new raid and add it to the list!")
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("Name of the game/raid")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("minplayers")
        .setDescription(
          "The minimum players needed to start scheduling the raid"
        )
        .setRequired(true)
    ) as SlashCommandBuilder;
  async execute(interaction: any) {
    const title = interaction.options.getString("title");
    const minPlayers = interaction.options.getInteger("minplayers");

    if (minPlayers < 2) {
      await interaction.reply({
        content: "Minimum players must be at least 2.",
        ephemeral: true,
      });
      return;
    }
    if (minPlayers > 20) {
      await interaction.reply({
        content: "Minimum players cannot exceed 20.",
        ephemeral: true,
      });
      return;
    }

    await global.client.prisma.raids.create({
      data: {
        Title: title,
        MinPlayers: minPlayers,
        Creator: interaction.user.id,
      },
    });
    ChannelUpdates.MessageWithRaid("New raid created: " + title).catch((err) =>
      log.error("Failed to send raid channel update:", err)
    );
    interaction
      .reply({
        content:
          "Successfully created a new raid! Check out the updated list by typing /raids.",
        ephemeral: true,
      })
      .catch((err) => log.error("Failed to reply:", err));
  }
}
