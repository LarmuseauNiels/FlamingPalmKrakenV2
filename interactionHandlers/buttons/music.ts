import { ButtonInteraction, GuildMember } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { GuildMusicPlayer } from "../../modules/Music/MusicPlayer";

/** Buttons on the now-playing message: music_pause / skip / stop / shuffle / loop. */
export default class MusicButton implements IHandler {
  name = "music";

  async execute(interaction: ButtonInteraction) {
    const action = interaction.customId.split("_")[1];
    const music = interaction.guildId ? GuildMusicPlayer.get(interaction.guildId) : undefined;
    if (!music) {
      await interaction.reply({ content: "The music player isn't running anymore.", ephemeral: true });
      return;
    }
    if (!music.isListening(interaction.member as GuildMember)) {
      await interaction.reply({ content: `Join <#${music.channelId}> to control the music.`, ephemeral: true });
      return;
    }

    // The player edits the now-playing message itself; just acknowledge.
    await interaction.deferUpdate();
    switch (action) {
      case "pause":
        music.togglePause();
        break;
      case "skip":
        music.skip();
        break;
      case "stop":
        music.destroy(`${interaction.user.displayName} stopped the music.`);
        break;
      case "shuffle":
        music.shuffle();
        break;
      case "loop":
        music.cycleLoop();
        break;
    }
  }
}
