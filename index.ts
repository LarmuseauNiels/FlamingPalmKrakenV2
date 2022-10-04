// Require the necessary discord.js classes
import { PrismaClient } from "@prisma/client";
import { Islander } from "./islander/islander";
const fs = require("fs");
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
} = require("discord.js");
const { token, DBHOST, DBPASS } = require("./config.js");

class FpgClient extends Client {
  declare islander: Islander;
  declare prisma: PrismaClient;
  declare commands: typeof Collection;
  declare buttons: typeof Collection;
  declare modals: typeof Collection;

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
    this.islander = new Islander();
    this.events = null;
    this.cachUpdated;
  }

  log(loggText) {
    console.log(loggText);
    //test
  }

  channelLog() {
    //this.logChannel.send(loggText.toString());
  }
}

declare global {
  var client: FpgClient;
}
global.client = new FpgClient();
global.client.commands = loadInteractionActions("commands");
global.client.buttons = loadInteractionActions("buttons");
global.client.modals = loadInteractionActions("modals");
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
global.client.login(token);

function loadInteractionActions(folderName): typeof Collection {
  let tempList: typeof Collection = new Collection();
  let actionFiles = fs
    .readdirSync("./interactions/" + folderName)
    .filter((file) => file.endsWith(".js"));
  for (const file of actionFiles) {
    let action = require(`./interactions/${folderName}/${file}`);
    tempList.set(action.name, action);
  }
  return tempList;
}
