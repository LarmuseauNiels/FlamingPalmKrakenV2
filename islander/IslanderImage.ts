// Renders an island to a PNG via @napi-rs/canvas. This is a procedural
// placeholder: it draws water, the island, and each built building as a labelled
// marker at its catalogue position (imagePosX/Y).
//
// Phase 6 (docs/ISLANDER_DESIGN.md §7.4) replaces this with composited art from
// Kenney.nl CC0 kits (Hexagon Kit terrain/building tiles + Pirate/Nature decor),
// loaded via Canvas.loadImage keyed by i_BuildingLevel.imagename, with this
// marker rendering kept as the fallback when a sprite is missing.

import * as Canvas from "@napi-rs/canvas";
import { AttachmentBuilder } from "discord.js";
import { lineByKey, tierNameFor } from "./data/balance";
import { IslandWithDetail, IslanderModule } from "./IslanderModule";
import { createLogger } from "../utils/logger";

const log = createLogger("IslanderImage");

const WIDTH = 600;
const HEIGHT = 400;

export abstract class IslanderImage {
  static async render(
    island: IslandWithDetail,
    ownerName: string
  ): Promise<AttachmentBuilder> {
    const buffer = await this.renderBuffer(island, ownerName);
    return new AttachmentBuilder(buffer, { name: "island.png" });
  }

  static async renderBuffer(
    island: IslandWithDetail,
    ownerName: string
  ): Promise<Buffer> {
    const canvas = Canvas.createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");

    try {
      // Sea
      const sea = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      sea.addColorStop(0, "#2b6cb0");
      sea.addColorStop(1, "#1a4971");
      ctx.fillStyle = sea;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Island landmass
      ctx.fillStyle = "#caa472";
      ctx.beginPath();
      ctx.ellipse(WIDTH / 2, HEIGHT / 2 + 30, 250, 150, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5fa05f";
      ctx.beginPath();
      ctx.ellipse(WIDTH / 2, HEIGHT / 2 + 20, 220, 120, 0, 0, Math.PI * 2);
      ctx.fill();

      // Buildings
      for (const b of island.Buildings ?? []) {
        const line = lineByKey(b.i_Building?.Name);
        if (!line) continue;
        const x = line.posX;
        const y = line.posY;
        ctx.fillStyle = "rgba(40,30,20,0.75)";
        ctx.fillRect(x - 26, y - 16, 52, 24);
        ctx.fillStyle = "#ffffff";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(tierNameFor(line, b.level), x, y - 4);
        ctx.font = "9px sans-serif";
        ctx.fillStyle = "#ffd27f";
        ctx.fillText(`Lv ${b.level}`, x, y + 5);
      }

      // Header banner with resources
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, WIDTH, 34);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${ownerName}'s Island`, 12, 23);

      const cap = IslanderModule.storageCap(island);
      ctx.font = "13px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(
        `Wood ${island.Wood}/${cap}  Stone ${island.Stone}/${cap}  Food ${island.Food}/${cap}  Coin ${island.Currency}`,
        WIDTH - 10,
        22
      );
    } catch (error) {
      log.error("Failed to render island image:", error);
    }

    return canvas.toBuffer("image/png");
  }
}
