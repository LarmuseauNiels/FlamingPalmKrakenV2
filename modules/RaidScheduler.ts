import {
  EmbedBuilder,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  MessageCreateOptions,
  User,
} from "discord.js";
import { RaidAttendees, Raids, RaidSchedulingOption } from "@prisma/client";
import { RaidEmbeds } from "./RaidEmbeds";
import { createLogger } from "../utils/logger";

const log = createLogger("RaidScheduler");

export abstract class RaidScheduler {
  static async getRaid(raidId: number) {
    return global.client.prisma.raids.findFirst({
      include: {
        RaidAttendees: true,
        RaidSchedulingOption: true,
      },
      where: {
        ID: raidId,
        Status: 2,
      },
    });
  }

  static async SchedulingCreationCheck(raidId: number) {
    log.info("Checking if raid is ready for scheduling");
    let raid = await global.client.prisma.raids.findFirst({
      include: {
        RaidAttendees: true,
      },
      where: {
        ID: raidId,
        Status: 1,
      },
    });

    if (raid == null) {
      log.warn("Raid not found");
      return;
    }

    log.info(
      "Raid found with " +
        raid.RaidAttendees.length +
        " attendees out of " +
        raid.MinPlayers +
        " required"
    );
    if (raid.RaidAttendees.length >= raid.MinPlayers) {
      log.info("Raid is starting scheduling");

      await global.client.prisma.raids.update({
        where: { ID: raidId },
        data: { Status: 2 },
      });

      // Find next tuesday; if less than 3 days away, skip to the following week
      let firstSchedulingOption = new Date();
      firstSchedulingOption.setDate(
        firstSchedulingOption.getDate() +
          ((2 + 7 - firstSchedulingOption.getDay()) % 7)
      );
      if (firstSchedulingOption.getTime() - new Date().getTime() < 259200000) {
        firstSchedulingOption.setDate(firstSchedulingOption.getDate() + 7);
      }
      log.info("Scheduling starts on " + firstSchedulingOption);

      await this.AddDayToRaidSchedulingOptions(raidId, firstSchedulingOption);
      await this.SendSchedulingMessage(raidId);
    }
  }

  static async AddDayToRaidSchedulingOptions(raidId: number, day: Date) {
    let tuesday = new Date(day.getTime());
    let wednesday = new Date(tuesday.getTime());
    wednesday.setDate(tuesday.getDate() + 1);
    let thursday = new Date(tuesday.getTime());
    thursday.setDate(tuesday.getDate() + 2);

    // Seed only a minimal set of default slots — one 19:00 (prime-time) option
    // per day. The community prefers suggesting their own times, so keeping the
    // defaults light avoids cluttering the voting menu. Custom suggestions
    // continue lettering from "C" onward via AddSingleSchedulingOptionToRaid.
    return global.client.prisma.raidSchedulingOption.createMany({
      data: [
        { RaidId: raidId, Timestamp: new Date(tuesday.setHours(19, 0, 0, 0)), Option: "A" },
        { RaidId: raidId, Timestamp: new Date(wednesday.setHours(19, 0, 0, 0)), Option: "B" },
        { RaidId: raidId, Timestamp: new Date(thursday.setHours(19, 0, 0, 0)), Option: "C" },
      ],
    });
  }

  static async AddSingleSchedulingOptionToRaid(raidId: number, timestamp: Date) {
    // Guard against duplicates: if this raid already has an option at the exact
    // same time, return it instead of creating a second identical row. Without
    // this, a double-submit (retry after an error, double-click, or suggesting
    // a time that already exists) creates duplicate "No votes" entries.
    const existing =
      await global.client.prisma.raidSchedulingOption.findFirst({
        where: { RaidId: raidId, Timestamp: timestamp },
      });
    if (existing) {
      log.info(
        "Scheduling option already exists for raid " +
          raidId +
          " at " +
          timestamp.toISOString() +
          "; skipping duplicate"
      );
      return existing;
    }

    const lastSchedulingOption =
      await global.client.prisma.raidSchedulingOption.findFirst({
        where: { RaidId: raidId },
        orderBy: { ID: "desc" },
      });

    let lastOption = lastSchedulingOption ? lastSchedulingOption.Option : "@"; // '@' is ASCII before 'A'
    let nextOption = String.fromCharCode(lastOption.charCodeAt(0) + 1);

    try {
      return await global.client.prisma.raidSchedulingOption.create({
        data: {
          RaidId: raidId,
          Timestamp: timestamp,
          Option: nextOption,
        },
      });
    } catch (error: any) {
      // P2002 = unique constraint violation on (RaidId, Timestamp). This closes
      // the race the findFirst check above can't: two concurrent executions
      // (e.g. a replayed gateway interaction) both passing the check and racing
      // to insert. The DB rejects the second; return the row that won.
      if (error?.code === "P2002") {
        log.info(
          "Duplicate scheduling option rejected by DB for raid " +
            raidId +
            " at " +
            timestamp.toISOString() +
            "; returning existing"
        );
        return global.client.prisma.raidSchedulingOption.findFirst({
          where: { RaidId: raidId, Timestamp: timestamp },
        });
      }
      throw error;
    }
  }

