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
    // Scheduling stays open until every proposed slot has passed — the raid is
    // only cancelled once no upcoming slot remains (see RaidScheduler.scheduleRaid),
    // so the close time is the latest option, not the earliest.
    const latestTimestamp = Math.max(
      ...raid.RaidSchedulingOption.map((o) => o.Timestamp.getTime())
    );
    let finishTime = new Date(latestTimestamp);

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

  /**
   * Activity link that opens straight onto this raid's scheduling board (the
   * Activity reads custom_id via discordSdk.customId). Null when Activities
   * are off, so callers fall back to the DM voting menu.
   */
  static raidBoardUrl(raidId: number): string | null {
    if (process.env.ACTIVITY_ENABLED !== "true" || !process.env.CLIENT_ID) return null;
    return `https://discord.com/activities/${process.env.CLIENT_ID}?custom_id=raid-${raidId}`;
  }

  static buildRaidBoardButton(raidId: number, label = "Open raid board"): ButtonBuilder | null {
    const url = this.raidBoardUrl(raidId);
    return url ? new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setEmoji("🗓️").setURL(url) : null;
  }

  static buildSchedulingActionRow(raidId: number) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    const board = this.buildRaidBoardButton(raidId);
    if (board) row.addComponents(board);
    return row.addComponents(
      new ButtonBuilder()
        .setCustomId(`raidVotes_${raidId}`)
        .setLabel("View Participants' Chosen Times")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`raidSuggestTime_${raidId}`)
        .setLabel("Suggest Custom Time")
        .setStyle(ButtonStyle.Primary)
    );
  }

  /**
   * Short DM for a newly suggested time when the raid board is available:
   * points at the live board instead of re-sending every attendee a full
   * voting menu (Discord can't update menus in DMs that were already sent).
   */
  static buildNewTimeNotice(raid: Raids, timestamp: Date, suggesterId: string) {
    const unix = Math.floor(timestamp.getTime() / 1000);
    const embed = new EmbedBuilder()
      .setTitle("New time suggested: " + raid.Title)
      .setDescription(`<@${suggesterId}> suggested <t:${unix}:F> (<t:${unix}:R>). Can you make it?`)
      .setColor("#0099ff");
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      this.buildRaidBoardButton(raid.ID, "Vote on the raid board"),
      new ButtonBuilder()
        .setCustomId(`raidResendMenu_${raid.ID}`)
        .setLabel("Vote here instead")
        .setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
  }

  static buildSchedulingSelectMenu(
    raidId: number,
    options: RaidSchedulingOption[],
    userSelectedOptions: number[] = []
  ) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`raidVote_${raidId}`)
      .setPlaceholder("Select the time slots (A, B, C…) you are available for")
      .setMinValues(0)
      .setMaxValues(Math.min(options.length, 25));

    options.forEach((option) => {
      // Select menus don't support Discord timestamps in labels, so any time
      // we render here would be fixed to the server's timezone and conflict
      // with the per-viewer localized times shown in the message above.
      // We therefore label options by their letter only and let users read
      // the localized times from the message.
      select.addOptions({
        label: option.Option,
        value: option.ID.toString(),
        default: userSelectedOptions.includes(option.ID),
      });
    });

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  }
}
