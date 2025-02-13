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
import { IHandler } from "../interfaces/IHandler";
type interactionSet = Collection<string, IHandler>;

export class FpgClient extends Client {
  declare islander: Islander;
  declare achievementsModule: AchievementsModule;
  declare raidModule: RaidModule;
  declare assistant: Assistant;
  declare prisma: PrismaClient;
  declare commands: interactionSet;
  declare buttons: interactionSet;
  declare selects: interactionSet;
  declare modals: interactionSet;
  declare contextMenus: interactionSet;
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
    this.contextMenus = new Collection();
    this.achievementsModule = new AchievementsModule();
    this.chats = new Map();
    this.webapi = new WebApi();

    this.loadCommands();
    this.loadEvents();
  }

  log(loggText) {
    console.log(loggText);
    this.logChannel.send("```" + loggText + "```");
  }

  idToName(id) {
    return this.users.cache.get(id).username;
  }

  private async loadCommands(): Promise<void> {
    this.commands = await this.loadInteractionActions("commands");
    this.buttons = await this.loadInteractionActions("buttons");
    this.selects = await this.loadInteractionActions("selects");
    this.contextMenus = await this.loadInteractionActions("contextmenus");
  }

  private async loadInteractionActions(type: string): Promise<interactionSet> {
    const actions = new Collection<string, IHandler>();
    const actionFiles: Array<string> = fs
      .readdirSync(path.join(__dirname, `../interactionHandlers/${type}`))
      .filter((file) => file.endsWith(".js"));
    for (const file of actionFiles) {
      try {
        const fileLocation = path.join(
          __dirname,
          `../interactionHandlers/${type}/${file}`
        );
        const handlerSource = require(fileLocation);
        const handler: IHandler = new handlerSource.default();
        actions.set(handler.name, handler);
        console.log(`Loaded ${type} ${handler.name}`);
      } catch (error) {
        console.error(`Failed to load ${type} ${file}: ${error}`);
      }
    }
    return actions;
  }

  private loadEvents(): void {
    const eventFiles = fs
      .readdirSync(path.join(__dirname, "../events"))
      .filter((file) => file.endsWith(".js"));

    for (const file of eventFiles) {
      const event = require(path.join(__dirname, `../events/${file}`));
      if (event.once) {
        this.once(event.name, (...args) => event.execute(...args));
      } else {
        this.on(event.name, (...args) => event.execute(...args));
      }
    }
  }
}
