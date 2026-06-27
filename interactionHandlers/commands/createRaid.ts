import { SlashCommandBuilder } from "discord.js";
import { ChannelUpdates } from "../../islander/ChannelUpdates";
import { IHandler } from "../../interfaces/IHandler";
import { RaidModule } from "../../modules/RaidModule";
import { RaidScheduler } from "../../modules/RaidScheduler";
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

    const raid = await global.client.prisma.raids.create({
      data: {
        Title: title,
        MinPlayers: minPlayers,
        Creator: interaction.user.id,
      },
    });

    // Auto-enlist the creator as the first participant. Use the silent
    // low-level helper (not AddUserToRaid) to avoid a redundant "has joined the
    // raid" message on top of the "New raid created" update below, then run the
    // scheduling check so a minplayers:1 raid still advances immediately.
    try {
      await RaidModule.AddAttendeeToRaid(raid.ID, interaction.user.id);
      await RaidScheduler.SchedulingCreationCheck(raid.ID);
    } catch (err) {
      log.error("Failed to auto-enlist raid creator:", err);
    }

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
