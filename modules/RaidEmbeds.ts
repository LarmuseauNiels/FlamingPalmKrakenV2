import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { RaidAttendees, Raids, RaidSchedulingOption } from "@prisma/client";

export abstract class RaidEmbeds {
  static getUniCodeEmoji(char: string) {
    switch (char) {
      case "A": return "🇦";
      case "B": return "🇧";
      case "C": return "🇨";
      case "D": return "🇩";
      case "E": return "🇪";
      case "F": return "🇫";
      case "G": return "🇬";
      case "H": return "🇭";
      case "I": return "🇮";
      case "J": return "🇯";
      case "K": return "🇰";
      case "L": return "🇱";
      case "M": return "🇲";
      case "N": return "🇳";
      case "O": return "🇴";
      case "P": return "🇵";
      case "Q": return "🇶";
      case "R": return "🇷";
      case "S": return "🇸";
      default:  return char;
    }
  }

  static buildSchedulingMessage(
    raid: Raids & {
      RaidAttendees: RaidAttendees[];
      RaidSchedulingOption: RaidSchedulingOption[];
    }
  ) {
    let finishTime = new Date(raid.RaidSchedulingOption[0].Timestamp.getTime());
    finishTime.setDate(finishTime.getDate() - 1);
    finishTime.setHours(0, 0, 0, 0);

    let participants = "";
    raid.RaidAttendees.forEach((attendee) => {
      participants += "<@" + attendee.MemberId + ">\n";
    });

    let embed = new EmbedBuilder()
      .setTitle("Scheduling for raid: " + raid.Title)
      .setDescription(
        "Select all the time slots you are available for in the dropdown below! \n The raid will be scheduled for the first time that suits enough people.\n Participants: \n" +
          participants
      )
      .setFooter({
        text: "Scheduling closes ",
        iconURL:
          "https://flamingpalm.com/assets/images/logo/FlamingPalmLogoSmall.png",
      })
      .setTimestamp(finishTime)
      .setColor("#0099ff");

    raid.RaidSchedulingOption.forEach((option) => {
      let unixTime = Math.floor(option.Timestamp.getTime() / 1000);
      embed.addFields({
        name: this.getUniCodeEmoji(option.Option),
        value: "<t:" + unixTime + ":F>",
        inline: true,
      });
    });

    return embed;
  }

  static buildRaidListMessage(
    raids: (Raids & { RaidAttendees: RaidAttendees[] })[]
  ) {
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

    if (raids.length > 0) {
      const select = new StringSelectMenuBuilder()
        .setCustomId("raidsignup")
        .setPlaceholder("Select a raid to enlist");

      raids.slice(0, 25).forEach((raid) => {
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
    } else {
      embed.setDescription(
        "No available raids at the moment. Please check back later or create a new raid using /create-raid."
      );
      return { embeds: [embed] };
    }
  }

  static buildSchedulingActionRow(raidId: number) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("raidVotes")
        .setLabel("View Participants' Chosen Times")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`raidSuggestTime_${raidId}`)
        .setLabel("Suggest Custom Time")
        .setStyle(ButtonStyle.Primary)
    );
  }

  static buildSchedulingSelectMenu(
    raidId: number,
    options: RaidSchedulingOption[],
    userSelectedOptions: number[] = []
  ) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`raidVote_${raidId}`)
      .setPlaceholder("Select all time slots you are available for")
      .setMinValues(0)
      .setMaxValues(Math.min(options.length, 25));

    options.forEach((option) => {
      const unixTime = Math.floor(option.Timestamp.getTime() / 1000);
      // We use a formatted string for the label because select menus don't support discord timestamps in labels
      const dateString = option.Timestamp.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });

      select.addOptions({
        label: `${option.Option}: ${dateString}`,
        value: option.ID.toString(),
        default: userSelectedOptions.includes(option.ID),
      });
    });

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  }
}
