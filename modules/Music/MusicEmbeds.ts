import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import type { GuildMusicPlayer, LoopMode } from "./MusicPlayer";
import type { Track } from "./MusicSource";

const COLOR = 0x1db954;
const QUEUE_PAGE_SIZE = 10;

const LOOP_LABEL: Record<LoopMode, string> = {
  off: "Off",
  track: "Track",
  queue: "Queue",
};

export function escapeMarkdown(text: string): string {
  return text.replace(/([*_`~|\\[\]])/g, "\\$1");
}

/** 3:07, 1:02:45, or "Live". */
export function formatDuration(seconds: number | null, isLive = false): string {
  if (isLive) return "🔴 Live";
  if (seconds == null) return "?:??";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** "[Title](url)" with the title cut to fit Discord's limits. */
export function trackLink(track: Track, max = 80): string {
  const title = track.title.length > max ? `${track.title.slice(0, max - 1)}…` : track.title;
  // Parentheses in the URL would end the markdown link early.
  const url = track.url.replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `[${escapeMarkdown(title)}](${url})`;
}

export function nowPlayingPayload(music: GuildMusicPlayer) {
  const track = music.current;
  if (!track) return endedPayload("Nothing is playing.");

  const next = music.queue[0];
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor({ name: music.paused ? "⏸️ Paused" : "🎶 Now playing" })
    .setDescription(`**${trackLink(track, 200)}**${track.author ? `\n${escapeMarkdown(track.author)}` : ""}`)
    .addFields(
      { name: "Length", value: formatDuration(track.duration, track.isLive), inline: true },
      { name: "Requested by", value: `<@${track.requestedBy}>`, inline: true },
      { name: "Up next", value: next ? trackLink(next, 60) : "Nothing queued", inline: false }
    )
    .setFooter({
      text: `Volume ${music.volume}% · Loop: ${LOOP_LABEL[music.loop]} · ${music.queue.length} in queue`,
    });
  if (track.thumbnail) embed.setThumbnail(track.thumbnail);

  return { embeds: [embed], components: [controlsRow(music)] };
}

export function endedPayload(message: string) {
  const embed = new EmbedBuilder().setColor(0x95a5a6).setDescription(`⏹️ ${message}`);
  return { embeds: [embed], components: [] };
}

function controlsRow(music: GuildMusicPlayer) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("music_pause")
      .setEmoji(music.paused ? "▶️" : "⏸️")
      .setLabel(music.paused ? "Resume" : "Pause")
      .setStyle(music.paused ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music_skip")
      .setEmoji("⏭️")
      .setLabel("Skip")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("music_stop")
      .setEmoji("⏹️")
      .setLabel("Stop")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("music_shuffle")
      .setEmoji("🔀")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(music.queue.length < 2),
    new ButtonBuilder()
      .setCustomId("music_loop")
      .setEmoji(music.loop === "track" ? "🔂" : "🔁")
      .setStyle(music.loop === "off" ? ButtonStyle.Secondary : ButtonStyle.Success)
  );
}

export function queueEmbed(music: GuildMusicPlayer, page: number) {
  const pages = Math.max(1, Math.ceil(music.queue.length / QUEUE_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * QUEUE_PAGE_SIZE;
  const lines = music.queue
    .slice(start, start + QUEUE_PAGE_SIZE)
    .map((t, i) => `\`${start + i + 1}.\` ${trackLink(t, 60)} · ${formatDuration(t.duration, t.isLive)}`);

  const known = music.queue.filter((t) => t.duration != null);
  const total = known.reduce((sum, t) => sum + t.duration!, 0);
  const totalText =
    music.queue.length === 0
      ? "Queue is empty"
      : `${music.queue.length} track${music.queue.length === 1 ? "" : "s"} · ${formatDuration(total)}${
          known.length < music.queue.length ? "+" : ""
        } total`;

  const nowText = music.current
    ? `${music.paused ? "⏸️" : "🎶"} ${trackLink(music.current, 80)} · ${formatDuration(
        Math.floor(music.position / 1000)
      )} / ${formatDuration(music.current.duration, music.current.isLive)}`
    : "Nothing is playing.";

  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle("Music queue")
    .setDescription(`**Now playing**\n${nowText}\n\n**Up next**\n${lines.join("\n") || "Nothing queued"}`)
    .setFooter({
      text: `${totalText} · Loop: ${LOOP_LABEL[music.loop]} · Page ${current}/${pages}`,
    });
}
