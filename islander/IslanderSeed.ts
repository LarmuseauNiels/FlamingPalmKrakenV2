// Seeds the Islander definition tables (i_Building, i_BuildingLevel, i_Unit)
// from islander/data/balance.ts. Idempotent — safe to run repeatedly (used by
// IslanderModule.ensureDefinitions and a future /island-reload admin command).

import { BUILDING_LINES, UNITS, levelStats } from "./data/balance";
import { createLogger } from "../utils/logger";

const log = createLogger("IslanderSeed");

export abstract class IslanderSeed {
  /** Upsert every building line + its levels and every unit definition. */
  static async upsertAll(): Promise<void> {
    const prisma = global.client.prisma;

    for (const line of BUILDING_LINES) {
      // One i_Building row per line, keyed by the stable line key in Name.
      let building = await prisma.i_Building.findFirst({
        where: { Name: line.key },
      });
      if (!building) {
        building = await prisma.i_Building.create({ data: { Name: line.key } });
      }

      for (let level = 1; level <= line.maxLevel; level++) {
        const s = levelStats(line, level);
        await prisma.i_BuildingLevel.upsert({
          where: { BuildingID_Level: { BuildingID: building.ID, Level: level } },
          create: {
            BuildingID: building.ID,
            Level: level,
            Name: s.name,
            Wood: s.wood,
            Stone: s.stone,
            Food: s.food,
            Currency: s.currency,
            Time: s.time,
            TClevel: s.tcReq,
            imagename: line.image,
            imagePosX: line.posX,
            imagePosY: line.posY,
            Function: line.func,
            FunctAttribute: s.attr,
          },
          update: {
            Name: s.name,
            Wood: s.wood,
            Stone: s.stone,
            Food: s.food,
            Currency: s.currency,
            Time: s.time,
            TClevel: s.tcReq,
            imagename: line.image,
            imagePosX: line.posX,
            imagePosY: line.posY,
            Function: line.func,
            FunctAttribute: s.attr,
          },
        });
      }
    }

    for (const u of UNITS) {
      const existing = await prisma.i_Unit.findFirst({ where: { Name: u.name } });
      const data = {
        Name: u.name,
        Type: u.type,
        Wood: u.wood,
        Food: u.food,
        Currency: u.currency,
        Pop: u.pop,
        Attack: u.attack,
        HP: u.hp,
        Loot: u.loot,
        TrainTime: u.trainTime,
      };
      if (existing) {
        await prisma.i_Unit.update({ where: { ID: existing.ID }, data });
      } else {
        await prisma.i_Unit.create({ data });
      }
    }

    log.info(
      `Seeded ${BUILDING_LINES.length} building lines and ${UNITS.length} units`
    );
  }
}
