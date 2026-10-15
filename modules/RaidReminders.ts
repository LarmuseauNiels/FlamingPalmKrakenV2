import cron from "node-cron";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { FpgClient } from "../components/FpgClient";
import { createLogger } from "../utils/logger";

const log = createLogger("RaidReminders");

/** How long before a scheduled raid its attendees get the "starts soon" DM. */
const REMINDER_MINUTES = parseInt(process.env.RAID_REMINDER_MINUTES || "30");

/**
 * DMs every attendee shortly before a scheduled raid starts, with a link to
 * the raid voice channel (RAID_VOICE_CHANNEL_ID, else the LFG channel).
 * Each raid is claimed via Raids.ReminderSent before sending, so restarts and
 * overlapping instances during a deploy never send it twice. A raid scheduled
 * less than REMINDER_MINUTES ahead (or missed while the bot was down) is
 * still reminded, as long as it hasn't started yet.
 */
async function sendDueReminders(): Promise<void> {
  const now = new Date();
  const horizon = new Date(now.getTime() + REMINDER_MINUTES * 60 * 1000);

  const raids = await global.client.prisma.raids.findMany({
    where: {
      Status: 3,
      ReminderSent: false,
      RaidSchedulingOption: { some: { IsSelected: true, Timestamp: { gt: now, lte: horizon } } },
    },
    include: {
      RaidAttendees: true,
      RaidSchedulingOption: { where: { IsSelected: true } },
    },
  });

  for (const raid of raids) {
    const claimed = await global.client.prisma.raids.updateMany({
      where: { ID: raid.ID, ReminderSent: false },
      data: { ReminderSent: true },
    });
    if (claimed.count === 0) continue;

    const start = raid.RaidSchedulingOption[0].Timestamp;
    await remindRaid(raid.ID, raid.Title, start, raid.RaidAttendees.map((a) => a.MemberId));
  }
}

async function remindRaid(raidId: number, title: string, start: Date, memberIds: string[]): Promise<void> {
  const unix = Math.floor(start.getTime() / 1000);
  const voiceId = process.env.RAID_VOICE_CHANNEL_ID;
  const channelId = voiceId || global.client.lfg?.id;

  const embed = new EmbedBuilder()
    .setTitle(`⏰ ${title} starts soon`)
    .setDescription(
      `Your raid starts <t:${unix}:R>, at <t:${unix}:t>.` +
        (channelId ? `\nMeet up in <#${channelId}>.` : "") +
        "\n\nCan't make it anymore? Let the group know in LFG."
    )
    .addFields({ name: "Players", value: memberIds.map((id) => `<@${id}>`).join("\n") || "—" })
    .setColor("#0099ff");

  const components = [];
  if (channelId) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel(voiceId ? "Join voice" : "Open LFG")
          .setURL(`https://discord.com/channels/${process.env.GUILD_ID}/${channelId}`)
      )
    );
  }

  // Plain text up top: it's what the push notification shows, and timestamp
  // tags don't render there.
  const minutes = Math.max(1, Math.round((start.getTime() - Date.now()) / 60000));
  const content = `⏰ **${title}** starts in ${minutes} minute${minutes === 1 ? "" : "s"}!`;

  const failed: string[] = [];
  await Promise.all(
    memberIds.map(async (memberId) => {
      try {
        const user = await global.client.users.fetch(memberId);
        await user.send({ content, embeds: [embed], components });
      } catch (err) {
        log.warn(`Couldn't DM raid reminder for raid ${raidId} to ${memberId}:`, err);
        failed.push(memberId);
      }
    })
  );

  // Members with DMs closed still deserve the heads-up.
  if (failed.length > 0 && global.client.lfg) {
    await global.client.lfg
      .send({ content: `${failed.map((id) => `<@${id}>`).join(" ")} — **${title}** starts <t:${unix}:R>!` })
      .catch((err) => log.error("Failed to post raid reminder fallback in LFG:", err));
  }
  log.info(`Sent raid reminder for ${raidId} (${title}) to ${memberIds.length - failed.length}/${memberIds.length} attendees`);
}

module.exports = function (client: FpgClient) {
  log.info(`Loading raid reminder module (${REMINDER_MINUTES} min before start)`);
  cron.schedule("15 * * * * *", () => {
    sendDueReminders().catch((error) => log.error("Raid reminder cron job error:", error));
  });
};
