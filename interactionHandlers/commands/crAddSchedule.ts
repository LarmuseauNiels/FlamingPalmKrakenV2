import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import moment from 'moment-timezone';
import { RaidScheduler } from "../../modules/RaidScheduler";
import { IHandler } from "../../interfaces/IHandler";
import { respondWithOwnCustomRaids } from "../../modules/RaidAutocomplete";

export default class CrAddScheduleCommand implements IHandler {
  name = "cr-add-schedule";
  data = new SlashCommandBuilder()
    .setName("cr-add-schedule")
    .setDescription("Add a schedule option to a custom raid")
    .addIntegerOption((option) =>
      option
        .setName("raid")
        .setDescription("The raid to add a schedule to")
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("month")
        .setDescription("Month")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(12)
        .addChoices(
          { name: "January", value: 1 },
          { name: "February", value: 2 },
          { name: "March", value: 3 },
          { name: "April", value: 4 },
          { name: "May", value: 5 },
          { name: "June", value: 6 },
          { name: "July", value: 7 },
          { name: "August", value: 8 },
          { name: "September", value: 9 },
          { name: "October", value: 10 },
          { name: "November", value: 11 },
          { name: "December", value: 12 }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName("day")
        .setDescription("Day")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(31)
    )
    .addIntegerOption((option) =>
      option
        .setName("hour")
        .setDescription("Hour")
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(23)
        .addChoices(
          { name: "00", value: 0 },
          { name: "01", value: 1 },
          { name: "02", value: 2 },
          { name: "03", value: 3 },
          { name: "04", value: 4 },
          { name: "05", value: 5 },
          { name: "06", value: 6 },
          { name: "07", value: 7 },
          { name: "08", value: 8 },
          { name: "09", value: 9 },
          { name: "10", value: 10 },
          { name: "11", value: 11 },
          { name: "12", value: 12 },
          { name: "13", value: 13 },
          { name: "14", value: 14 },
          { name: "15", value: 15 },
          { name: "16", value: 16 },
          { name: "17", value: 17 },
          { name: "18", value: 18 },
          { name: "19", value: 19 },
          { name: "20", value: 20 },
          { name: "21", value: 21 },
          { name: "22", value: 22 },
          { name: "23", value: 23 }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName("minute")
        .setDescription("Minute")
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(59)
        .addChoices(
          { name: "00", value: 0 },
          { name: "15", value: 15 },
          { name: "30", value: 30 },
          { name: "45", value: 45 }
        )
    )
    .addStringOption((option) =>
      option
        .setName("timezone")
        .setDescription("Select the timezone for the schedule")
        .setRequired(true)
        .addChoices(
          { name: "Pacific Time (LA)", value: "America/Los_Angeles" },
          { name: "Mountain Time (Denver)", value: "America/Denver" },
          { name: "Central Time (Chicago)", value: "America/Chicago" },
          { name: "Eastern Time (NY)", value: "America/New_York" },
          { name: "Europe/London", value: "Europe/London" },
          { name: "Europe/Brussels", value: "Europe/Brussels" },
          { name: "Europe/Sofia", value: "Europe/Sofia" },
          { name: "Asia/Beirut", value: "Asia/Beirut" },
          { name: "Asia/Dubai", value: "Asia/Dubai" }
        )
    ) as SlashCommandBuilder;

  async execute(interaction: ChatInputCommandInteraction) {
    const raidId = interaction.options.getInteger("raid", true);
    const timezone = interaction.options.getString("timezone", true);
    const month = interaction.options.getInteger("month", true);
    const day = interaction.options.getInteger("day", true);
    const hour = interaction.options.getInteger("hour", true);
    const minute = interaction.options.getInteger("minute", true);
    let year = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    if (month < currentMonth) {
      year++;
    }
    const schedule = `${year}-${month}-${day} ${hour}:${minute}`;
    const date = moment.tz(schedule, "YYYY-M-D h:m", timezone);
    // "Day" allows 1–31 in every month, so 31 June parses as an invalid date
    // that used to reach the database as a bad value.
    if (!date.isValid()) {
      await interaction.reply({ content: `${year}-${month}-${day} is not a valid date.`, ephemeral: true });
      return;
    }
    if (date.valueOf() <= Date.now()) {
      await interaction.reply({ content: `<t:${date.unix()}:f> is in the past.`, ephemeral: true });
      return;
    }
    date.utc();
    await RaidScheduler.AddSingleSchedulingOptionToRaid(raidId, date.toDate());

    await interaction.reply({
      content: `Successfully added a scheduling option <t:${date.unix()}:f> to raid ${raidId}!`,
      ephemeral: true,
    });
  }

  async autocomplete(interaction: AutocompleteInteraction) {
    await respondWithOwnCustomRaids(interaction);
  }
}
