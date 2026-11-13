import {
  ChatInputCommandInteraction,
  GuildMember,
  InteractionContextType,
  SlashCommandBuilder,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { createLogger } from "../../utils/logger";
import { MusicSourceError } from "../../modules/Music/MusicSource";
import { GuildMusicPlayer } from "../../modules/Music/MusicPlayer";
import { playForMember } from "../../modules/Music/MusicService";
import { escapeMarkdown, formatDuration, trackLink } from "../../modules/Music/MusicEmbeds";

const log = createLogger("PlayCommand");

export default class PlayCommand implements IHandler {
  name = "play";
  isGuild = true;
  data = new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song in your voice channel, or add it to the queue")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Song name to search YouTube for, or a YouTube / SoundCloud / Bandcamp link")
        .setRequired(true)
        .setMaxLength(500)
    ) as SlashCommandBuilder;

  async execute(interaction: ChatInputCommandInteraction) {
    const member = interaction.member as GuildMember;
    // Fail fast (and privately) on the cheap checks before deferring publicly.
    if (!member?.voice?.channel) {
      await interaction.reply({ content: "Join a voice channel first, then try again.", ephemeral: true });
      return;
    }
    const existing = GuildMusicPlayer.get(interaction.guildId);
    if (existing?.channelId && existing.channelId !== member.voice.channelId) {
      await interaction.reply({
        content: `I'm already playing music in <#${existing.channelId}>. Join that channel to add songs.`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();
    const query = interaction.options.getString("query", true);

    try {
      const result = await playForMember(member, query, interaction.channel as any);
      const first = result.added[0];
      const length = formatDuration(first.duration, first.isLive);

      let content: string;
      if (result.playlistTitle) {
        const added = result.added.length;
        const capped =
          added < result.found ? ` (the queue is full, so ${result.found - added} were left out)` : "";
        content = `📃 Added **${added}** track${added === 1 ? "" : "s"} from **${escapeMarkdown(result.playlistTitle)}**${capped}.`;
      } else if (result.startedNow) {
        content = `▶️ Playing ${trackLink(first)} · ${length}`;
      } else {
        content = `➕ Queued ${trackLink(first)} · ${length} — position **${result.position}**`;
      }
      // Suppress the link preview; the now-playing message already shows it.
      await interaction.editReply({ content, flags: ["SuppressEmbeds"], allowedMentions: { parse: [] } } as any);
    } catch (err) {
      if (err instanceof MusicSourceError) {
        await interaction.editReply({ content: `❌ ${err.message}` });
        return;
      }
      log.error("Failed to play", err);
      await interaction.editReply({ content: "❌ Something went wrong starting playback." });
    }
  }
}
