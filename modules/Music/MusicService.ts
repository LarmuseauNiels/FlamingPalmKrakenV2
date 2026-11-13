import { GuildMember, GuildTextBasedChannel, PermissionFlagsBits } from "discord.js";
import { GuildMusicPlayer } from "./MusicPlayer";
import { MusicSourceError, Track, resolveQuery } from "./MusicSource";

/**
 * The checks and steps behind "play this for me", shared by /play and the
 * Kraken AI's playMusic tool. Everything that can go wrong for the member
 * throws a MusicSourceError with a message that can be shown as-is.
 */
export interface PlayResult {
  music: GuildMusicPlayer;
  /** Tracks actually added (the queue may have been too full for all). */
  added: Track[];
  /** How many the query resolved to. */
  found: number;
  playlistTitle: string | null;
  /** True when the first added track started straight away. */
  startedNow: boolean;
  /** 1-based queue position of the first added track; 0 when it is playing. */
  position: number;
}

/**
 * Joins `member`'s voice channel if needed and queues `query`.
 * `textChannel` is where the now-playing message goes; when omitted, an
 * existing player keeps its channel and a new one uses the voice channel's chat.
 */
export async function playForMember(
  member: GuildMember,
  query: string,
  textChannel?: GuildTextBasedChannel | null
): Promise<PlayResult> {
  const voiceChannel = member.voice.channel;
  if (!voiceChannel) throw new MusicSourceError("Join a voice channel first, then try again.");

  const existing = GuildMusicPlayer.get(member.guild.id);
  if (existing?.channelId && existing.channelId !== voiceChannel.id) {
    throw new MusicSourceError(
      `I'm already playing music in <#${existing.channelId}>. Join that channel to add songs.`
    );
  }

  const me = member.guild.members.me;
  const perms = me ? voiceChannel.permissionsFor(me) : null;
  if (!perms?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]) || !voiceChannel.joinable) {
    throw new MusicSourceError(`I don't have permission to join and speak in <#${voiceChannel.id}>.`);
  }

  const { tracks, playlistTitle } = await resolveQuery(query, member.id);
  if (tracks.length === 0) throw new MusicSourceError(`No results for "${query}".`);

  const music = await GuildMusicPlayer.connect(voiceChannel, textChannel ?? (voiceChannel as any));
  const startedNow = !music.current;
  const before = music.queue.length;
  const count = music.enqueue(tracks, textChannel ?? undefined);
  if (count === 0) throw new MusicSourceError("The queue is full. Skip or remove some songs first.");

  return {
    music,
    added: tracks.slice(0, count),
    found: tracks.length,
    playlistTitle,
    startedNow,
    position: startedNow ? 0 : before + 1,
  };
}

/**
 * The guild's player if `member` may change playback (they're in its voice
 * channel), otherwise a reason they can't.
 */
export function controllablePlayer(
  member: GuildMember
): { music: GuildMusicPlayer } | { error: string } {
  const music = GuildMusicPlayer.get(member.guild.id);
  if (!music) return { error: "Nothing is playing. Use `/play` to start." };
  if (!music.isListening(member)) return { error: `Join <#${music.channelId}> to control the music.` };
  return { music };
}
