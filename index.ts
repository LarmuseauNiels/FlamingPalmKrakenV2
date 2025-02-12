// Require the necessary discord.js classes

import Bugsnag from "@bugsnag/js";
import BugsnagPluginExpress from "@bugsnag/plugin-express";
import { Collection } from "discord.js";
import { FpgClient } from "./domain/FpgClient";
const fs = require("fs");

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
loadCommands();

async function loadCommands(): Promise<void> {
  global.client.commands = await loadInteractionActions("commands");
  global.client.buttons = await loadInteractionActions("buttons");
  global.client.modals = await loadInteractionActions("modals");
  global.client.contextMenus = await loadInteractionActions("contextmenus");
  global.client.selects = await loadInteractionActions("selects");
}

declare global {
  var client: FpgClient;
}

//client.selectMenus =  loadInteractionActions('selectMenus');

const eventFiles = fs
  .readdirSync("./events")
  .filter((file) => file.endsWith(".js"));

for (const file of eventFiles) {
  const event = require(`./events/${file}`);
  if (event.once) {
    global.client.once(event.name, (...args) => event.execute(...args));
  } else {
    global.client.on(event.name, (...args) => event.execute(...args));
  }
}

// Login to Discord with your client's token
global.client.login(process.env.TOKEN);

async function loadInteractionActions(folderName): Promise<Collection<unknown, unknown>> {
  let tempList: Collection<unknown, unknown> = new Collection();
  console.log(__dirname);
  let actionFiles = fs
    .readdirSync("./interactions/" + folderName)
    .filter((file) => file.endsWith(".js"));
  for (const file of actionFiles) {
    let action = await require(`./interactions/${folderName}/${file}`);
    tempList.set(action.name, action);
    console.log(`Loaded ${action.name} from ${folderName}`);
  }
  return tempList;
}
