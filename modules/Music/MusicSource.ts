import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { Readable } from "stream";
import net from "net";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
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

/*
 * YouTube answers most datacenter IPs with "Sign in to confirm you're not a
 * bot". Two ways around it, both optional:
 * - YTDLP_COOKIES: a Netscape-format cookies.txt of a (throwaway) YouTube
 *   account, either pasted as-is or base64-encoded. YTDLP_COOKIES_FILE points
 *   at such a file instead (e.g. on a CapRover persistent directory).
 * - YTDLP_PROXY: route yt-dlp through a residential connection,
 *   e.g. http://user:pass@home.example.com:3128 or socks5://...
 */
const PROXY = process.env.YTDLP_PROXY || "";
const COOKIE_HEADER = /^#\s*(Netscape\s+)?HTTP Cookie File/i;
let cookiesBase: string | null | undefined;

/** Path of the configured cookies file, written once to tmp; null when none is set. */
function cookiesSource(): string | null {
  if (cookiesBase !== undefined) return cookiesBase;
  cookiesBase = null;
  try {
    let content: string | null = null;
    if (process.env.YTDLP_COOKIES_FILE) {
      content = fs.readFileSync(process.env.YTDLP_COOKIES_FILE, "utf8");
    } else if (process.env.YTDLP_COOKIES) {
      const raw = process.env.YTDLP_COOKIES.trim();
      content = raw.includes("\t") || COOKIE_HEADER.test(raw) ? raw : Buffer.from(raw, "base64").toString("utf8");
    }
    if (!content) return null;
    // Some env editors turn newlines into literal "\n".
    if (!content.includes("\n") && content.includes("\\n")) content = content.replace(/\\n/g, "\n");
    if (!content.includes("\t")) {
      log.error("YTDLP_COOKIES doesn't look like a Netscape cookies.txt (no tab-separated lines); ignoring it");
      return null;
    }
    // yt-dlp refuses files without the header line, which some exporters leave out.
    if (!COOKIE_HEADER.test(content)) content = "# Netscape HTTP Cookie File\n" + content;
    const file = path.join(os.tmpdir(), "kraken-ytdlp-cookies.txt");
    fs.writeFileSync(file, content.endsWith("\n") ? content : content + "\n", { mode: 0o600 });
    cookiesBase = file;
    log.info("yt-dlp will use the configured YouTube cookies");
  } catch (err) {
    log.error("Couldn't load the yt-dlp cookies", err);
  }
  return cookiesBase;
}

/**
 * Spawns yt-dlp with the auth options. yt-dlp writes cookies back on exit, so
 * each process gets its own copy: concurrent runs (lookup + prefetch) can't
 * clobber the file, and the original stays as exported.
 */
function spawnYtdlp(args: string[]): ChildProcessWithoutNullStreams {
  const extra: string[] = [];
  if (PROXY) extra.push("--proxy", PROXY);
  const source = cookiesSource();
  let copy: string | null = null;
  if (source) {
    copy = path.join(os.tmpdir(), `kraken-ytdlp-cookies-${crypto.randomBytes(6).toString("hex")}.txt`);
    try {
      fs.copyFileSync(source, copy);
      fs.chmodSync(copy, 0o600);
      extra.push("--cookies", copy);
    } catch (err) {
      log.error("Couldn't copy the yt-dlp cookies file", err);
      copy = null;
    }
  }
  // Options must come before the "--" that ends them in `args`.
  const proc = spawn(YTDLP, [...BASE_ARGS, ...extra, ...args], { stdio: ["ignore", "pipe", "pipe"] }) as any;
  if (copy) {
    const cleanup = () => fs.rm(copy!, { force: true }, () => {});
    proc.once("close", cleanup);
    proc.once("error", cleanup);
  }
  return proc;
}

/** Whether cookies or a proxy are set up, for error messages. */
export function hasYoutubeWorkaround(): boolean {
  return !!PROXY || cookiesSource() !== null;
}

let botCheckReported = false;

/** Tells the admins (bot log channel) once per process when YouTube's bot check blocks playback. */
function reportBotCheck(message: string) {
  if (botCheckReported || !/sign in to confirm|not a bot/i.test(message)) return;
  botCheckReported = true;
  const hint = hasYoutubeWorkaround()
    ? "YouTube's bot check is blocking music even though YTDLP_COOKIES / YTDLP_PROXY is set. The cookies have probably expired or been rotated: export fresh ones (see CLAUDE.md, Music Player)."
    : "YouTube's bot check is blocking music playback from this server's IP. Set YTDLP_COOKIES (base64 cookies.txt from a throwaway YouTube account) or YTDLP_PROXY. See CLAUDE.md, Music Player.";
  log.warn(hint);
  (global as any).client?.log?.(hint);
}

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
  const ytdlp = spawnYtdlp([
    "--quiet",
    "--no-playlist",
    "-f",
    "bestaudio[acodec=opus]/bestaudio/best",
    "-o",
    "-",
    "--",
    track.url,
  ]);
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
    if (code) {
      log.warn(`yt-dlp exited ${code} for ${track.url}: ${lastError(ytdlpStderr)}`);
      reportBotCheck(ytdlpStderr);
    }
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
    const proc = spawnYtdlp(args);
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
        reportBotCheck(message);
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
    return "YouTube is blocking the bot right now (it wants a sign-in), so YouTube songs won't play. SoundCloud links still work; the admins have been told.";
  if (/age[- ]restricted|confirm your age|inappropriate for some users/i.test(message))
    return "That video is age-restricted, so I can't play it.";
  if (/private video|unavailable|has been removed|not available|HTTP Error 404/i.test(message))
    return "That video or link is unavailable.";
  if (/proxy|connection refused|timed out|name or service not known|network is unreachable/i.test(message))
    return "I couldn't reach the music site right now. Try again in a moment.";
  if (/requested format is not available|no video formats/i.test(message))
    return "I couldn't find any audio in that link.";
  return "Couldn't load that track.";
}

/** Errors whose message is safe to show to members as-is. */
export class MusicSourceError extends Error {}
