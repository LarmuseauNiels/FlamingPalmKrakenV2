import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { RaidAttendees, Raids, RaidSchedulingOption } from "@prisma/client";
import { ChannelUpdates } from "../islander/ChannelUpdates";

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
      where: {
        ID: raidId,
      },
    });
    await ChannelUpdates.MessageWithRaid(
      `<@${userId}> has joined the raid: ${raid.Title}`
    );
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
    wednesday.setDate(tuesday.getDate() + 2);
    let thursday = new Date(tuesday.getTime());
    thursday.setDate(tuesday.getDate() + 5);

    return global.client.prisma.raidSchedulingOption.createMany({
      data: [
        {
          RaidId: raidId,
          Timestamp: new Date(tuesday.setHours(17, 0, 0, 0)),
          Option: "A",
        },
        {
          RaidId: raidId,
          Timestamp: new Date(tuesday.setHours(19, 0, 0, 0)),
          Option: "B",
        },
        {
          RaidId: raidId,
          Timestamp: new Date(tuesday.setHours(21, 0, 0, 0)),
          Option: "C",
        },
        {
          RaidId: raidId,
          Timestamp: new Date(wednesday.setHours(17, 0, 0, 0)),
          Option: "D",
        },
        {
          RaidId: raidId,
          Timestamp: new Date(wednesday.setHours(19, 0, 0, 0)),
          Option: "E",
        },
        {
          RaidId: raidId,
          Timestamp: new Date(wednesday.setHours(21, 0, 0, 0)),
          Option: "F",
        },
        {
          RaidId: raidId,
          Timestamp: new Date(thursday.setHours(17, 0, 0, 0)),
          Option: "G",
        },
        {
          RaidId: raidId,
          Timestamp: new Date(thursday.setHours(19, 0, 0, 0)),
          Option: "H",
        },
        {
          RaidId: raidId,
          Timestamp: new Date(thursday.setHours(21, 0, 0, 0)),
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

    let participants = "";
    raid.RaidAttendees.forEach((attendee) => {
      participants += "<@" + attendee.MemberId + ">\n";
    });

    //make discord embed
    let embed = new EmbedBuilder()
      .setTitle("Scheduling for raid: " + raid.Title)
      .setDescription(
        "Cast your votes for all your available time slots! \n The raid will be scheduled for the first time that suits everyone.\n Participants: \n" +
          participants
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
    let row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("raidVotes")
        .setLabel("View Participants' Chosen Times")
        .setStyle(ButtonStyle.Secondary)
    );

    raid.RaidAttendees.forEach((attendee) => {
      global.client.users.fetch(attendee.MemberId).then((user) => {
        user
          .send({
            embeds: [embed],
            content: raid.ID.toString(),
            components: [row],
          })
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

    let updateEmbed = new EmbedBuilder()
      .setTitle("Raid has entered scheduling: " + raid.Title)
      .setDescription("Participants: \n" + participants)
      .setFooter({
        text: "Scheduling closes ",
        iconURL:
          "https://flamingpalm.com/assets/images/logo/FlamingPalmLogoSmall.png",
      })
      .setTimestamp(finishTime)
      .setColor("#0099ff");
    global.client.updateChannel.send({
      embeds: [updateEmbed],
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

    const attendeesPromises = raid.RaidAttendees.map(async (attendee) => {
      const user = await global.client.users.fetch(attendee.MemberId);
      if (!user.dmChannel) {
        await user.createDM();
      }
      const messages = await user.dmChannel.messages.fetch({ limit: 50 });
      console.log(messages.size);
      const message = messages.find((m) => m.content == raid.ID.toString());
      if (!message) {
        console.log("No message found for user " + user.id);
        return;
      }
      console.log(message);
      const optionVotesPromises = raid.RaidSchedulingOption.map(
        async (option) => {
          const users = await message.reactions
            .resolve(this.getUniCodeEmoji(option.Option))
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
    global.client.updateChannel.send({
      embeds: [embed],
    });
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
        "Unable to find a suitable timeslot for the raid; it will be canceled. To attempt scheduling again, join or create a new raid."
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

  static async showVotes(raidId: number) {
    let raid = await global.client.prisma.raids.findFirst({
      include: {
        RaidAttendees: true,
        RaidSchedulingOption: true,
      },
      where: {
        ID: raidId,
      },
    });
    let votes = await this.CollectSchedulingVotes(raid);
    let embed = new EmbedBuilder()
      .setTitle("Votes for raid: " + raid.Title)
      .setDescription("The following votes have been cast: ")
      .setColor("#0099ff");

    votes.forEach((value, key) => {
      let participants = "";
      if (value.length == 0) {
        participants = "No votes";
      }
      value.forEach((user) => {
        participants += "<@" + user + ">\n";
      });
      embed.addFields({
        name:
          this.getUniCodeEmoji(key.Option) +
          " <t:" +
          Math.floor(key.Timestamp.getTime() / 1000) +
          ":F>",
        value: participants,
        inline: false,
      });
    });
    return embed;
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

  static async getRaidMessage() {
    const raids = await globalThis.client.prisma.raids.findMany({
      include: { RaidAttendees: true },
      where: { Status: 1 },
    });

    // make an embed with all the events
    const embed = new EmbedBuilder()
      .setColor("#FD8612")
      .setTitle("Party Raids")
      .setDescription(
        "Join one of the available raids by selecting it in the box below! \n Once enough participants sign up, you'll receive a message to vote on a timeslot.\n To add a new raid, use /create-raid."
      )
      .setTimestamp()
      .setFooter({
        text: "Flamingpalm raids",
        iconURL:
          "https://flamingpalm.com/assets/images/logo/FlamingPalmLogoSmall.png",
      });

    const select = new StringSelectMenuBuilder()
      .setCustomId("raidsignup")
      .setPlaceholder("Select a raid to enlist");

    raids.forEach((raid) => {
      let participants = "";
      if (raid.RaidAttendees.length > 4) participants = "Too many to list!";
      raid.RaidAttendees.forEach((attendee) => {
        participants += "<@" + attendee.MemberId + "> ";
      });
      embed.addFields({
        name: raid.Title,
        value: `Attendees: ${raid.RaidAttendees.length}/${raid.MinPlayers} \n ${participants} \n`,
        inline: false,
      });
      select.addOptions({
        label: raid.Title,
        value: raid.ID.toString(),
      });
    });

    const row = new ActionRowBuilder().addComponents(select);
    return { embeds: [embed], components: [row] };
  }
}
