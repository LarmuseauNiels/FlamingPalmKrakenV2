import "dotenv/config";
import Bugsnag from "@bugsnag/js";
import BugsnagPluginExpress from "@bugsnag/plugin-express";
import { FpgClient } from "./components/FpgClient";

if (process.env.DISABLE) {
  process.exit(1);
}

Bugsnag.start({
  apiKey: process.env.BUGSNAG_API_KEY,
  plugins: [BugsnagPluginExpress],
  appVersion: (process.env.CAPROVER_GIT_COMMIT_SHA ?? "unknown").slice(0, 7),
  releaseStage: process.env.NODE_ENV || "development",
});

global.bugsnag = Bugsnag;
global.client = new FpgClient();
global.client.login(process.env.TOKEN);

// Prisma 4 calls process.exit("SIGTERM") when nothing else handles the signal,
// which Node 20+ rejects with a TypeError, so shut down cleanly ourselves.
// `on`, not `once`: Prisma only skips its exit while another listener remains.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => {
    try {
      await global.client.destroy();
      await global.client.prisma.$disconnect();
    } catch (err) {
      Bugsnag.notify(err);
    } finally {
      process.exit(0);
    }
  });
}

declare global {
  var client: FpgClient;
}
