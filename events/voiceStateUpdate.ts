import { VoiceState } from "discord.js";
import { IEvent } from "../interfaces/IEvent";
import { GuildMusicPlayer } from "../modules/Music/MusicPlayer";
import { createLogger } from "../utils/logger";

const log = createLogger("VoiceStateUpdate");

export default class voiceStateUpdate implements IEvent {
  name = "voiceStateUpdate";
  async execute(oldState: VoiceState, newState: VoiceState) {
    try {
      // Leaves the channel once nobody is left listening.
      GuildMusicPlayer.onVoiceStateUpdate(oldState, newState);
    } catch (err) {
      log.error("Failed to handle voice state update", err);
    }
  }
}
