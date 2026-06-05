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
  /**
   * @param targetId whose island to render
   * @param targetName display name for the owner
   * @param isOwner   whether the viewer owns this island (enables build/upgrade)
   */
  static async build(
    targetId: string,
    targetName: string,
    isOwner = true
  ): Promise<IslandMessage> {
    const view = await IslanderModule.getIslandView(targetId);
    const image = await IslanderImage.render(view.island, targetName);
    const embed = IslanderEmbeds.status(view.island, targetName, {
      cap: view.cap,
      popCap: view.popCap,
      production: view.production,
      tcLevel: view.tcLevel,
      currentBuild: view.currentBuild,
      army: view.army,
    });

    const building = !!view.currentBuild;
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`islander_refresh_${targetId}`)
        .setLabel("Refresh")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`islander_build_${targetId}`)
        .setLabel("Build")
        .setStyle(ButtonStyle.Success)
        // Can't start a new build while one is in progress, or on others' islands.
        .setDisabled(!isOwner || building),
      new ButtonBuilder()
        .setCustomId(`islander_upgrade_${targetId}`)
        .setLabel("Upgrade")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!isOwner || building),
      new ButtonBuilder()
        .setCustomId(`islander_rush_${targetId}`)
        .setLabel("Rush ⚡")
        .setStyle(ButtonStyle.Secondary)
        // Only meaningful while a build is running on your own island.
        .setDisabled(!isOwner || !building)
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>();
    if (isOwner) {
      // Own island: train units and repair damaged walls.
      const wallsDamaged =
        IslanderModule.wallHPCurrent(view.island) <
        IslanderModule.wallHPMax(view.island);
      row2.addComponents(
        new ButtonBuilder()
          .setCustomId(`islander_train_${targetId}`)
          .setLabel("Train 🪖")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`islander_repair_${targetId}`)
          .setLabel("Repair 🧱")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!wallsDamaged)
      );
    } else {
      // Someone else's island: scout or raid it.
      row2.addComponents(
        new ButtonBuilder()
          .setCustomId(`islander_scout_${targetId}`)
          .setLabel("Scout 🔭")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`islander_raid_${targetId}`)
          .setLabel("Raid ⚔️")
          .setStyle(ButtonStyle.Danger)
      );
    }

    return { embeds: [embed], files: [image], components: [row1, row2] };
  }
}
