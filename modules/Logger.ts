import { TextChannel } from "discord.js";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL = process.env.NODE_ENV === "production" ? LogLevel.INFO : LogLevel.DEBUG;

export const logger = {
  debug(message: string, ...args: unknown[]) {
    if (LOG_LEVEL <= LogLevel.DEBUG) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },

  info(message: string, ...args: unknown[]) {
    if (LOG_LEVEL <= LogLevel.INFO) {
      console.log(`[INFO] ${message}`, ...args);
    }
  },

  warn(message: string, ...args: unknown[]) {
    if (LOG_LEVEL <= LogLevel.WARN) {
      console.warn(`[WARN] ${message}`, ...args);
    }
    sendToDiscord(`⚠️ ${message}`);
  },

  error(message: string, error?: unknown) {
    console.error(`[ERROR] ${message}`, error ?? "");
    sendToDiscord(`🔴 ${message}`);
    if (error && global.bugsnag) {
      global.bugsnag.notify(error instanceof Error ? error : new Error(String(error)));
    }
  },
};

function sendToDiscord(message: string) {
  try {
    const logChannel = global.client?.logChannel as TextChannel | undefined;
    if (logChannel) {
      const truncated = message.length > 1900 ? message.slice(0, 1900) + "..." : message;
      logChannel.send("```" + truncated + "```");
    }
  } catch {
    // Swallow errors from logging itself to prevent infinite loops
  }
}
