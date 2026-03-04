import { EmbedBuilder } from "discord.js";
import { ChannelUpdates } from "../islander/ChannelUpdates";
import { RaidEmbeds } from "./RaidEmbeds";
import { RaidScheduler } from "./RaidScheduler";

/**
 * RaidModule handles raid attendance and builds the public-facing raid list UI.
 * Scheduling lifecycle lives in RaidScheduler; embed construction in RaidEmbeds.
 */
export abstract class RaidModule {
  static async AddUserToRaid(userId: string, raidId: number) {
    console.log("Adding user to raid");
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
