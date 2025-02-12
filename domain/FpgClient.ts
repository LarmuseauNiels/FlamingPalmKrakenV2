import { Client, GatewayIntentBits, Partials, TextChannel } from "discord.js";
import { RaidModule } from "../modules/RaidModule";
import { Assistant } from "../modules/Assistant";
import { PrismaClient } from "@prisma/client";
import { Islander } from "../islander/islander";
import { AchievementsModule } from "../modules/AchievementsModule";
import { WebApi } from "../modules/WebApi";
import { Collection } from "discord.js";
import fs from "fs";
import path from "path";

export class FpgClient extends Client {
  declare islander: Islander;
  declare achievementsModule: AchievementsModule;
  declare raidModule: RaidModule;
  declare assistant: Assistant;
  declare prisma: PrismaClient;
  declare commands: Collection<any, any>;
  declare buttons: Collection<any, any>;
  declare selects: Collection<any, any>;
  declare modals: Collection<any, any>;
  declare contextMenus: Collection<any, any>;
  declare chats: Map<any, any>;
  declare webapi: WebApi;
  declare events: Collection<any, any>;
  declare logChannel: TextChannel;
  declare updateChannel: TextChannel;
  declare cachUpdated: any;
  declare invites: Collection<string, any>;
  declare lfg: TextChannel;

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
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

    this.assistant = new Assistant();
    this.prisma = new PrismaClient();
    this.islander = new Islander();

    this.logChannel;
    this.updateChannel;
    this.events = new Collection();
    this.commands = new Collection();
    this.buttons = new Collection();
    this.selects = new Collection();
    this.modals = new Collection();
    this.contextMenus = new Collection();
    this.achievementsModule = new AchievementsModule();
    this.chats = new Map();
    this.webapi = new WebApi();

    this.loadCommands();
    this.loadEvents();
  }

  log(loggText) {
    console.log(loggText);
    global.client.logChannel.send("```" + loggText + "```");
  }

  idToName(id) {
    return global.client.users.cache.get(id).username;
  }

  private async loadCommands(): Promise<void> {
    const interactionTypes = [
      "commands",
      "buttons",
      "modals",
      "contextmenus",
      "selects",
    ];
    for (const type of interactionTypes) {
      global.client[type] = await this.loadInteractionActions(type);
    }
  }

  private async loadInteractionActions(
    type: string
  ): Promise<Collection<string, any>> {
    const actions = new Collection<string, any>();
    const actionFiles = fs
      .readdirSync(path.join(__dirname, `interactions/${type}`))
      .filter((file) => file.endsWith(".js") || file.endsWith(".ts"));

    for (const file of actionFiles) {
      const action = require(path.join(
        __dirname,
        `interactions/${type}/${file}`
      ));
      actions.set(action.data.name, action);
    }

    return actions;
  }

  private loadEvents(): void {
    const eventFiles = fs
      .readdirSync(path.join(__dirname, "events"))
      .filter((file) => file.endsWith(".js"));

    for (const file of eventFiles) {
      const event = require(path.join(__dirname, `events/${file}`));
      if (event.once) {
        global.client.once(event.name, (...args) => event.execute(...args));
      } else {
        global.client.on(event.name, (...args) => event.execute(...args));
      }
    }
  }
}
