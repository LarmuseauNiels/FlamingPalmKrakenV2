import { EmbedBuilder, MessageCreateOptions, User } from "discord.js";
import { RaidAttendees, Raids, RaidSchedulingOption } from "@prisma/client";
import { RaidEmbeds } from "./RaidEmbeds";

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
    console.log("Checking if raid is ready for scheduling");
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
      console.log("Raid not found");
      return;
    }

    console.log(
      "Raid found with " +
        raid.RaidAttendees.length +
        " attendees out of " +
        raid.MinPlayers +
        " required"
    );
    if (raid.RaidAttendees.length >= raid.MinPlayers) {
      console.log("Raid is starting scheduling");

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
      console.log("Scheduling starts on " + firstSchedulingOption);

      await this.AddDayToRaidSchedulingOptions(raidId, firstSchedulingOption);
      await this.SendSchedulingMessage(raidId);
    }
  }

  static async AddDayToRaidSchedulingOptions(raidId: number, day: Date) {
    let tuesday = new Date(day.getTime());
    let wednesday = new Date(tuesday.getTime());
    wednesday.setDate(tuesday.getDate() + 2);
    let thursday = new Date(tuesday.getTime());
    thursday.setDate(tuesday.getDate() + 5);

    return global.client.prisma.raidSchedulingOption.createMany({
      data: [
        { RaidId: raidId, Timestamp: new Date(tuesday.setHours(17, 0, 0, 0)), Option: "A" },
        { RaidId: raidId, Timestamp: new Date(tuesday.setHours(19, 0, 0, 0)), Option: "B" },
        { RaidId: raidId, Timestamp: new Date(tuesday.setHours(21, 0, 0, 0)), Option: "C" },
        { RaidId: raidId, Timestamp: new Date(wednesday.setHours(17, 0, 0, 0)), Option: "D" },
        { RaidId: raidId, Timestamp: new Date(wednesday.setHours(19, 0, 0, 0)), Option: "E" },
        { RaidId: raidId, Timestamp: new Date(wednesday.setHours(21, 0, 0, 0)), Option: "F" },
        { RaidId: raidId, Timestamp: new Date(thursday.setHours(17, 0, 0, 0)), Option: "G" },
        { RaidId: raidId, Timestamp: new Date(thursday.setHours(19, 0, 0, 0)), Option: "H" },
        { RaidId: raidId, Timestamp: new Date(thursday.setHours(21, 0, 0, 0)), Option: "I" },
      ],
    });
  }

  static async AddSingleSchedulingOptionToRaid(raidId: number, timestamp: Date) {
    const lastSchedulingOption =
      await global.client.prisma.raidSchedulingOption.findFirst({
        where: { RaidId: raidId },
        orderBy: { ID: "desc" },
      });

    let lastOption = lastSchedulingOption ? lastSchedulingOption.Option : "@"; // '@' is ASCII before 'A'
    let nextOption = String.fromCharCode(lastOption.charCodeAt(0) + 1);

    return global.client.prisma.raidSchedulingOption.create({
      data: {
        RaidId: raidId,
        Timestamp: timestamp,
        Option: nextOption,
      },
    });
  }

  static async SendSchedulingMessage(raidId: number) {
    let raid = await this.getRaid(raidId);
    let embed = RaidEmbeds.buildSchedulingMessage(raid);
    let row = RaidEmbeds.buildSchedulingActionRow();

    raid.RaidAttendees.forEach((attendee) => {
      global.client.users.fetch(attendee.MemberId).then((user) => {
        user
          .send({
            embeds: [embed],
            content: raid.ID.toString(),
            components: [row],
          } as MessageCreateOptions)
          .then((message) => {
            raid.RaidSchedulingOption.forEach((option) => {
              message.react(RaidEmbeds.getUniCodeEmoji(option.Option));
            });
          })
          .catch((err) => {
            global.log(
              "Error sending scheduling message for raid " +
                raid.ID +
                "  to <@" +
                user.id +
                ">"
            );
            console.log(err);
          });
      });
    });

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
    global.client.lfg.send({ embeds: [updateEmbed] });
  }

  static async resendRaid(raidID: number, user: User) {
    let raid = await this.getRaid(raidID);
    let embed = RaidEmbeds.buildSchedulingMessage(raid);
    let row = RaidEmbeds.buildSchedulingActionRow();

    user
      .send({
        embeds: [embed],
        content: raid.ID.toString(),
        components: [row],
      } as MessageCreateOptions)
      .then((message) => {
        raid.RaidSchedulingOption.forEach((option) => {
          message.react(RaidEmbeds.getUniCodeEmoji(option.Option));
        });
      })
      .catch((err: any) => {
        return err.toString();
      });
    return "success";
  }

  static async checkSchedules() {
    console.log("Collecting scheduling raids");
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
    console.log("Collecting raid " + raid.ID);
    let votes = await this.CollectSchedulingVotes(raid);
    let consensusVotes = new Map<RaidSchedulingOption, string[]>();
    votes.forEach((value, key) => {
      if (value.length >= raid.MinPlayers) {
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
          console.log("Creating raid for " + key.Timestamp);
          await this.CreateRaid(key, raid);
          return;
        } else {
          console.log("Raid already exists for " + key.Timestamp);
        }
      }
    } else {
      console.log("No consensus reached for raid " + raid.ID);
      let finishingTime = new Date(raid.RaidSchedulingOption[0].Timestamp);
      finishingTime.setDate(finishingTime.getDate() - 1);
      finishingTime.setHours(0, 0, 0, 0);
      if (new Date().getTime() > finishingTime.getTime()) {
        console.log("Cancelling raid " + raid.ID);
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
    raid.RaidSchedulingOption.forEach((option) => {
      votes.set(option, []);
    });

    const attendeesPromises = raid.RaidAttendees.map(async (attendee) => {
      const user = await global.client.users.fetch(attendee.MemberId);
      if (!user.dmChannel) {
        await user.createDM();
      }
      const messages = await user.dmChannel.messages.fetch({ limit: 50 });
      console.log(messages.size);
      const message = messages.find((m) => m.content == raid.ID.toString());
      if (!message) {
        global.client.log(
          "No scheduling message found for user <@" +
            user.id +
            "> for raid " +
            raid.ID
        );
        return;
      }
      console.log(message);
      const optionVotesPromises = raid.RaidSchedulingOption.map(
        async (option) => {
          const users = await message.reactions
            .resolve(RaidEmbeds.getUniCodeEmoji(option.Option))
            .users.fetch();
          if (users.some((u) => u.id == attendee.MemberId)) {
            votes.get(option).push(attendee.MemberId);
          }
        }
      );
      await Promise.all(optionVotesPromises);
    });
    await Promise.all(attendeesPromises);
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
      global.client.users.fetch(attendee.MemberId).then((user) => {
        user.send({ embeds: [embed] });
      });
    });
    global.client.log(
      "Raid scheduled: " +
        raid.Title +
        " at <t:" +
        Math.floor(key.Timestamp.getTime() / 1000) +
        ":F>"
    );
    global.client.lfg.send({ embeds: [embed] });
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
      global.client.users.fetch(attendee.MemberId).then((user) => {
        user.send({ embeds: [embed] });
      });
    });
    await global.client.prisma.raids.update({
      where: { ID: raid.ID },
      data: { Status: 4 },
    });
    global.client.log("Raid " + raid.ID + " failed scheduling: " + raid.Title);
  }
}
