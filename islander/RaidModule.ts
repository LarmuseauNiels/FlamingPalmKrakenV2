import { EmbedBuilder } from "discord.js";
import {RaidSchedulingOption} from "@prisma/client";

export class RaidModule {
  async AddUserToRaid(userId: string, raidId: number) {
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

  async SchedulingCreationCheck(raidId: number) {
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

    console.log("Raid found with " + raid.RaidAttendees.length + " attendees out of " + raid.MinPlayers + " required");
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
      if (FirstSchedlingOption.getTime() - new Date().getTime() < 432000000) {
        FirstSchedlingOption.setDate(FirstSchedlingOption.getDate() + 7);
      }
      console.log("Scheduling starts on " + FirstSchedlingOption);

      await this.AddDayToRaidSchedulingOptions(raidId, FirstSchedlingOption);

      console.log("Sending scheduling message");
      await this.SendSchedulingMessage(raidId);
      return;
    }
  }

  async AddDayToRaidSchedulingOptions(raidId: number, day: Date) {
    let tuesday = day;
    let wednesday = new Date(tuesday.getTime());
    wednesday.setDate(tuesday.getDay() + 1);
    let thursday = new Date(tuesday.getTime());
    thursday.setDate(tuesday.getDay() + 2);

    return global.client.prisma.raidSchedulingOption.createMany({
      data: [
        {
          RaidId: raidId,
          Timestamp: new Date(tuesday.setHours(16, 0, 0, 0)),
          Option: "A"
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

  private async SendSchedulingMessage(raidId: number) {
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
    let finishTime = new Date();
    finishTime.setDate(finishTime.getDate() + 3);
    finishTime.setHours(23, 0, 0, 0);

    //make discord embed
    let embed = new EmbedBuilder()
      .setTitle("Scheduling for raid: " + raid.Title)
      .setDescription(
        "Please press the reaction for all times you are available for the raid!"
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
        inline: false,
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





  async CollectSchedulingVotes(raidId: number) {
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

    raid.RaidAttendees.forEach((attendee) => {
      global.client.users.fetch(attendee.MemberId).then((user) => {
        user.dmChannel.messages.fetch({ limit: 100 }).then((messages) => {
          let message = messages.find((m) => m.content == raidId.toString());

          raid.RaidSchedulingOption.forEach((option) => {
            message.reactions
              .resolve(this.getUniCodeEmoji(option.Option))
              .users.fetch()
              .then(async (users) => {
                if (users.some((u) => u.id == attendee.MemberId)) {
                  await global.client.prisma.raidAvailability.create({
                    data: {
                      MemberId: attendee.MemberId,
                      SchedulingOptionId: option.ID,
                    },
                  });
                }
              });
          });
        });
      });
    });
  }

  getUniCodeEmoji(char: string) {
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


