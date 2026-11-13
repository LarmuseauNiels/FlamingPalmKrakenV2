import {
  AudioPlayer,
  AudioPlayerStatus,
  AudioResource,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnection,
  VoiceConnectionDisconnectReason,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from "@discordjs/voice";
import {
  GuildMember,
  GuildTextBasedChannel,
  Message,
  VoiceBasedChannel,
  VoiceState,
} from "discord.js";
import { createLogger } from "../../utils/logger";
import {
  MusicSourceError,
  Track,
  TrackStream,
  createTrackStream,
  friendlyError,
} from "./MusicSource";
import { endedPayload, escapeMarkdown, nowPlayingPayload } from "./MusicEmbeds";

const log = createLogger("MusicPlayer");

export type LoopMode = "off" | "track" | "queue";

export const MAX_QUEUE = 500;
const DEFAULT_VOLUME = 50;
/** Leave after the queue has been empty this long. */
const IDLE_LEAVE_MS = 5 * 60_000;
/** Leave after being alone in the channel this long. */
const ALONE_LEAVE_MS = 2 * 60_000;
/** A track that stops sooner than this without a skip counts as failed. */
const FAILED_START_MS = 3_000;
/**
 * Starting a stream takes yt-dlp several seconds, so the next track's pipeline
 * is started this long before the current one ends. Until it's read, pipe
 * backpressure keeps it parked after the first few KB.
 */
const PREFETCH_MS = 20_000;

const players = new Map<string, GuildMusicPlayer>();

/** One per guild: the voice connection, the queue and the now-playing message. */
export class GuildMusicPlayer {
  readonly guildId: string;
  queue: Track[] = [];
  current: Track | null = null;
  loop: LoopMode = "off";
  volume = DEFAULT_VOLUME;

  private readonly connection: VoiceConnection;
  private readonly player: AudioPlayer;
  private textChannel: GuildTextBasedChannel;
  private resource: AudioResource<Track> | null = null;
  private stream: TrackStream | null = null;
  private prefetched: { track: Track; stream: TrackStream } | null = null;
  private readonly prefetchTimer: NodeJS.Timeout;
  private skipping = false;
  private trackErrored = false;
  private retriedCurrent = false;
  /** Pause asked for while the track was still loading; applied once it plays. */
  private pendingPause = false;
  private destroyed = false;
  private idleTimer: NodeJS.Timeout | null = null;
  private aloneTimer: NodeJS.Timeout | null = null;
  private nowPlayingMessage: Message | null = null;
  // Serialises now-playing message updates so a quick skip can't leave two behind.
  private messageChain: Promise<void> = Promise.resolve();

  static get(guildId: string): GuildMusicPlayer | undefined {
    return players.get(guildId);
  }

  /** Joins `channel` (or returns the guild's existing player). */
  static async connect(
    channel: VoiceBasedChannel,
    textChannel: GuildTextBasedChannel
  ): Promise<GuildMusicPlayer> {
    const existing = players.get(channel.guild.id);
    if (existing) return existing;

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });
    const music = new GuildMusicPlayer(connection, textChannel);
    players.set(channel.guild.id, music);

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch (err) {
      log.error("Voice connection did not become ready", err);
      music.destroy();
      throw new MusicSourceError("I couldn't connect to your voice channel. Try again in a moment.");
    }
    log.info(`Joined voice channel ${channel.name} in ${channel.guild.name}`);
    return music;
  }

  /** Routed from events/voiceStateUpdate.ts. */
  static onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
    const music = players.get(newState.guild.id);
    if (!music) return;
    const relevant = [oldState.channelId, newState.channelId].includes(music.channelId);
    if (relevant) music.checkAlone();
  }

  private constructor(connection: VoiceConnection, textChannel: GuildTextBasedChannel) {
    this.guildId = connection.joinConfig.guildId;
    this.connection = connection;
    this.textChannel = textChannel;
    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });
    connection.subscribe(this.player);
    this.prefetchTimer = setInterval(() => this.maybePrefetch(), 2_000);

    this.player.on("stateChange", (oldState, newState) => {
      if (newState.status === AudioPlayerStatus.Playing && this.pendingPause) {
        this.pendingPause = false;
        this.player.pause(true);
      }
      if (newState.status === AudioPlayerStatus.Idle && oldState.status !== AudioPlayerStatus.Idle) {
        this.onTrackEnd();
      }
    });
    this.player.on("error", (err) => {
      log.error(`Playback error for ${err.resource?.metadata?.["url"] ?? "unknown track"}`, err);
      this.trackErrored = true;
    });

    connection.on(VoiceConnectionStatus.Disconnected, async (_old, state) => {
      // 4014 = kicked/moved by someone; give Discord a moment to reconnect us
      // (a move), otherwise treat it as a disconnect.
      if (
        state.reason === VoiceConnectionDisconnectReason.WebSocketClose &&
        state.closeCode === 4014
      ) {
        try {
          await entersState(connection, VoiceConnectionStatus.Connecting, 5_000);
        } catch {
          this.destroy();
        }
        return;
      }
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        this.destroy();
      }
    });
    connection.on(VoiceConnectionStatus.Destroyed, () => this.destroy());
    connection.on("error", (err) => log.error("Voice connection error", err));
  }

  /** The voice channel the bot is currently in. */
  get channelId(): string | null {
    const guild = global.client.guilds.cache.get(this.guildId);
    return guild?.members.me?.voice.channelId ?? this.connection.joinConfig.channelId;
  }

  /** Where the now-playing message and notices are posted. */
  get textChannelId(): string {
    return this.textChannel.id;
  }

  get paused(): boolean {
    return this.pendingPause || this.player.state.status === AudioPlayerStatus.Paused;
  }

  /** Milliseconds into the current track. */
  get position(): number {
    return this.resource?.playbackDuration ?? 0;
  }

  /** Whether `member` is in the bot's voice channel (and may control playback). */
  isListening(member: GuildMember): boolean {
    return !!member.voice.channelId && member.voice.channelId === this.channelId;
  }

  /** Adds tracks; returns how many fit in the queue. Starts playing if idle. */
  enqueue(tracks: Track[], textChannel?: GuildTextBasedChannel): number {
    // Asked from another channel: the controls follow the request there.
    const moved = !!textChannel && textChannel.id !== this.textChannel.id;
    if (textChannel) this.textChannel = textChannel;
    const added = tracks.slice(0, Math.max(0, MAX_QUEUE - this.queue.length));
    this.queue.push(...added);
    this.clearIdleTimer();
    if (!this.current) this.playNext();
    else if (moved) this.updateMessage(nowPlayingPayload(this), "repost");
    else this.refreshNowPlaying();
    return added.length;
  }

  skip() {
    this.skipping = true;
    // Triggers the Idle transition, which plays the next track.
    this.player.stop(true);
  }

  /** Toggles pause; returns whether playback is now paused. */
  togglePause(): boolean {
    if (this.paused) this.resume();
    else this.pause();
    return this.paused;
  }

  pause(): boolean {
    let ok: boolean;
    if (this.player.state.status === AudioPlayerStatus.Buffering && this.current && !this.pendingPause) {
      // yt-dlp is still starting the stream; pause as soon as it plays.
      this.pendingPause = true;
      ok = true;
    } else {
      ok = this.player.pause(true);
    }
    // A parked download may time out during a long pause; re-fetch on resume.
    this.dropPrefetch();
    this.refreshNowPlaying();
    return ok;
  }

  resume(): boolean {
    const ok = this.pendingPause || this.player.unpause();
    this.pendingPause = false;
    this.refreshNowPlaying();
    return ok;
  }

  setVolume(percent: number) {
    this.volume = percent;
    this.resource?.volume?.setVolume(percent / 100);
    this.refreshNowPlaying();
  }

  setLoop(mode: LoopMode) {
    this.loop = mode;
    this.refreshNowPlaying();
  }

  cycleLoop(): LoopMode {
    const order: LoopMode[] = ["off", "track", "queue"];
    this.setLoop(order[(order.indexOf(this.loop) + 1) % order.length]);
    return this.loop;
  }

  shuffle() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    this.refreshNowPlaying();
  }

  /** Removes the track at 1-based queue position; returns it, or null if out of range. */
  remove(position: number): Track | null {
    if (position < 1 || position > this.queue.length) return null;
    const [track] = this.queue.splice(position - 1, 1);
    this.refreshNowPlaying();
    return track;
  }

  clearQueue(): number {
    const count = this.queue.length;
    this.queue = [];
    this.refreshNowPlaying();
    return count;
  }

  /** Stops playback, leaves the channel and forgets the queue. */
  destroy(farewell?: string) {
    if (this.destroyed) return;
    this.destroyed = true;
    players.delete(this.guildId);
    this.clearIdleTimer();
    this.clearAloneTimer();
    clearInterval(this.prefetchTimer);
    this.dropPrefetch();
    this.stream?.kill();
    this.stream = null;
    this.queue = [];
    this.current = null;
    this.player.stop(true);
    if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      this.connection.destroy();
    }
    this.updateMessage(endedPayload(farewell ?? "Stopped and left the voice channel."), "edit");
    log.info(`Music player for guild ${this.guildId} destroyed`);
  }

  private onTrackEnd() {
    if (this.destroyed) return;
    const track = this.current;
    const played = this.resource?.playbackDuration ?? 0;
    const failure = this.stream?.failure() ?? null;
    const failed =
      !this.skipping &&
      !!track &&
      (this.trackErrored || (played < FAILED_START_MS && !track.isLive));

    // YouTube hands out the odd transient 403; one fresh attempt usually works.
    if (failed && !this.retriedCurrent) {
      log.info(`Retrying ${track.url} after a failed start: ${failure ?? "no audio"}`);
      this.retriedCurrent = true;
      this.trackErrored = false;
      this.startTrack(track, true);
      return;
    }
    if (failed) {
      this.announce(`⚠️ Couldn't play **${escapeMarkdown(track.title)}**: ${friendlyError(failure ?? "")}`);
    }
    this.playNext(failed);
  }

  private playNext(previousFailed = false) {
    if (this.destroyed) return;
    this.stream?.kill();
    this.stream = null;

    const previous = this.current;
    if (previous && !previousFailed) {
      // Looping a track survives its natural end but not a skip.
      if (this.loop === "track" && !this.skipping) this.queue.unshift(previous);
      else if (this.loop === "queue") this.queue.push(previous);
    }
    this.skipping = false;
    this.trackErrored = false;
    this.retriedCurrent = false;

    const next = this.queue.shift();
    if (!next) {
      this.current = null;
      this.resource = null;
      this.updateMessage(endedPayload("Queue finished. Use `/play` to add more."), "edit");
      this.startIdleTimer();
      return;
    }

    this.startTrack(next, false);
    this.updateMessage(nowPlayingPayload(this), "repost");
  }

  private startTrack(next: Track, fresh: boolean) {
    this.stream?.kill();
    // Like a skip on a paused player, a new track starts playing.
    this.pendingPause = false;
    this.current = next;
    const prefetchedThis = this.prefetched?.track === next;
    if (prefetchedThis && !fresh) {
      this.stream = this.prefetched.stream;
      this.prefetched = null;
    } else {
      // A prefetch for some other track is stale now, unless this is a retry.
      if (prefetchedThis || !fresh) this.dropPrefetch();
      this.stream = createTrackStream(next);
    }
    this.resource = createAudioResource(this.stream.stream, {
      inputType: StreamType.Raw,
      inlineVolume: true,
      metadata: next,
    });
    this.resource.volume?.setVolume(this.volume / 100);
    this.player.play(this.resource);
  }

  /** The track playNext() would pick if the current one ended now. */
  private upcoming(): Track | null {
    if (this.loop === "track" && this.current) return this.current;
    return this.queue[0] ?? (this.loop === "queue" ? this.current : null);
  }

  private maybePrefetch() {
    const track = this.current;
    if (this.destroyed || this.paused || this.prefetched || !track) return;
    if (track.isLive || track.duration == null) return;
    if (track.duration * 1000 - this.position > PREFETCH_MS) return;
    const next = this.upcoming();
    if (next) this.prefetched = { track: next, stream: createTrackStream(next) };
  }

  private dropPrefetch() {
    this.prefetched?.stream.kill();
    this.prefetched = null;
  }

  /** Re-renders the current now-playing message in place. */
  refreshNowPlaying() {
    if (this.current && !this.destroyed) this.updateMessage(nowPlayingPayload(this), "edit");
  }

  /**
   * "repost" deletes the old message and sends a new one, so the controls stay
   * at the bottom of the channel when a new track starts. "edit" updates the
   * existing message in place, and does nothing if there isn't one.
   */
  private updateMessage(payload: any, mode: "repost" | "edit") {
    this.messageChain = this.messageChain.then(async () => {
      const old = this.nowPlayingMessage;
      try {
        if (mode === "edit") {
          if (old) await old.edit(payload);
          return;
        }
        if (old) {
          this.nowPlayingMessage = null;
          old.delete().catch(() => {});
        }
        this.nowPlayingMessage = await this.textChannel.send({
          ...payload,
          allowedMentions: { parse: [] },
        });
      } catch (err) {
        log.warn(`Couldn't update the now-playing message: ${err?.message ?? err}`);
      }
    });
  }

  /** Posts a short notice in the channel the now-playing message lives in. */
  announce(content: string) {
    this.textChannel
      .send({ content, allowedMentions: { parse: [] } })
      .catch((err) => log.warn(`Couldn't send music notice: ${err?.message ?? err}`));
  }

  private checkAlone() {
    const channelId = this.channelId;
    const channel = channelId ? global.client.channels.cache.get(channelId) : null;
    const listeners =
      channel && "members" in channel
        ? (channel as VoiceBasedChannel).members.filter((m) => !m.user.bot).size
        : 0;
    if (listeners > 0) {
      this.clearAloneTimer();
    } else if (!this.aloneTimer) {
      this.aloneTimer = setTimeout(
        () => this.destroy("Everyone left, so I left the voice channel too."),
        ALONE_LEAVE_MS
      );
    }
  }

  private startIdleTimer() {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(
      () => this.destroy("Nothing has been playing for a while, so I left the voice channel."),
      IDLE_LEAVE_MS
    );
  }

  private clearIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private clearAloneTimer() {
    if (this.aloneTimer) clearTimeout(this.aloneTimer);
    this.aloneTimer = null;
  }
}
