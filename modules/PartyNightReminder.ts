import cron from "node-cron";
import { EmbedBuilder } from "discord.js";
import { FpgClient } from "../components/FpgClient";
import { getAdminIds } from "./ApiFunctions/Helpers";
import { createLogger } from "../utils/logger";

const log = createLogger("PartyNightReminder");

// sec min hour day-of-month month day-of-week — Saturday 21:00 Brussels time
const REMINDER_CRON = "0 0 21 * * 6";
const REMINDER_TIMEZONE = "Europe/Brussels";

function buildReminderEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("Party Night points reminder")
    .setDescription(
      "Don't forget to hand out the Party Night points!\n\n" +
        "Use `/give-event` with the hour the party started (24h, Brussels time) " +
        "and `daysago: 0` to pick the attendees from voice presence."
    )
    .setColor("#FD8612")
    .setTimestamp();
}

async function sendReminders(client: FpgClient): Promise<void> {
  const adminIds = getAdminIds();
  if (adminIds.length === 0) {
    log.warn("No ADMIN_IDS configured — skipping Party Night reminder");
    return;
  }

  const embed = buildReminderEmbed();
  const results = await Promise.allSettled(
    adminIds.map(async (id) => {
      const admin = await client.users.fetch(id);
      await admin.send({ embeds: [embed] });
      return id;
    })
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      // Most likely the admin has DMs closed, or the ID is no longer valid.
      // Warn rather than error: this is expected and recoverable, and log.error
      // would raise a Bugsnag report every week for the same blocked DM.
      log.warn(
        `Failed to DM Party Night reminder to ${adminIds[index]}:`,
        result.reason
      );
    }
  });

  const sent = results.filter((r) => r.status === "fulfilled").length;
  log.info(`Sent Party Night reminder to ${sent}/${adminIds.length} admins`);
}

module.exports = function (client: FpgClient) {
  log.info(
    `Loading Party Night reminder module (${REMINDER_CRON} ${REMINDER_TIMEZONE})`
  );

  cron.schedule(
    REMINDER_CRON,
    () => {
      sendReminders(client).catch((error) =>
        log.error("Party Night reminder cron job error:", error)
      );
    },
    { timezone: REMINDER_TIMEZONE }
  );
};
