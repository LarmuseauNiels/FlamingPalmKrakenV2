export const config = {
  channels: {
    log: process.env.LOG_CHANNEL_ID!,
    updates: process.env.UPDATE_CHANNEL_ID!,
    lfg: process.env.LFG_CHANNEL_ID!,
    vintageStory: process.env.VINTAGE_STORY_CHANNEL_ID!,
    afk: process.env.AFK_CHANNEL_ID!,
    announcements: process.env.ANNOUNCEMENTS_CHANNEL_ID!,
    purchases: process.env.PURCHASES_CHANNEL_ID!,
    partyForum: process.env.PARTY_FORUM_CHANNEL_ID!,
    dailyLogin: process.env.DAILY_LOGIN_CHANNEL_ID!,
  },
  botOwnerId: process.env.BOT_OWNER_ID!,
  guildId: process.env.GUILD_ID!,
  jwtSecret: process.env.JWT_SECRET || process.env.TOKEN!,
};
