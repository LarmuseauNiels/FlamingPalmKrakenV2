/** Kraken AI tools for the voice-channel music player. They act immediately (no Confirm button). */
import { createLogger } from "../../utils/logger";
import { GuildMember, GuildTextBasedChannel } from "discord.js";
import { GuildMusicPlayer, LoopMode } from "../../modules/Music/MusicPlayer";
import { MusicSourceError, Track } from "../../modules/Music/MusicSource";
import { controllablePlayer, playForMember } from "../../modules/Music/MusicService";
import { escapeMarkdown, formatDuration } from "../../modules/Music/MusicEmbeds";
import { ToolContext } from "./types";
import { getGuildMember, memberName, parseArgs } from "./toolHelpers";

const log = createLogger("OllamaAI");

/** "Title" by Author (3:32) */
export function describeTrack(track: Track): string {
  const by = track.author ? ` by ${track.author}` : "";
  return `"${track.title}"${by} (${formatDuration(track.duration, track.isLive)})`;
}

/**
 * When the member asked from somewhere other than the music channel (e.g. a
 * DM), tell the listeners who changed the music.
 */
export function announceMusicChange(music: GuildMusicPlayer, ctx: ToolContext, text: string) {
  if (ctx.channelId === music.textChannelId) return;
  music.announce(`${text} — <@${ctx.authorId}> via Kraken`);
}

export async function playMusicString(rawArgs: string | object, ctx: ToolContext): Promise<string> {
  const args = parseArgs(rawArgs);
  const query = typeof args?.query === "string" ? args.query.trim().slice(0, 500) : "";
  if (!query) return "Please provide a song name or link to play.";

  try {
    const member = await getGuildMember(ctx.authorId);
    if (!member) return "The member is not on the FlamingPalm server.";
    if (!member.voice.channel) {
      return "The member is not in a voice channel. Tell them to join one on the server first, then ask again.";
    }

    // Asked in a server channel: post the now-playing message there.
    // From a DM: keep the player's channel, or use the voice channel's chat.
    let textChannel: GuildTextBasedChannel | null = null;
    if (!ctx.isDM && ctx.channelId) {
      const channel: any = global.client.channels.cache.get(ctx.channelId);
      if (channel?.guildId === member.guild.id && channel.isTextBased?.()) textChannel = channel;
    }

    const result = await playForMember(member, query, textChannel);
    const voice = `<#${result.music.channelId}>`;
    let text: string;
    if (result.playlistTitle) {
      const left = result.found - result.added.length;
      text = `Added ${result.added.length} songs from the playlist "${result.playlistTitle}" in ${voice}` +
        (left > 0 ? ` (${left} didn't fit, the queue is full).` : ".") +
        (result.startedNow ? ` Now playing ${describeTrack(result.added[0])}.` : "");
    } else if (result.startedNow) {
      text = `Now playing ${describeTrack(result.added[0])} in ${voice}.`;
    } else {
      text = `Queued ${describeTrack(result.added[0])} at position ${result.position} in ${voice}.`;
    }
    const notice = result.playlistTitle
      ? `📃 Added playlist **${escapeMarkdown(result.playlistTitle)}**`
      : `🎵 ${result.startedNow ? "Playing" : "Queued"} **${escapeMarkdown(result.added[0].title)}**`;
    announceMusicChange(result.music, ctx, notice);
    log.info(`User ${ctx.authorId} played "${query}" via Kraken AI`);
    return text + ` A now-playing message with control buttons is in <#${result.music.textChannelId}>.`;
  } catch (err) {
    if (err instanceof MusicSourceError) return `Couldn't play that: ${err.message}`;
    log.error("playMusic tool failed:", err);
    return "Something went wrong starting the music. Please try again later.";
  }
}

export function getMusicQueueString(): string {
  const music = GuildMusicPlayer.get(process.env.GUILD_ID!);
  if (!music || !music.current) {
    return music
      ? "Nothing is playing; the queue is empty. The bot is still in the voice channel."
      : "The music player is not running. Members can start it with playMusic or /play.";
  }
  const current = music.current;
  const elapsed = formatDuration(Math.floor(music.position / 1000));
  let text = `${music.paused ? "Paused" : "Now playing"} in <#${music.channelId}>: ${describeTrack(current)}, ` +
    `${elapsed} in, requested by ${memberName(current.requestedBy)}.\n`;
  text += `Volume ${music.volume}%, loop: ${music.loop}.\n`;
  if (music.queue.length === 0) return text + "Nothing queued after it.";
  const shown = music.queue.slice(0, 15);
  text += `Up next (${music.queue.length} total):\n`;
  text += shown.map((t, i) => `${i + 1}. ${describeTrack(t)}, requested by ${memberName(t.requestedBy)}`).join("\n");
  if (music.queue.length > shown.length) text += `\n…and ${music.queue.length - shown.length} more.`;
  return text;
}

