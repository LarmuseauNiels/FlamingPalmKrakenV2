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
import { PVP } from "./data/balance";

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
   * @param viewerId  the id of the member viewing (the would-be attacker when not
   *                  the owner) — used to reflect raid cooldown on the Raid button
   */
  static async build(
    targetId: string,
    targetName: string,
    isOwner = true,
    viewerId?: string
  ): Promise<IslandMessage> {
    const view = await IslanderModule.getIslandView(targetId);
    const image = await IslanderImage.render(view.island, targetName);
    const embed = IslanderEmbeds.status(view.island, targetName, {
      cap: view.cap,
      popCap: view.popCap,
      production: view.production,
      tcLevel: view.tcLevel,
      currentBuild: view.currentBuild,
      nextUnlock: view.nextUnlock,
      army: view.army,
      isOwner,
    });

    // When viewing another island, work out whether a raid is currently
    // possible so the Raid button reflects it (shield / new-player / cooldown).
    let raidBlocked = false;
    if (!isOwner) {
      const now = Date.now();
      const shield = view.island.ShieldUntil
        ? new Date(view.island.ShieldUntil)
        : null;
      const targetProtected =
        (shield && shield.getTime() > now) ||
        view.tcLevel < PVP.NEW_PLAYER_SHIELD_TC;
      const cooldown = viewerId
        ? await IslanderModule.activeRaidCooldown(viewerId)
        : null;
      raidBlocked = !!targetProtected || !!cooldown;
    }

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
      // Optional Points → Currency exchange (Phase 5, off unless enabled).
      if (IslanderModule.pointsExchangeEnabled) {
        row2.addComponents(
          new ButtonBuilder()
            .setCustomId(`islander_exchange_${targetId}`)
            .setLabel("Exchange 🔁")
            .setStyle(ButtonStyle.Secondary)
        );
      }
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
          // Disabled when the target is shielded/new, or the viewer is on
          // cooldown — the Status field explains why. Scout stays available.
          .setDisabled(raidBlocked)
      );
    }

    // Always-available info actions.
    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`islander_leaderboard_${targetId}`)
        .setLabel("Leaderboard 🏆")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`islander_help_${targetId}`)
        .setLabel("How to play ❓")
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], files: [image], components: [row1, row2, row3] };
  }
}
