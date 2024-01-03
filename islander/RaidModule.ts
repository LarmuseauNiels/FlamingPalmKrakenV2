import { EmbedBuilder } from "discord.js";
import { RaidAttendees, Raids, RaidSchedulingOption } from "@prisma/client";

export abstract class RaidModule {
  static async AddUserToRaid(userId: string, raidId: number) {
    console.log("Adding user to raid");
    await global.client.prisma.raidAttendees.create({
      data: {
        MemberId: userId,
        RaidId: raidId,
      },
    });
    await this.SchedulingCreationCheck(raidId);
    return;
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
        where: {
          ID: raidId,
        },
        data: {
          Status: 2,
        },
      });

      //find next tuesday
      let FirstSchedlingOption = new Date();
      FirstSchedlingOption.setDate(
        FirstSchedlingOption.getDate() +
          ((2 + 7 - FirstSchedlingOption.getDay()) % 7)
      );
      // if next tuesday is in less the 5 days, add 7 days
      if (FirstSchedlingOption.getTime() - new Date().getTime() < 259200000) {
        FirstSchedlingOption.setDate(FirstSchedlingOption.getDate() + 7);
      }
      console.log("Scheduling starts on " + FirstSchedlingOption);

      await this.AddDayToRaidSchedulingOptions(raidId, FirstSchedlingOption);

      console.log("Sending scheduling message");
      await this.SendSchedulingMessage(raidId);
      return;
    }
  }

  static async AddDayToRaidSchedulingOptions(raidId: number, day: Date) {
    let tuesday = new Date(day.getTime());
    let wednesday = new Date(tuesday.getTime());
    wednesday.setDate(tuesday.getDate() + 1);
    let thursday = new Date(tuesday.getTime());
    thursday.setDate(tuesday.getDate() + 2);

    return global.client.prisma.raidSchedulingOption.createMany({
      data: [
        {
          RaidId: raidId,
          Timestamp: new Date(tuesday.setHours(16, 0, 0, 0)),
          Option: "A",
        },
        {
          RaidId: raidId,
          Timestamp: new Date(tuesday.setHours(19, 0, 0, 0)),
          Option: "B",
        },
        {
          RaidId: raidId,
          Timestamp: new Date(tuesday.setHours(22, 0, 0, 0)),
          Option: "C",
        },
        {
          RaidId: raidId,
          Timestamp: new Date(wednesday.setHours(16, 0, 0, 0)),
          Option: "D",
        },
        {
          RaidId: raidId,
          Timestamp: new Date(wednesday.setHours(19, 0, 0, 0)),
          Option: "E",
        },
        {
          RaidId: raidId,
          Timestamp: new Date(wednesday.setHours(22, 0, 0, 0)),
          Option: "F",
        },
        {
          RaidId: raidId,
          Timestamp: new Date(thursday.setHours(16, 0, 0, 0)),
          Option: "G",
        },
        {
          RaidId: raidId,
          Timestamp: new Date(thursday.setHours(19, 0, 0, 0)),
          Option: "H",
        },
        {
          RaidId: raidId,
          Timestamp: new Date(thursday.setHours(22, 0, 0, 0)),
          Option: "I",
        },
      ],
    });
  }

  static async SendSchedulingMessage(raidId: number) {
    let raid = await global.client.prisma.raids.findFirst({
      include: {
        RaidAttendees: true,
        RaidSchedulingOption: true,
      },
      where: {
        ID: raidId,
        Status: 2,
      },
    });

    let finishTime = new Date(raid.RaidSchedulingOption[0].Timestamp.getTime());
    finishTime.setDate(finishTime.getDate() - 1);
    finishTime.setHours(0, 0, 0, 0);

    //make discord embed
    let embed = new EmbedBuilder()
      .setTitle("Scheduling for raid: " + raid.Title)
      .setDescription(
        "Vote for all times you are available! /n The raid will be scheduled for the first time that everyone can make."
      )
      .setFooter({
        text: "Scheduling closes ",
        iconURL:
          "https://flamingpalm.com/assets/images/logo/FlamingPalmLogoSmall.png",
      })
      .setTimestamp(finishTime)
      .setColor("#0099ff");

    //add scheduling options to embed
    raid.RaidSchedulingOption.forEach((option) => {
      let unixTime = Math.floor(option.Timestamp.getTime() / 1000);
      embed.addFields({
        name: this.getUniCodeEmoji(option.Option),
        value: "<t:" + unixTime + ":F>",
        inline: true,
      });
    });

    raid.RaidAttendees.forEach((attendee) => {
      global.client.users.fetch(attendee.MemberId).then((user) => {
        user
          .send({ embeds: [embed], content: raid.ID.toString() })
          .then((message) => {
            raid.RaidSchedulingOption.forEach((option) => {
              message.react(this.getUniCodeEmoji(option.Option));
            });
          })
          .catch((err) => {
            console.log(err);
          });
      });
    });
  }

  static async checkSchedules() {
    console.log("Collecting scheduling raids");
    let raids = await global.client.prisma.raids.findMany({
      include: {
        RaidAttendees: true,
        RaidSchedulingOption: true,
      },
      where: {
        Status: 2,
      },
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
      // pick the first option with the most votes
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
      // check if raid options are still valid
      let finishingTime = new Date(raid.RaidSchedulingOption[0].Timestamp);
      finishingTime.setDate(finishingTime.getDate() - 1);
      finishingTime.setHours(0, 0, 0, 0);
      // if current time is past finishing time, cancel raid
      if (new Date().getTime() > finishingTime.getTime()) {
        console.log("Cancelling raid " + raid.ID);
        await this.cancelRaid(raid);
        return;
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

    for (const attendee of raid.RaidAttendees) {
      console.log("Collecting votes for " + attendee.MemberId);
      let user = await global.client.users.fetch(attendee.MemberId);
      console.log("user found: " + user.username);
      let messages = await user.dmChannel.messages.fetch({ limit: 100 });
      let message = messages.find((m) => m.content == raid.ID.toString());
      for (const option of raid.RaidSchedulingOption) {
        let users = await message.reactions
          .resolve(this.getUniCodeEmoji(option.Option))
          .users.fetch();
        if (users.some((u) => u.id == attendee.MemberId)) {
          votes.get(option).push(attendee.MemberId);
        }
      }
    }
    return votes;
  }

  static async CreateRaid(
    key: RaidSchedulingOption,
    raid: Raids & {
      RaidAttendees: RaidAttendees[];
      RaidSchedulingOption: RaidSchedulingOption[];
    }
  ) {
    //update raid scheduling option to selected
    await global.client.prisma.raidSchedulingOption.update({
      where: {
        ID: key.ID,
      },
      data: {
        IsSelected: true,
      },
    });
    //update raid to status 3 (scheduled)
    await global.client.prisma.raids.update({
      where: {
        ID: raid.ID,
      },
      data: {
        Status: 3,
      },
    });
    //create discord event
    let embed = new EmbedBuilder()
      .setTitle("Raid: " + raid.Title)
      .setDescription("This raid has been scheduled!")
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
  }

  static async cancelRaid(
    raid: Raids & {
      RaidAttendees: RaidAttendees[];
      RaidSchedulingOption: RaidSchedulingOption[];
    }
  ) {
    // alert attendees that no consensus was reached and set raid to status 4 (cancelled)
    let embed = new EmbedBuilder()
      .setTitle("Scheduling for raid: " + raid.Title)
      .setDescription(
        "No consensus was reached for this raid. Consider making or joining a new one."
      )
      .setColor("#0099ff");
    raid.RaidAttendees.forEach((attendee) => {
      global.client.users.fetch(attendee.MemberId).then((user) => {
        user.send({ embeds: [embed] });
      });
    });
    await global.client.prisma.raids.update({
      where: {
        ID: raid.ID,
      },
      data: {
        Status: 4,
      },
    });

    global.client.log("Raid " + raid.ID + " failed scheduling: " + raid.Title);
  }

  static getUniCodeEmoji(char: string) {
    switch (char) {
      case "A":
        return "🇦";
      case "B":
        return "🇧";
      case "C":
        return "🇨";
      case "D":
        return "🇩";
      case "E":
        return "🇪";
      case "F":
        return "🇫";
      case "G":
        return "🇬";
      case "H":
        return "🇭";
      case "I":
        return "🇮";
      default:
        return char;
    }
  }
}