  static async SendSchedulingMessage(raidId: number) {
    let raid = await this.getRaid(raidId);
    if (raid == null) {
      log.warn("Raid not found for scheduling message: " + raidId);
      return;
    }

    await this.SendSchedulingDMs(raidId);

    let participants = "";
    raid.RaidAttendees.forEach((attendee) => {
      participants += "<@" + attendee.MemberId + ">\n";
    });

    let updateEmbed = new EmbedBuilder()
      .setTitle("Raid has entered scheduling: " + raid.Title)
      .setDescription("Participants: \n" + participants)
      .setFooter({
        text: "Scheduling closes ",
        iconURL:
          "https://flamingpalm.com/assets/images/logo/FlamingPalmLogoSmall.png",
      })
      .setColor("#0099ff");
    global.client.lfg
      .send({ embeds: [updateEmbed] })
      .catch((err) => log.error("Failed to send scheduling update to lfg:", err));
  }

  /**
   * Returns the scheduling-option IDs a member previously marked themselves
   * available for, restricted to the given raid's options. Used to pre-select
   * those options when (re)building the member's voting select menu so an
   * existing vote isn't visually lost — and, on resend, not accidentally wiped
   * when the member re-submits.
   */
  static async getMemberSelectedOptionIds(
    memberId: string,
    optionIds: number[]
  ): Promise<number[]> {
    if (optionIds.length === 0) return [];
    const rows = await global.client.prisma.raidAvailability.findMany({
      where: { MemberId: memberId, SchedulingOptionId: { in: optionIds } },
      select: { SchedulingOptionId: true },
    });
    return rows.map((r) => r.SchedulingOptionId);
  }

  /**
   * (Re)sends the scheduling DM — embed + fresh select menu of all current
   * options — to every attendee of a raid. Used both when scheduling first
   * opens and when a new option (e.g. a custom suggested time) is added, since
   * Discord does not retroactively update select menus in already-sent DMs.
   * The select menu is built per-attendee so each person's existing votes come
   * back pre-selected.
   */
  static async SendSchedulingDMs(raidId: number) {
    let raid = await this.getRaid(raidId);
    if (raid == null) {
      log.warn("Raid not found for scheduling DMs: " + raidId);
      return;
    }
    let embed = RaidEmbeds.buildSchedulingMessage(raid);
    let row = RaidEmbeds.buildSchedulingActionRow(raid.ID);
    const optionIds = raid.RaidSchedulingOption.map((o) => o.ID);

    raid.RaidAttendees.forEach((attendee) => {
      this.getMemberSelectedOptionIds(attendee.MemberId, optionIds)
        .then((selected) => {
          const selectMenu = RaidEmbeds.buildSchedulingSelectMenu(
            raid.ID,
            raid.RaidSchedulingOption,
            selected
          );
          return global.client.users
            .fetch(attendee.MemberId)
            .then((user) => {
              user
                .send({
                  embeds: [embed],
                  components: [selectMenu, row],
                } as MessageCreateOptions)
                .catch((err) => {
                  global.client.log(
                    "Error sending scheduling message for raid " +
                      raid.ID +
                      "  to <@" +
                      user.id +
                      ">"
                  );
                  global.client.lfg.send({
                    content: `<@${user.id}>, I couldn't DM you the scheduling options for **${raid.Title}**! Please check your privacy settings and use \`/raid-resend raid:${raid.ID}\` to try again.`
                  }).catch(e => log.error("Failed to send DM failure notification to lfg:", e));
                  log.error("Error sending scheduling message:", err);
                });
            });
        })
        .catch((err) =>
          log.error(
            "Failed to prepare scheduling DM for user " +
              attendee.MemberId +
              ":",
            err
          )
        );
    });
  }

