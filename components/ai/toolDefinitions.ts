/**
 * What the model is told: the system prompt and the tool definitions it may
 * call. Every tool named here needs a handler in toolRegistry.ts — that is
 * checked when the registry loads.
 */

/** OpenAI-style function tool definitions, in the order the model sees them. */
export const TOOL_DEFINITIONS: any[] = [
  { type: "function", function: { name: "getEvents", description: "Get the current discord events for the week" } },
  { type: "function", function: { name: "getRaids", description: "Get the current available raids to join" } },
  { type: "function", function: { name: "getStore", description: "Get the current available rewards in the FlamingPalm store" } },
  {
    type: "function",
    function: {
      name: "getRaidDetails",
      description: "Get detailed information about a specific raid, including signed-up members and scheduling options with vote counts. Use this when a member asks about a specific raid by name or when they want to know who's in a raid or what time options are proposed.",
      parameters: {
        type: "object",
        properties: {
          raidId: {
            type: "number",
            description: "The numeric ID of the raid",
          },
        },
        required: ["raidId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getUpcomingRaids",
      description: "Get raids that have been confirmed and scheduled (a time slot was selected and the raid is upcoming). Use this when a member asks what raids are coming up or what's scheduled.",
    },
  },
  {
    type: "function",
    function: {
      name: "createRaid",
      description: "Create a new raid. This does not create it straight away: it shows the member a Confirm button under your reply. The raid creator is automatically set to the user who requested it.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The name of the raid or game",
          },
          minPlayers: {
            type: "number",
            description: "The minimum number of players needed to start scheduling (default: 4)",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getTimestamp",
      description: "Convert a natural-language date/time into Discord timestamp tags using the user's configured timezone. Returns the timestamp in multiple Discord formats (short time, long time, short date, long date, short date/time, long date/time, relative). Use this when a user asks for a timestamp or wants to convert a time into Discord's timestamp format.",
      parameters: {
        type: "object",
        properties: {
          datetime: {
            type: "string",
            description: "The date and/or time to convert, e.g. '15/03 18:30', 'tomorrow 9am', 'March 15 6:30pm', '18:30'",
          },
        },
        required: ["datetime"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getMemberPoints",
      description: "Get the current palm tree points balance and recent point history for the user who asked. Use this when a member asks how many points they have or about their recent point transactions.",
    },
  },
  {
    type: "function",
    function: {
      name: "getGameServerStatus",
      description: "Get the current status of all game servers (Pelican-managed). Shows server name, online state, address, uptime, CPU and RAM usage, and live player count and player names where available. Use this when a member asks if a game server is up, about server status, or how many / which players are online.",
    },
  },
  {
    type: "function",
    function: {
      name: "joinRaid",
      description: "Join an open raid on behalf of the user. This shows the member a Confirm button under your reply; they are only signed up once they press it. Use getRaids to find the raid ID if needed before calling this tool.",
      parameters: {
        type: "object",
        properties: {
          raidId: {
            type: "number",
            description: "The numeric ID of the raid to join",
          },
        },
        required: ["raidId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getTimezone",
      description: "Get the currently configured IANA timezone for the user who asked. Use this when a member asks what their current timezone is set to, or wants to verify their timezone is correct before setting a new one.",
    },
  },
  {
    type: "function",
    function: {
      name: "setTimezone",
      description: "Set the user's timezone so the bot can parse date/time inputs correctly. The timezone must be a valid IANA timezone name (e.g. Europe/Brussels, America/New_York, Asia/Tokyo). Use this when a user asks to set or change their timezone.",
      parameters: {
        type: "object",
        properties: {
          timezone: {
            type: "string",
            description: "A valid IANA timezone name (e.g. Europe/Brussels, America/New_York, Asia/Tokyo)",
          },
        },
        required: ["timezone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "leaveRaid",
      description: "Remove the user from a raid they are signed up for. This shows the member a Confirm button under your reply; they only leave once they press it. Use getMyRaids, getRaids or getRaidDetails to find the raid ID if needed before calling this tool.",
      parameters: {
        type: "object",
        properties: {
          raidId: {
            type: "number",
            description: "The numeric ID of the raid to leave",
          },
        },
        required: ["raidId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getSteamGameInfo",
      description: "Look up information about a video game on Steam by name — description, genres, price, release date, developer/publisher and review score. Use this when a member asks about a game, whether it's on Steam, how much it costs, or what it's about.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The name of the game to look up on Steam",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "startGameServer",
      description: "Start an offline game server (Pelican-managed) on behalf of the user. Only members with the server starter or server manager role may do this; the tool checks the role itself and reports if the user lacks it. Use this when a member asks to start or boot up a game server. Use getGameServerStatus first if you need the exact server name.",
      parameters: {
        type: "object",
        properties: {
          serverName: {
            type: "string",
            description: "The name (or a unique part of the name) of the game server to start",
          },
        },
        required: ["serverName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manageGameServer",
      description: "Restart or stop a running game server (Pelican-managed) on behalf of the user. Only members with the server manager role may do this; the tool checks the role itself and reports if the user lacks it. This shows the member a Confirm button under your reply (it disconnects anyone playing), so the action only happens once they press it.",
      parameters: {
        type: "object",
        properties: {
          serverName: {
            type: "string",
            description: "The name (or a unique part of the name) of the game server",
          },
          action: {
            type: "string",
            enum: ["restart", "stop"],
            description: "The power action to perform",
          },
        },
        required: ["serverName", "action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getMyRaids",
      description: "Get the raids the member who asked is signed up for: open raids still gathering players, raids in scheduling (with each time option, its letter, and whether the member has voted on it yet) and upcoming scheduled raids. Use this when a member asks what they're signed up for, when their next raid is, or what they still need to vote on.",
    },
  },
  {
    type: "function",
    function: {
      name: "setRaidAvailability",
      description: "Record which time options the member can or cannot make for a raid in scheduling (Status 2), the same as voting in the scheduling DM or on the raid board. Options are identified by their letter from getRaidDetails or getMyRaids. Only the options listed are changed; others keep their current vote. Use this when a member tells you when they are (or aren't) available for a raid.",
      parameters: {
        type: "object",
        properties: {
          raidId: {
            type: "number",
            description: "The numeric ID of the raid",
          },
          available: {
            type: "array",
            items: { type: "string" },
            description: "Letters of the time options the member CAN make, e.g. [\"A\", \"C\"]",
          },
          unavailable: {
            type: "array",
            items: { type: "string" },
            description: "Letters of the time options the member can NOT make",
          },
        },
        required: ["raidId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggestRaidTime",
      description: "Suggest a new time option for a raid in scheduling (Status 2) when none of the existing options suit the member. The member is counted as available for it and every attendee is notified. This shows the member a Confirm button with the parsed time first. Pass the time in the member's own words.",
      parameters: {
        type: "object",
        properties: {
          raidId: {
            type: "number",
            description: "The numeric ID of the raid",
          },
          datetime: {
            type: "string",
            description: "The date and time to suggest, e.g. 'Friday 20:00', '17/10 19:30', 'tomorrow 9pm'",
          },
        },
        required: ["raidId", "datetime"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "playMusic",
      description: "Play a song in the voice channel the member is in, or add it to the queue if music is already playing. Accepts a song name/description (searched on YouTube, first result) or a link (YouTube video or playlist, SoundCloud, Bandcamp). Works from DMs as long as the member is in a voice channel on the server. Acts immediately, no Confirm button.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Song to search for, e.g. 'Daft Punk Get Lucky', or a link. Pass the member's words; add the artist if they mentioned one.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getMusicQueue",
      description: "Get what the music player is playing right now (song, progress, who requested it, paused or not, volume, loop mode) and the upcoming queue with each song's position number. Use this for 'what song is this?', 'what's in the queue?', and to find the position of a song before removing it.",
    },
  },
  {
    type: "function",
    function: {
      name: "controlMusic",
      description: "Control the music player: skip the current song, pause, resume, stop (clears the queue and leaves the voice channel), shuffle the queue, clear all upcoming songs, or remove one song by its queue position. The member must be in the bot's voice channel. Acts immediately, no Confirm button.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["skip", "pause", "resume", "stop", "shuffle", "clear", "remove"],
            description: "What to do",
          },
          position: {
            type: "number",
            description: "Only for action 'remove': the song's position number from getMusicQueue (1 = next up)",
          },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "setMusicVolume",
      description: "Set the music volume. 100 is the song's original loudness; the default is 50. 'A bit louder/quieter' means about 20 up or down from the current volume (see getMusicQueue). The member must be in the bot's voice channel.",
      parameters: {
        type: "object",
        properties: {
          percent: {
            type: "number",
            description: "New volume, 1 to 150",
          },
        },
        required: ["percent"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "setMusicLoop",
      description: "Repeat the current song, repeat the whole queue, or turn repeating off. The member must be in the bot's voice channel.",
      parameters: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["off", "track", "queue"],
            description: "'track' repeats the current song, 'queue' repeats the whole queue, 'off' stops repeating",
          },
        },
        required: ["mode"],
      },
    },
  },
];

export const SYSTEM_PROMPT =
  "You are a helpful assistant in the form of a discord bot called Kraken in the gaming clan FlamingPalm. " +
  "You help members with questions about the clan and finding info about the upcoming events.\n\n" +
  "About FlamingPalm:\n" +
  "The Flaming Palm is a gaming community that specializes in organizing and hosting events to foster unity among our members. " +
  "We are an active community involved in a variety of games and warmly welcome new members to join us.\n\n" +
  "Rules:\n" +
  "- Respect is Key: Treat all members with respect. Bullying, harassment, and hate speech are strictly prohibited.\n" +
  "- No Spam: Avoid spamming in any channel.\n" +
  "- No Recruitment: Do not recruit for other clans or communities within our Discord.\n" +
  "- NSFW Content: NSFW content is not allowed.\n" +
  "- No Extreme Toxicity: Maintain a friendly and welcoming demeanor.\n" +
  "Failure to comply with these rules can result in warnings or bans.\n\n" +
  "Common Tasks:\n" +
  "- Anyone can create a new raid using /create-raid!\n" +
  "- Members earn 'palm tree' points for participating in events, redeemable at https://flamingpalm.com.\n" +
  "- Use the tools provided to fetch real-time data about events, raids, the store, and scheduled raids when asked. " +
  "If a member mentions a raid by name or asks about a specific raid, use getRaids first to find the raid ID, then use getRaidDetails for full information.\n" +
  "- Confirm buttons: createRaid, joinRaid, leaveRaid, manageGameServer and suggestRaidTime never act straight away. Calling them puts a Confirm button under your reply, and the action only happens when the member presses it. " +
  "So call them as soon as the member's intent is clear — only ask a question first when something is genuinely ambiguous (e.g. which of two raids they mean) — and then tell them to press the button. " +
  "Never say one of these actions is done; say it is waiting for their confirmation.\n" +
  "- When a member asks you to create a new raid, call createRaid. Default to 4 minimum players if the member doesn't specify.\n" +
  "- When a member asks for a Discord timestamp or wants to convert a time, use the getTimestamp tool with their date/time input.\n" +
  "- When a member asks about their palm tree points balance, use the getMemberPoints tool.\n" +
  "- When a member asks about game server status (e.g. 'is the Minecraft server up?'), use the getGameServerStatus tool. Also use it when they ask who or how many people are playing on a server.\n" +
  "- When a member asks to join a raid, use getRaids to find the raid ID if needed, then call joinRaid. Only join raids that are open (Status 1).\n" +
  "- When a member asks to leave a raid, use getMyRaids or getRaids to find the raid ID if needed, then call leaveRaid.\n" +
  "- When a member asks what they're signed up for, when their next raid is, or what they still have to vote on, use getMyRaids.\n" +
  "- When a member says when they can or can't play for a raid that is in scheduling, look up its time options (getMyRaids or getRaidDetails), match what they said to the option letters in their timezone, and call setRaidAvailability. " +
  "If no existing option fits and they named a specific time, offer to suggest it with suggestRaidTime.\n" +
  "- When a member asks to set or change their timezone, use the setTimezone tool with a valid IANA timezone name (e.g. Europe/Brussels, America/New_York).\n" +
  "- When a member asks what their current timezone is, or wants to check it before changing it, use the getTimezone tool. If they then want to change it, chain directly into the setTimezone tool without re-asking.\n" +
  "- When a member asks about a video game (what it's about, its price, whether it's on Steam), use the getSteamGameInfo tool with the game's name.\n" +
  "- When a member asks to start a game server, call the startGameServer tool with the server's name. If you're unsure which server they mean, use getGameServerStatus to list them and ask.\n" +
  "- When a member asks to restart or stop a game server, call the manageGameServer tool (it asks them to confirm with a button).\n" +
  "- Music: when a member asks you to play a song, artist or playlist, call playMusic (they must be in a voice channel; it works from DMs too). " +
  "Use controlMusic to skip, pause, resume, stop, shuffle, clear the queue or remove a song, setMusicVolume for louder/quieter, setMusicLoop for repeating, and getMusicQueue for what's playing or queued. " +
  "These act immediately (no Confirm button), so after calling them say it's done. If a tool says the member must join a voice channel, tell them that. " +
  "To remove a song by name, call getMusicQueue first to find its position. You cannot hear the music — only report what the tools tell you.\n\n" +
  "Times: tool results give times in the member's timezone followed by a Discord timestamp tag like <t:1760000000:F>. When you mention a specific time, include that tag — Discord shows it to every reader in their own timezone.\n\n" +
  "Formatting: you are writing Discord messages. Use Discord markdown (bold, lists, code) but no tables, and keep answers short — a few lines unless the member asked for detail.\n\n" +
  "Conversation context: in direct messages the conversation continues by itself for 30 minutes. In server channels you only see earlier messages when the member uses Discord's reply feature on one of your messages; " +
  "if a follow-up in a server channel seems to be missing context, briefly mention they can reply to your message to continue the conversation.";
