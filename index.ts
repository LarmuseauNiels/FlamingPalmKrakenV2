// Require the necessary discord.js classes

const fs = require("fs");
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
} = require("discord.js");
const { token, DBHOST, DBPASS } = require("./config.js");

const { PrismaClient } = require("@prisma/client");
const mysql = require("mysql");

let islanderClass = require("./islander/islander.js");

class FpgClient extends Client {
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
    this.DBconnection = mysql.createPool({
      connectionLimit: 10,
      host: DBHOST,
      user: "root",
      password: DBPASS,
      database: "discordstats",
    });

    this.prisma = new PrismaClient();
    this.logChannel;
    this.islander = new islanderClass();
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

global.client = new FpgClient();

global.client.commands = loadInteractionActions("commands");
global.client.buttons = loadInteractionActions("buttons");
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

function loadInteractionActions(folderName) {
  let tempList = new Collection();
  let actionFiles = fs
    .readdirSync("./interactions/" + folderName)
    .filter((file) => file.endsWith(".js"));
  for (const file of actionFiles) {
    let action = require(`./interactions/${folderName}/${file}`);
    tempList.set(action.name, action);
  }
  return tempList;
}