  static async resendRaid(raidID: number, user: User) {
    let raid = await this.getRaid(raidID);
    if (raid == null) {
      log.warn("Raid not found for resend: " + raidID);
      return "Raid not found";
    }
    let embed = RaidEmbeds.buildSchedulingMessage(raid);
    let row = RaidEmbeds.buildSchedulingActionRow(raid.ID);
    const optionIds = raid.RaidSchedulingOption.map((o) => o.ID);
    const selected = await this.getMemberSelectedOptionIds(user.id, optionIds);
    let selectMenu = RaidEmbeds.buildSchedulingSelectMenu(
      raid.ID,
      raid.RaidSchedulingOption,
      selected
    );

    user
      .send({
        embeds: [embed],
        components: [selectMenu, row],
      } as MessageCreateOptions)
      .catch((err: any) => {
        log.error("Failed to resend scheduling message:", err);
        return err.toString();
      });
    return "success";
  }

  static async checkSchedules() {
    log.info("Collecting scheduling raids");
    let raids = await global.client.prisma.raids.findMany({
      include: {
        RaidAttendees: true,
        RaidSchedulingOption: true,
      },
      where: { Status: 2 },
    });

    for (const raid of raids) {
      await this.scheduleRaid(raid);
    }
  }

  static async scheduleRaid(
    raid: Raids & {
      RaidAttendees: RaidAttendees[];
      RaidSchedulingOption: RaidSchedulingOption[];
    }
  ) {
    log.info("Collecting raid " + raid.ID);
    let votes = await this.CollectSchedulingVotes(raid);
    let consensusVotes = new Map<RaidSchedulingOption, string[]>();
    const now = new Date().getTime();
    votes.forEach((value, key) => {
      // Only schedule a slot that is still in the future — a slot whose time has
      // already passed can't be played even if it reached enough votes. (Slots
      // can outlive their time now that raids stay open until every slot passes.)
      if (value.length >= raid.MinPlayers && key.Timestamp.getTime() > now) {
        consensusVotes.set(key, value);
      }
    });
    if (consensusVotes.size > 0) {
      for (const key of consensusVotes.keys()) {
        let existingRaid =
          await global.client.prisma.raidSchedulingOption.findFirst({
            where: {
              Timestamp: key.Timestamp,
              IsSelected: true,
            },
          });
        if (existingRaid == null) {
          log.info("Creating raid for " + key.Timestamp);
          await this.CreateRaid(key, raid);
          return;
        } else {
          log.info("Raid already exists for " + key.Timestamp);
        }
      }
    } else {
      log.info("No consensus reached for raid " + raid.ID);
      // Only cancel once every proposed timeslot is in the past. As long as any
      // slot (seeded or custom-suggested) is still upcoming, keep the raid open
      // so people can still reach consensus on it — otherwise suggesting a later
      // time would be pointless if the original earliest-slot deadline had passed.
      const latestTimestamp = Math.max(
        ...raid.RaidSchedulingOption.map((o) => o.Timestamp.getTime())
      );
      if (
        raid.RaidSchedulingOption.length > 0 &&
        new Date().getTime() > latestTimestamp
      ) {
        log.info("Cancelling raid " + raid.ID);
        await this.cancelRaid(raid);
      }
    }
  }

  static async CollectSchedulingVotes(
    raid: Raids & {
      RaidAttendees: { MemberId: string }[];
      RaidSchedulingOption: RaidSchedulingOption[];
    }
  ) {
    let votes = new Map<RaidSchedulingOption, string[]>();
    
    // Fetch all availability for all options of this raid
    const optionsWithAvailability = await global.client.prisma.raidSchedulingOption.findMany({
      where: { RaidId: raid.ID },
      include: { RaidAvailability: true }
    });

    optionsWithAvailability.forEach(option => {
      // Find the original option object to use as key
      const originalOption = raid.RaidSchedulingOption.find(o => o.ID === option.ID);
      if (originalOption) {
        votes.set(originalOption, option.RaidAvailability.map(a => a.MemberId));
      }
    });

    return votes;
  }

