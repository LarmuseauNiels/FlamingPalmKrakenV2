// Builds the full /island message payload (embed + island image + action
// buttons), shared by the slash command and the button handler so the refresh
// button reproduces exactly what the command renders.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { IslanderModule } from "./IslanderModule";
import { IslanderImage } from "./IslanderImage";
import { IslanderEmbeds } from "./IslanderEmbeds";

export interface IslandMessage {
  embeds: any[];
  files: any[];
  components: any[];
}

export abstract class IslanderView {
  static async build(
    targetId: string,
    targetName: string
  ): Promise<IslandMessage> {
    const view = await IslanderModule.getIslandView(targetId);
    const image = await IslanderImage.render(view.island, targetName);
    const embed = IslanderEmbeds.status(view.island, targetName, {
      cap: view.cap,
      popCap: view.popCap,
      production: view.production,
      tcLevel: view.tcLevel,
    });

    // Phase 0: Refresh is live; the rest preview the roadmap (Phase 1-3) and are
    // disabled until their handlers land.
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`islander_refresh_${targetId}`)
        .setLabel("Refresh")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("islander_build_disabled")
        .setLabel("Build")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("islander_upgrade_disabled")
        .setLabel("Upgrade")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("islander_train_disabled")
        .setLabel("Train")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("islander_raid_disabled")
        .setLabel("Raid")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true)
    );

    return { embeds: [embed], files: [image], components: [row] };
  }
}
