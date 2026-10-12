import { EmbedBuilder } from "discord.js";
import { ChannelUpdates } from "../islander/ChannelUpdates";
import { RaidEmbeds } from "./RaidEmbeds";
import { RaidScheduler } from "./RaidScheduler";
import { createLogger } from "../utils/logger";

const log = createLogger("RaidModule");

/**
 * RaidModule handles raid attendance and builds the public-facing raid list UI.
 * Scheduling lifecycle lives in RaidScheduler; embed construction in RaidEmbeds.
 */
export abstract class RaidModule {
  /**
   * Creates a raid with its creator as the first participant, posts it to the
   * raid channel and runs the scheduling check (so a 1-player raid advances
   * straight away). Shared by /create-raid and the Activity's raid board.
   */
  static async CreateRaid(title: string, minPlayers: number, creatorId: string) {
    const raid = await global.client.prisma.raids.create({
      data: {
        Title: title,
        MinPlayers: minPlayers,
        Creator: creatorId,
      },
    });

    // Use the silent low-level helper (not AddUserToRaid) to avoid a redundant
    // "has joined the raid" message on top of the "New raid created" update.
    try {
      await RaidModule.AddAttendeeToRaid(raid.ID, creatorId);
      await RaidScheduler.SchedulingCreationCheck(raid.ID);
    } catch (err) {
      log.error("Failed to auto-enlist raid creator:", err);
    }

    ChannelUpdates.MessageWithRaid("New raid created: " + title).catch((err) =>
      log.error("Failed to send raid channel update:", err)
    );
    return raid;
  }

  static async AddUserToRaid(userId: string, raidId: number) {
    log.info("Adding user to raid");
    await global.client.prisma.raidAttendees.create({
      data: {
        MemberId: userId,
        RaidId: raidId,
      },
    });
    let raid = await global.client.prisma.raids.findFirst({
      where: { ID: raidId },
    });
    await ChannelUpdates.MessageWithRaid(
      `<@${userId}> has joined the raid: ${raid.Title}`
    );
    await RaidScheduler.SchedulingCreationCheck(raidId);
  }

  static async AddAttendeeToRaid(raidId: number, id: string) {
    return global.client.prisma.raidAttendees.create({
      data: {
        RaidId: raidId,
        MemberId: id,
      },
    });
  }

  static async getRaidMessage() {
    const raids = await globalThis.client.prisma.raids.findMany({
      include: { RaidAttendees: true },
      where: { Status: 1 },
    });
    return RaidEmbeds.buildRaidListMessage(raids);
  }

  static async showVotes(raidId: number) {
    let raid = await global.client.prisma.raids.findFirst({
      include: {
        RaidAttendees: true,
        RaidSchedulingOption: true,
      },
      where: { ID: raidId },
    });
    if (raid == null) {
      return null;
    }
    let votes = await RaidScheduler.CollectSchedulingVotes(raid);

    let embed = new EmbedBuilder()
      .setTitle("Votes for raid: " + raid.Title)
      .setDescription("The following votes have been cast: ")
      .setColor("#0099ff");

    votes.forEach((value, key) => {
      let participants = value.length === 0 ? "No votes" : "";
      value.forEach((user) => {
        participants += "<@" + user + ">\n";
      });
      embed.addFields({
        name:
          RaidEmbeds.getUniCodeEmoji(key.Option) +
          " <t:" +
          Math.floor(key.Timestamp.getTime() / 1000) +
          ":F>",
        value: participants,
        inline: false,
      });
    });
    return embed;
  }
}
