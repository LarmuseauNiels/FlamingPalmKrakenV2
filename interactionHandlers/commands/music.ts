import {
  ChatInputCommandInteraction,
  GuildMember,
  InteractionContextType,
  SlashCommandBuilder,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { GuildMusicPlayer, LoopMode } from "../../modules/Music/MusicPlayer";
import { nowPlayingPayload, queueEmbed, trackLink } from "../../modules/Music/MusicEmbeds";

export default class MusicCommand implements IHandler {
  name = "music";
  isGuild = true;
  data = new SlashCommandBuilder()
    .setName("music")
    .setDescription("Control the music player")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName("skip").setDescription("Skip the current song"))
    .addSubcommand((s) => s.setName("pause").setDescription("Pause playback"))
    .addSubcommand((s) => s.setName("resume").setDescription("Resume playback"))
    .addSubcommand((s) => s.setName("stop").setDescription("Stop, clear the queue and leave the voice channel"))
    .addSubcommand((s) =>
      s
        .setName("queue")
        .setDescription("Show the queue")
        .addIntegerOption((o) => o.setName("page").setDescription("Page number").setMinValue(1))
    )
    .addSubcommand((s) => s.setName("nowplaying").setDescription("Show the current song and controls"))
    .addSubcommand((s) =>
      s
        .setName("volume")
        .setDescription("Set the volume")
        .addIntegerOption((o) =>
          o
            .setName("percent")
            .setDescription("1–150 (100 = original loudness)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(150)
        )
    )
    .addSubcommand((s) => s.setName("shuffle").setDescription("Shuffle the queue"))
    .addSubcommand((s) =>
      s
        .setName("loop")
        .setDescription("Repeat the current song or the whole queue")
        .addStringOption((o) =>
          o
            .setName("mode")
            .setDescription("What to repeat")
            .setRequired(true)
            .addChoices(
              { name: "Off", value: "off" },
              { name: "Current song", value: "track" },
              { name: "Whole queue", value: "queue" }
            )
        )
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove a song from the queue")
        .addIntegerOption((o) =>
          o.setName("position").setDescription("Position in /music queue").setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand((s) => s.setName("clear").setDescription("Remove every upcoming song (keeps the current one)")) as SlashCommandBuilder;

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const music = GuildMusicPlayer.get(interaction.guildId);
    if (!music) {
      await interaction.reply({ content: "Nothing is playing. Use `/play` to start.", ephemeral: true });
      return;
    }

    // Looking is fine from anywhere; changing playback needs you in the channel.
    if (sub === "queue") {
      const page = interaction.options.getInteger("page") ?? 1;
      await interaction.reply({ embeds: [queueEmbed(music, page)], ephemeral: true });
      return;
    }
    if (sub === "nowplaying") {
      await interaction.reply({ ...nowPlayingPayload(music), ephemeral: true });
      return;
    }

    if (!music.isListening(interaction.member as GuildMember)) {
      await interaction.reply({
        content: `Join <#${music.channelId}> to control the music.`,
        ephemeral: true,
      });
      return;
    }

    const who = `<@${interaction.user.id}>`;
    switch (sub) {
      case "skip": {
        if (!music.current) return this.reply(interaction, "Nothing is playing.", true);
        const skipped = music.current;
        music.skip();
        return this.reply(interaction, `⏭️ ${who} skipped ${trackLink(skipped)}.`);
      }
      case "pause":
        if (!music.pause()) return this.reply(interaction, "Already paused (or nothing is playing).", true);
        return this.reply(interaction, `⏸️ ${who} paused the music.`);
      case "resume":
        if (!music.resume()) return this.reply(interaction, "The music isn't paused.", true);
        return this.reply(interaction, `▶️ ${who} resumed the music.`);
      case "stop":
        music.destroy(`${interaction.user.displayName} stopped the music.`);
        return this.reply(interaction, `⏹️ ${who} stopped the music.`);
      case "volume": {
        const percent = interaction.options.getInteger("percent", true);
        music.setVolume(percent);
        return this.reply(interaction, `🔊 ${who} set the volume to **${percent}%**.`);
      }
      case "shuffle":
        if (music.queue.length < 2) return this.reply(interaction, "Not enough songs in the queue to shuffle.", true);
        music.shuffle();
        return this.reply(interaction, `🔀 ${who} shuffled ${music.queue.length} songs.`);
      case "loop": {
        const mode = interaction.options.getString("mode", true) as LoopMode;
        music.setLoop(mode);
        const text = { off: "turned looping off", track: "is looping the current song", queue: "is looping the queue" }[mode];
        return this.reply(interaction, `🔁 ${who} ${text}.`);
      }
      case "remove": {
        const position = interaction.options.getInteger("position", true);
        const removed = music.remove(position);
        if (!removed) return this.reply(interaction, `There's no song at position ${position}.`, true);
        return this.reply(interaction, `🗑️ ${who} removed ${trackLink(removed)} from the queue.`);
      }
      case "clear": {
        const count = music.clearQueue();
        return this.reply(interaction, `🧹 ${who} cleared ${count} song${count === 1 ? "" : "s"} from the queue.`);
      }
    }
  }

  private async reply(interaction: ChatInputCommandInteraction, content: string, ephemeral = false) {
    await interaction.reply({
      content,
      ephemeral,
      allowedMentions: { parse: [] },
      flags: ephemeral ? undefined : ["SuppressEmbeds"],
    } as any);
  }
}