export async function controlMusicString(tool: string, rawArgs: string | object, ctx: ToolContext): Promise<string> {
  const args = parseArgs(rawArgs) ?? {};
  try {
    const member = await getGuildMember(ctx.authorId);
    if (!member) return "The member is not on the FlamingPalm server.";
    const access = controllablePlayer(member);
    if ("error" in access) {
      return `Can't do that: ${access.error.replace("Use `/play` to start.", "They can ask you to play something.")}`;
    }
    const music = access.music;
    const done = (result: string, notice: string) => {
      announceMusicChange(music, ctx, notice);
      log.info(`User ${ctx.authorId} used ${tool} via Kraken AI: ${result}`);
      return result;
    };

    if (tool === "setMusicVolume") {
      const percent = Math.round(Number(args.percent));
      if (!Number.isFinite(percent) || percent < 1 || percent > 150) return "The volume must be between 1 and 150.";
      music.setVolume(percent);
      return done(`Volume set to ${percent}%.`, `🔊 Volume set to **${percent}%**`);
    }
    if (tool === "setMusicLoop") {
      const mode = args.mode as LoopMode;
      if (!["off", "track", "queue"].includes(mode)) return 'The loop mode must be "off", "track" or "queue".';
      music.setLoop(mode);
      const label = { off: "Looping turned off", track: "Looping the current song", queue: "Looping the whole queue" }[mode];
      return done(`${label}.`, `🔁 ${label}`);
    }

    switch (args.action) {
      case "skip": {
        const skipped = music.current;
        if (!skipped) return "Nothing is playing to skip.";
        // Mirrors playNext(): a skip ignores track-loop; queue-loop re-adds the skipped song at the end.
        const next = music.queue[0] ?? (music.loop === "queue" ? skipped : null);
        music.skip();
        return done(
          `Skipped ${describeTrack(skipped)}.` + (next ? ` Next up: ${describeTrack(next)}.` : " The queue is now empty."),
          `⏭️ Skipped **${escapeMarkdown(skipped.title)}**`
        );
      }
      case "pause":
        if (!music.pause()) return "The music is already paused (or nothing is playing).";
        return done("Paused the music.", "⏸️ Paused");
      case "resume":
        if (!music.resume()) return "The music isn't paused.";
        return done("Resumed the music.", "▶️ Resumed");
      case "stop":
        // destroy() turns the now-playing message into this notice.
        music.destroy(`Music stopped by ${member.displayName} via Kraken.`);
        log.info(`User ${ctx.authorId} stopped the music via Kraken AI`);
        return "Stopped the music, cleared the queue and left the voice channel.";
      case "shuffle":
        if (music.queue.length < 2) return "There aren't enough songs in the queue to shuffle.";
        music.shuffle();
        return done(`Shuffled ${music.queue.length} songs.`, "🔀 Shuffled the queue");
      case "clear": {
        const count = music.clearQueue();
        return done(`Removed ${count} upcoming songs; the current song keeps playing.`, `🧹 Cleared ${count} songs from the queue`);
      }
      case "remove": {
        const position = Math.round(Number(args.position));
        if (!Number.isFinite(position)) return "Give the position of the song to remove (from getMusicQueue).";
        const removed = music.remove(position);
        if (!removed) return `There's no song at position ${position}; the queue has ${music.queue.length}.`;
        return done(`Removed ${describeTrack(removed)} from the queue.`, `🗑️ Removed **${escapeMarkdown(removed.title)}** from the queue`);
      }
      default:
        return 'Unknown action. Use one of: skip, pause, resume, stop, shuffle, clear, remove.';
    }
  } catch (err) {
    log.error(`${tool} tool failed:`, err);
    return "Something went wrong controlling the music. Please try again later.";
  }
}
