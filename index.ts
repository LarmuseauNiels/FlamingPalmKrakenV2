import Bugsnag from "@bugsnag/js";
import BugsnagPluginExpress from "@bugsnag/plugin-express";
import { FpgClient } from "./domain/FpgClient";

if (process.env.DISABLE) {
  process.exit(1);
}

Bugsnag.start({
  apiKey: process.env.BUGSNAG_API_KEY,
  plugins: [BugsnagPluginExpress],
  appVersion: process.env.CAPROVER_GIT_COMMIT_SHA.slice(0, 7),
});

global.bugsnag = Bugsnag;
global.client = new FpgClient();

declare global {
  var client: FpgClient;
}
