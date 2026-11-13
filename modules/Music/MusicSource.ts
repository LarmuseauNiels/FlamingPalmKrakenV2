import { spawn } from "child_process";
import { Readable } from "stream";
import net from "net";
import { createLogger } from "../../utils/logger";

const log = createLogger("MusicSource");

// Binaries are looked up on PATH; both are installed in the Docker image
// (see captain-definition). Override for local development if needed.
const YTDLP = process.env.YTDLP_PATH || "yt-dlp";
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

// yt-dlp needs a JavaScript runtime to solve YouTube's player challenges. Node
// is always present (it runs the bot), but yt-dlp only enables Deno by default.
// --ignore-config keeps a stray config file from changing what gets spawned.
const BASE_ARGS = ["--ignore-config", "--no-warnings", "--js-runtimes", "node"];

export const MAX_PLAYLIST_TRACKS = 100;
const RESOLVE_TIMEOUT_MS = 30_000;

export interface Track {
  title: string;
  url: string;
  /** Seconds; null for live streams or when the source doesn't say. */
  duration: number | null;
  author: string | null;
  thumbnail: string | null;
  isLive: boolean;
  /** Discord user ID of whoever queued it. */
  requestedBy: string;
}

export interface ResolveResult {
  tracks: Track[];
  /** Set when the query was a playlist URL. */
  playlistTitle: string | null;
}

/** A running yt-dlp → ffmpeg pipeline producing 48 kHz stereo s16le PCM. */
export interface TrackStream {
  stream: Readable;
  /** yt-dlp's error message if it exited non-zero, else null. */
  failure(): string | null;
  kill(): void;
}

/**
 * Turns a /play query into tracks: a URL (video, playlist, SoundCloud, ...)
 * is resolved as-is, anything else becomes a YouTube search for one result.
 */
export async function resolveQuery(
  query: string,
  requestedBy: string
): Promise<ResolveResult> {
  const trimmed = query.trim();
  const isUrl = /^https?:\/\//i.test(trimmed);
  if (isUrl) assertPublicUrl(trimmed);
  const target = isUrl ? trimmed : `ytsearch1:${trimmed}`;

  const info = await runJson([
    ...BASE_ARGS,
    "-J",
    "--flat-playlist",
    // For "watch?v=…&list=…" links, take the video rather than the playlist.
    "--no-playlist",
    "--playlist-end",
    String(MAX_PLAYLIST_TRACKS),
    "--",
    target,
  ]);

  const isPlaylist = info._type === "playlist";
  const entries: any[] = isPlaylist ? info.entries ?? [] : [info];
  const tracks = entries
    .map((e) => toTrack(e, requestedBy))
    .filter((t): t is Track => t !== null);

  return {
    tracks,
    // A search is also a "playlist" to yt-dlp; only report real ones.
    playlistTitle: isPlaylist && isUrl ? info.title ?? "playlist" : null,
  };
}

function toTrack(entry: any, requestedBy: string): Track | null {
  if (!entry) return null;
  const url: string | undefined =
    entry.webpage_url ??
    (typeof entry.url === "string" && /^https?:\/\//.test(entry.url)
      ? entry.url
      : entry.id && /youtube/i.test(entry.ie_key ?? entry.extractor ?? "")
      ? `https://www.youtube.com/watch?v=${entry.id}`
      : undefined);
  if (!url) return null;
  const title: string = entry.title ?? url;
  // Flat YouTube playlists list removed videos as placeholders.
  if (/^\[(private|deleted) video\]$/i.test(title)) return null;

  const thumbs: any[] = entry.thumbnails ?? [];
  return {
    title,
    url,
    duration: typeof entry.duration === "number" ? Math.round(entry.duration) : null,
    author: entry.channel ?? entry.uploader ?? entry.artist ?? null,
    thumbnail: entry.thumbnail ?? thumbs[thumbs.length - 1]?.url ?? null,
    isLive: entry.live_status === "is_live" || entry.is_live === true,
    requestedBy,
  };
}

/**
 * yt-dlp's generic extractor will fetch any URL it is given, so keep members
 * from pointing it at the host's own network (CapRover services, the router).
 */
