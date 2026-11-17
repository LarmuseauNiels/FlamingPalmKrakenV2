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

  const tick = createExclusiveRunner(name, job);
  cron.schedule(expression, () => void tick(), options.timezone ? { timezone: options.timezone } : undefined);
}

/**
 * Wraps `job` so calls while a run is in progress are skipped, and so the
 * returned promise always resolves — `true` if this call ran the job, `false`
 * if it was skipped. Separate from the cron wiring so it can be tested.
 */
export function createExclusiveRunner(name: string, job: () => Promise<void>): () => Promise<boolean> {
  let running = false;
  let skipped = 0;

  return async () => {
    if (running) {
      skipped++;
      log.warn(`${name}: previous run still in progress, skipping tick (${skipped} skipped so far)`);
      return false;
    }
    running = true;
    const startedAt = Date.now();
    try {
      await job();
    } catch (error) {
      log.error(`${name} failed:`, error);
    } finally {
      running = false;
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs > SLOW_RUN_WARN_MS) log.warn(`${name}: run took ${elapsedMs} ms`);
    }
    return true;
  };
}
