import {
  Client,
  ClientUser,
  GatewayIntentBits,
  Options,
  Partials,
  TextChannel,
} from "discord.js";
import { OllamaAI } from "./OllamaAI";
import { PrismaClient } from "@prisma/client";
import { AchievementsModule } from "../modules/AchievementsModule";
import { WebApi } from "../modules/WebApi";
import { Collection } from "discord.js";
import fs from "fs";
import path from "path";
import { IHandler } from "../interfaces/IHandler";
import { IEvent } from "../interfaces/IEvent";
import { createLogger } from "../utils/logger";

const logger = createLogger("FpgClient");
type interactionSet = Collection<string, IHandler>;

export class FpgClient extends Client {
  declare prisma: PrismaClient;

  declare achievementsModule: AchievementsModule;
  declare ollamaAI: OllamaAI;
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
      // Cap the most volatile caches so a long-running process doesn't leak.
      // discord.js only sweeps threads by default; everything else grows forever.
      makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        MessageManager: 50,
      }),
      sweepers: {
        ...Options.DefaultSweeperSettings,
        // Drop cached messages older than 30 min, hourly.
        messages: { interval: 3600, lifetime: 1800 },
        // Evict non-client bot users hourly (real members stay for lookups).
        users: {
          interval: 3600,
          filter: () => (user) => user.bot && user.id !== user.client.user?.id,
        },
      },
    });

    this.prisma = new PrismaClient();
    // AI assistant from Ollama
    this.ollamaAI = new OllamaAI();

    this.achievementsModule = new AchievementsModule();
    this.webapi = new WebApi();
    this.loadEvents();
    this.loadCommands();
  }

  log(loggText: unknown) {
    logger.info(loggText);
    // logChannel is assigned in clientReady; guard against the startup window
    // where it's still undefined. Also guard against log text that contains
    // backticks or exceeds Discord's 2000-char message limit.
    if (!this.logChannel) return;
    const fenced = "```" + String(loggText).replace(/```/g, "\u0060\u0060\u0060").slice(0, 1990) + "```";
    this.logChannel.send(fenced).catch((err) =>
      logger.error("Failed to send to log channel:", err)
    );
  }

  /**
   * The bot's own user. Null only before login completes; every event and
   * job runs after that, so a null here is a startup-order bug worth a throw.
   */
  requireUser(): ClientUser {
    if (!this.user) throw new Error("Discord client used before login completed");
    return this.user;
  }

  idToName(id: string) {
    return this.users.cache.get(id)?.username ?? null;
  }

  /**
   * Loads every handler synchronously in the constructor, so the collections
   * are complete before login and no interaction can see a half-filled map.
   */
  private loadCommands(): void {
    this.commands = this.loadInteractionActions("commands");
    this.buttons = this.loadInteractionActions("buttons");
    this.selects = this.loadInteractionActions("selects");
    this.modals = this.loadInteractionActions("modals");
    this.contextMenus = this.loadInteractionActions("contextmenus");
  }

  private loadInteractionActions(type: string): interactionSet {
    const actions = new Collection<string, IHandler>();
    const directory = path.join(__dirname, `../interactionHandlers/${type}`);
    if (!fs.existsSync(directory)) return actions;

    const actionFiles = fs.readdirSync(directory).filter((file) => file.endsWith(".js"));
    for (const file of actionFiles) {
      let handler: IHandler;
      try {
        const handlerSource = require(path.join(directory, file));
        handler = new handlerSource.default();
      } catch (error) {
        // One broken handler shouldn't take the whole bot down.
        logger.error(`Failed to load ${type} ${file}:`, error);
        continue;
      }
      // These are programmer errors, not runtime conditions: a handler with no
      // name can never be routed to, and a duplicate name silently replaced
      // the earlier handler. Fail the boot so they are fixed, not shipped.
      if (!handler.name) {
        throw new Error(`${type}/${file} exports a handler without a name`);
      }
      if (actions.has(handler.name)) {
        throw new Error(`Duplicate ${type} handler name "${handler.name}" in ${file}`);
      }
      actions.set(handler.name, handler);
      logger.info(`Loaded ${type} ${handler.name}`);
    }
    return actions;
  }

  private loadEvents(): void {
    const eventFiles = fs
      .readdirSync(path.join(__dirname, "../events"))
      .filter((file) => file.endsWith(".js"));

    for (const file of eventFiles) {
      logger.info(`Loading event ${file}`);
      try {
        const eventSource = require(path.join(__dirname, `../events/${file}`));

        // Check if the default export exists and is a class/function
        if (eventSource.default && typeof eventSource.default === "function") {
          const event: IEvent = new eventSource.default();

          // execute() is async; a rejection here would otherwise be unhandled.
          const listener = (...args: unknown[]) => {
            Promise.resolve()
              .then(() => event.execute(...args))
              .catch((error) => logger.error(`Event ${event.name} (${file}) failed:`, error));
          };
          if (event.once) {
            this.once(event.name, listener);
          } else {
            this.on(event.name, listener);
          }
        } else {
          logger.error(
            `[Module Error] Event file '${file}' does not have a valid default export. Skipping.`
          );
          logger.debug(`[Module Error] Received:`, eventSource);
        }
      } catch (e) {
        logger.error(`[Load Error] Failed to load event ${file}:`, e);
      }
    }
  }
}
