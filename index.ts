import "dotenv/config";
import Bugsnag from "@bugsnag/js";
import BugsnagPluginExpress from "@bugsnag/plugin-express";
import { FpgClient } from "./components/FpgClient";
import { assertRequiredEnv } from "./utils/config";
import { createLogger } from "./utils/logger";

const log = createLogger("Main");

/** A shutdown that hangs (stuck socket, slow DB) is cut off after this long. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

if (process.env.DISABLE) {
  process.exit(1);
}

// Fail at boot, with every missing name, rather than mid-request later.
assertRequiredEnv();

Bugsnag.start({
  // Optional: unset keeps the previous behaviour (Bugsnag logs that it has no key).
  apiKey: process.env.BUGSNAG_API_KEY as string,
  plugins: [BugsnagPluginExpress],
  appVersion: (process.env.CAPROVER_GIT_COMMIT_SHA ?? "unknown").slice(0, 7),
  releaseStage: process.env.NODE_ENV || "development",
});

global.bugsnag = Bugsnag;
global.client = new FpgClient();
global.client.login(process.env.TOKEN).catch((err) => {
  // Without a gateway connection the bot is useless; exit so CapRover restarts it.
  log.error("Discord login failed:", err);
  process.exit(1);
});

// Prisma 4 calls process.exit("SIGTERM") when nothing else handles the signal,
// which Node 20+ rejects with a TypeError, so shut down cleanly ourselves.
// `on`, not `once`: Prisma only skips its exit while another listener remains.
let shuttingDown = false;
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => {
    // A second signal (CapRover sends SIGTERM, an impatient Ctrl+C) must not
    // start a second, overlapping teardown.
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Received ${signal}, shutting down`);
    setTimeout(() => {
      log.error(`Shutdown took longer than ${SHUTDOWN_TIMEOUT_MS} ms, forcing exit`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
    try {
      await global.client.destroy();
      await global.client.prisma.$disconnect();
    } catch (err) {
      Bugsnag.notify(err as Error);
    } finally {
      process.exit(0);
    }
  });
}

declare global {
  var client: FpgClient;
  var bugsnag: typeof Bugsnag;
}
