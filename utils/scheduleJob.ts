import cron from "node-cron";
import { createLogger } from "./logger";

const log = createLogger("ScheduleJob");

/** A run longer than this is logged, so slow jobs show up before they pile up. */
const SLOW_RUN_WARN_MS = 30_000;

interface ScheduleOptions {
  timezone?: string;
}

/**
 * Schedules `job` on a cron expression with two guarantees every recurring job
 * here needs:
 *
 * 1. At most one run at a time. A tick that arrives while the previous run is
 *    still going is skipped (and logged), so a slow Discord or panel API can't
 *    stack up overlapping runs that race each other and grow without bound.
 * 2. A failing run is logged and never becomes an unhandled rejection.
 */
export function scheduleJob(
  name: string,
  expression: string,
  job: () => Promise<void>,
  options: ScheduleOptions = {}
): void {
  if (!cron.validate(expression)) {
    throw new Error(`scheduleJob(${name}): invalid cron expression "${expression}"`);
  }

  let running = false;
  let skipped = 0;

  cron.schedule(
    expression,
    () => {
      if (running) {
        skipped++;
        log.warn(`${name}: previous run still in progress, skipping tick (${skipped} skipped so far)`);
        return;
      }
      running = true;
      const startedAt = Date.now();
      job()
        .catch((error) => log.error(`${name} failed:`, error))
        .finally(() => {
          running = false;
          const elapsedMs = Date.now() - startedAt;
          if (elapsedMs > SLOW_RUN_WARN_MS) log.warn(`${name}: run took ${elapsedMs} ms`);
        });
    },
    options.timezone ? { timezone: options.timezone } : undefined
  );
}
