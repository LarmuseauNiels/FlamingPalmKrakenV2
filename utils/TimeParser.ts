import moment from "moment-timezone";

export class TimeParser {
  private static readonly TIME_SUFFIXES = [
    "HH:mm",
    "H:mm",
    "hh:mm A",
    "hh:mma",
    "h:mm A",
    "h:mma",
  ];

  private static readonly PARSE_FORMATS: string[] = [
    // Date+time with year
    ...["YYYY-MM-DD", "DD/MM/YYYY", "MMMM D YYYY", "D MMMM YYYY"].flatMap((d) =>
      this.TIME_SUFFIXES.map((t) => `${d} ${t}`)
    ),
    // Date-only with year
    "YYYY-MM-DD",
    "DD/MM/YYYY",
    // Date+time without year (defaults to current year)
    ...["DD/MM", "MMMM D", "D MMMM"].flatMap((d) =>
      this.TIME_SUFFIXES.map((t) => `${d} ${t}`)
    ),
    // Date-only without year (defaults to current year)
    "DD/MM",
    "MMMM D",
    "D MMMM",
    // Time-only (defaults to today)
    ...this.TIME_SUFFIXES,
  ];

  /**
   * Parses a date/time string based on a given timezone and a set of predefined formats.
   * If traditional parsing fails, it falls back to Google AI (Gemini).
   * @param input The date/time string to parse.
   * @param timezone The timezone to use for parsing (e.g., "Europe/Brussels", "UTC").
   * @returns A Promise resolving to a moment object (check .isValid() for success).
   */
  static async parse(input: string, timezone: string = "UTC"): Promise<moment.Moment> {
    const traditional = moment.tz(input, this.PARSE_FORMATS, true, timezone);
    if (traditional.isValid()) return traditional;

    // Fallback to AI
    try {
      const aiParsed = await global.client.googleAI.parseDate(input, timezone);
      if (aiParsed) {
        return moment.tz(aiParsed, timezone);
      }
    } catch (e) {
      // Silence AI errors and return the invalid traditional object
    }

    return traditional;
  }
}
