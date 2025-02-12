import { MessageCreateOptions } from "discord.js";
import { RaidModule } from "../modules/RaidModule";

export abstract class ChannelUpdates {
  static async MessageWithProfile(message: string, userId: string) {
    let attachment = await global.client.achievementsModule.GetProfile(userId);
    global.client.updateChannel.send({
      content: message,
      files: [attachment],
    });
  }

  static async MessageWithRaid(message: string) {
    let embed = await RaidModule.getRaidMessage();
    global.client.updateChannel.send({
      content: message,
      embeds: embed.embeds,
      components: embed.components,
    } as MessageCreateOptions);
  }
}