  static async CreateRaid(
    key: RaidSchedulingOption,
    raid: Raids & {
      RaidAttendees: RaidAttendees[];
      RaidSchedulingOption: RaidSchedulingOption[];
    }
  ) {
    await global.client.prisma.raidSchedulingOption.update({
      where: { ID: key.ID },
      data: { IsSelected: true },
    });
    await global.client.prisma.raids.update({
      where: { ID: raid.ID },
      data: { Status: 3 },
    });

    // Surface the confirmed raid on the server's Events tab. External events
    // require both an end time and a location; we run 2h from the chosen start
    // and point at the LFG channel. Non-fatal: a failure here must not block the
    // confirmation DMs/announcement below.
    try {
      const guild = await global.client.guilds.fetch(process.env.GUILD_ID!);
      const start = key.Timestamp;
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

      // Embed the attendees as user mentions in the description so the 30-minute
      // notification job (modules/statistics.ts) can parse them out and ping every
      // participant. Discord scheduled events have no custom data field, so the
      // description is the only writable surface for this list. Mentions in a
      // description don't ping on their own — the actual ping happens in the
      // announcement message content built from these mentions.
      const prefix = `Raid scheduled via FlamingPalm. Participants (${raid.RaidAttendees.length}):\n`;
      const mentions: string[] = [];
      let truncated = false;
      for (const attendee of raid.RaidAttendees) {
        const mention = `<@${attendee.MemberId}>`;
        // Discord caps the scheduled event description at 1000 characters.
        if (prefix.length + [...mentions, mention].join(" ").length > 1000) {
          truncated = true;
          break;
        }
        mentions.push(mention);
      }
      if (truncated) {
        log.warn(
          "Raid " +
            raid.ID +
            " has too many attendees to list all in the scheduled event description; participant tagging will be partial."
        );
      }

      await guild.scheduledEvents.create({
        name: raid.Title,
        scheduledStartTime: start,
        scheduledEndTime: end,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.External,
        entityMetadata: { location: `#${global.client.lfg?.name ?? "lfg"}` },
        description: prefix + mentions.join(" "),
      });
    } catch (err) {
      log.error(
        "Failed to create Discord scheduled event for raid " + raid.ID + ":",
        err
      );
    }

    let embed = new EmbedBuilder()
      .setTitle("Raid: " + raid.Title)
      .setDescription("Raid has been scheduled!")
      .setColor("#0099ff");
    let participants = "";
    raid.RaidAttendees.forEach((attendee) => {
      participants += "<@" + attendee.MemberId + ">\n";
    });
    embed.addFields({
      name: "Participants",
      value: participants,
      inline: false,
    });
    embed.addFields({
      name: "Time",
      value: "<t:" + Math.floor(key.Timestamp.getTime() / 1000) + ":F>",
      inline: false,
    });

    raid.RaidAttendees.forEach((attendee) => {
      global.client.users
        .fetch(attendee.MemberId)
        .then((user) => {
          user
            .send({ embeds: [embed] })
            .catch((err) =>
              log.error(
                "Failed to send raid scheduled DM to " + attendee.MemberId + ":",
                err
              )
            );
        })
        .catch((err) =>
          log.error(
            "Failed to fetch user " + attendee.MemberId + " for raid DM:",
            err
          )
        );
    });
    global.client.log(
      "Raid scheduled: " +
        raid.Title +
        " at <t:" +
        Math.floor(key.Timestamp.getTime() / 1000) +
        ":F>"
    );
    global.client.lfg
      .send({ embeds: [embed] })
      .catch((err) => log.error("Failed to send raid scheduled embed to lfg:", err));
  }

  static async cancelRaid(
    raid: Raids & {
      RaidAttendees: RaidAttendees[];
      RaidSchedulingOption: RaidSchedulingOption[];
    }
  ) {
    let embed = new EmbedBuilder()
      .setTitle("Scheduling for raid: " + raid.Title)
      .setDescription(
        "Unable to find a suitable timeslot for the raid; it will be canceled. To attempt scheduling again, join or create a new raid."
      )
      .setColor("#0099ff");
    raid.RaidAttendees.forEach((attendee) => {
      global.client.users
        .fetch(attendee.MemberId)
        .then((user) => {
          user
            .send({ embeds: [embed] })
            .catch((err) =>
              log.error(
                "Failed to send raid cancelled DM to " + attendee.MemberId + ":",
                err
              )
            );
        })
        .catch((err) =>
          log.error(
            "Failed to fetch user " + attendee.MemberId + " for cancellation DM:",
            err
          )
        );
    });
    await global.client.prisma.raids.update({
      where: { ID: raid.ID },
      data: { Status: 4 },
    });
    global.client.log("Raid " + raid.ID + " failed scheduling: " + raid.Title);
  }
}
