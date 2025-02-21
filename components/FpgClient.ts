import { Client, GatewayIntentBits, Partials, TextChannel } from "discord.js";
import { Assistant } from "./Assistant";
import { PrismaClient } from "@prisma/client";
import { AchievementsModule } from "../modules/AchievementsModule";
import { WebApi } from "../modules/WebApi";
import { Collection } from "discord.js";
import fs from "fs";
import path from "path";
import { IHandler } from "../interfaces/IHandler";
import { IEvent } from "../interfaces/IEvent";
type interactionSet = Collection<string, IHandler>;

export class FpgClient extends Client {
  declare prisma: PrismaClient;

  declare achievementsModule: AchievementsModule;
  declare assistant: Assistant;
  declare webapi: WebApi;
  // cache of guild events for quick access for website (periodically updated in statistics loop)
  declare events: Collection<any, any>;
  // set of last guild invites for change tracking when new user joins
  declare invites: Collection<string, any>;
  // channels for logging and updates
  declare logChannel: TextChannel;
  declare updateChannel: TextChannel;
  declare lfg: TextChannel;
  // collections of interaction handlers
  declare commands: interactionSet;
  declare buttons: interactionSet;
  declare selects: interactionSet;
  declare modals: interactionSet;
  declare contextMenus: interactionSet;

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
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
    // AI assistant from OpenAI
    this.assistant = new Assistant();
    
    this.logChannel;
    this.updateChannel;
    this.contextMenus = new Collection();
    this.achievementsModule = new AchievementsModule();
    this.webapi = new WebApi();
    this.loadEvents();
    this.loadCommands();
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
      console.log(`Loading event ${file}`);
      const eventSource = require(path.join(__dirname, `../events/${file}`));
      const event: IEvent = new eventSource.default();

      if (event.once) {
        this.once(event.name, (...args) => event.execute(...args));
      } else {
        this.on(event.name, (...args) => event.execute(...args));
      }
    }
  }
}