function assertPublicUrl(raw: string) {
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  } catch {
    throw new MusicSourceError("That doesn't look like a valid link.");
  }
  const blocked =
    !host.includes(".") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "localhost" ||
    (net.isIP(host) !== 0 && isPrivateIp(host));
  if (blocked) throw new MusicSourceError("I can only play links to public websites.");
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    return ip === "::1" || /^(fc|fd|fe80)/i.test(ip) || ip.startsWith("::ffff:");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/** Starts streaming a track. The returned stream is raw PCM for @discordjs/voice. */
export function createTrackStream(track: Track): TrackStream {
  const ytdlp = spawn(
    YTDLP,
    [
      ...BASE_ARGS,
      "--quiet",
      "--no-playlist",
      "-f",
      "bestaudio[acodec=opus]/bestaudio/best",
      "-o",
      "-",
      "--",
      track.url,
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  const ffmpeg = spawn(
    FFMPEG,
    [
      "-loglevel", "error",
      "-i", "pipe:0",
      "-vn",
      "-f", "s16le",
      "-ar", "48000",
      "-ac", "2",
      "pipe:1",
    ],
    { stdio: ["pipe", "pipe", "pipe"] }
  );

  let ytdlpStderr = "";
  let ytdlpExit: number | null = null;
  let spawnError: string | null = null;

  ytdlp.stderr.on("data", (chunk) => {
    ytdlpStderr = (ytdlpStderr + chunk.toString()).slice(-2000);
  });
  ffmpeg.stderr.on("data", (chunk) => log.debug(`ffmpeg: ${chunk.toString().trim()}`));
  ytdlp.on("exit", (code) => {
    ytdlpExit = code;
    if (code) log.warn(`yt-dlp exited ${code} for ${track.url}: ${lastError(ytdlpStderr)}`);
  });
  ytdlp.on("error", (err) => {
    spawnError = `yt-dlp could not be started (${err.message})`;
    log.error(spawnError);
    ffmpeg.stdin.end();
  });
  ffmpeg.on("error", (err) => {
    spawnError = `ffmpeg could not be started (${err.message})`;
    log.error(spawnError);
    ffmpeg.stdout.destroy();
  });

  // Killing either side mid-track surfaces as EPIPE on the other; that's expected.
  ytdlp.stdout.on("error", () => {});
  ffmpeg.stdin.on("error", () => {});
  ytdlp.stdout.pipe(ffmpeg.stdin);

  return {
    stream: ffmpeg.stdout,
    failure() {
      if (spawnError) return spawnError;
      if (ytdlpExit) return lastError(ytdlpStderr) || `yt-dlp exited with code ${ytdlpExit}`;
      return null;
    },
    kill() {
      for (const proc of [ytdlp, ffmpeg]) {
        if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL");
      }
    },
  };
}

function runJson(args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new MusicSourceError("Looking that up took too long, try again."));
    }, RESOLVE_TIMEOUT_MS);

    proc.stdout.on("data", (c) => (stdout += c));
    proc.stderr.on("data", (c) => (stderr = (stderr + c).slice(-2000)));
    proc.on("error", (err) => {
      clearTimeout(timer);
      log.error("Failed to start yt-dlp", err);
      reject(new MusicSourceError("Music playback isn't set up on this server (yt-dlp is missing)."));
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const message = lastError(stderr);
        log.warn(`yt-dlp lookup failed (${code}): ${message}`);
        reject(new MusicSourceError(friendlyError(message)));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(new MusicSourceError("Couldn't read the result of that lookup."));
      }
    });
  });
}

/** Last "ERROR: …" line from yt-dlp, without the prefix. */
function lastError(stderr: string): string {
  const lines = stderr.split("\n").map((l) => l.trim()).filter(Boolean);
  const err = [...lines].reverse().find((l) => l.startsWith("ERROR:")) ?? lines[lines.length - 1] ?? "";
  return err.replace(/^ERROR:\s*/, "").slice(0, 300);
}

export function friendlyError(message: string): string {
  if (/unsupported url/i.test(message)) return "I can't play music from that site.";
  if (/sign in to confirm (you|your)['’]?re not a bot|not a bot/i.test(message))
    return "YouTube is blocking the bot right now (it wants a sign-in). Try another link or try again later.";
  if (/age[- ]restricted|confirm your age|inappropriate for some users/i.test(message))
    return "That video is age-restricted, so I can't play it.";
  if (/private video|unavailable|has been removed|not available|HTTP Error 404/i.test(message))
    return "That video or link is unavailable.";
  if (/requested format is not available|no video formats/i.test(message))
    return "I couldn't find any audio in that link.";
  return "Couldn't load that track.";
}

/** Errors whose message is safe to show to members as-is. */
export class MusicSourceError extends Error {}
