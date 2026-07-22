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

declare global {
  var client: FpgClient;
}
