// Require the necessary discord.js classes
import { PrismaClient } from "@prisma/client";
import { Islander } from "./islander/islander";
import { AchievementsModule } from "./islander/AchievementsModule";
import { WebApi } from "./modules/WebApi";
import Bugsnag from "@bugsnag/js";
import BugsnagPluginExpress from "@bugsnag/plugin-express";
import { RaidModule } from "./islander/RaidModule";
import {Assistant} from "./modules/Assistant";
import {GuildScheduledEvent, Snowflake} from "discord.js";

const fs = require("fs");
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
} = require("discord.js");

class FpgClient extends Client {
  declare islander: Islander;
  declare achievementsModule: AchievementsModule;
  declare raidModule: RaidModule;
  declare assistant: Assistant;
  declare prisma: PrismaClient;
  declare commands: typeof Collection;
  declare buttons: typeof Collection;
  declare selects: typeof Collection;
  declare modals: typeof Collection;
  declare contextMenus: typeof Collection;
  declare chats: Map<any, any>;
  declare webapi: WebApi;
  declare events: typeof Collection;
  

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildScheduledEvents,
      ],
      partials: [Partials.Message, Partials.Channel, Partials.Reaction],
    });

    this.prisma = new PrismaClient();
    this.logChannel;
    this.updateChannel;
    this.islander = new Islander();
    this.events = new Collection();
    this.cachUpdated;
    this.commands = new Collection();
    this.buttons = new Collection();
    this.selects = new Collection();
    this.modals = new Collection();
    this.contextMenus = new Collection();
    this.achievementsModule = new AchievementsModule();
    this.chats = new Map();
    this.webapi = new WebApi();
    this.assistant = new Assistant();

  }

  log(loggText) {
    console.log(loggText);
    global.client.logChannel.send("```" + loggText + "```");
  }

  idToName(id) {
    return global.client.users.cache.get(id).username;
  }
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

async function loadInteractionActions(folderName): Promise<typeof Collection> {
  let tempList: typeof Collection = new Collection();
  console.log(__dirname);
  let actionFiles = fs
    .readdirSync("./interactions/" + folderName)
    .filter((file) => file.endsWith(".js"));
  for (const file of actionFiles) {
    let action = await import(`./interactions/${folderName}/${file}`);
    tempList.set(action.name, action);
    console.log(`Loaded ${action.name} from ${folderName}`);
  }
  return tempList;
}
