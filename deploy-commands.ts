import { REST, Routes } from "discord.js";
import fs from "fs";
import path from "path";
import { IHandler } from "./interfaces/IHandler";
import { createLogger } from "./utils/logger";

const log = createLogger("DeployCommands");

const commands = [];
const guildCommands = [];

const commandFiles = fs
  .readdirSync(path.join(__dirname, "interactionHandlers", "commands"))
  .filter((file) => file.endsWith(".ts") || file.endsWith(".js"));

for (const file of commandFiles) {
  const commandSource = require(`./interactionHandlers/commands/${file}`);
  const command: IHandler = new commandSource.default();

  if (command.data != null) {
    commands.push(command.data.toJSON());
  }
}

// Discord Activity entry point command (type 4 = PRIMARY_ENTRY_POINT,
// handler 2 = DISCORD_LAUNCH_ACTIVITY). Discord opens the Activity itself, so
// no interaction reaches the bot and there is no handler file for this one.
//
// Gated behind ACTIVITY_ENABLED because registering an entry point command for
// an app that doesn't have Activities switched on in the developer portal
// fails the whole PUT — which would take every other command down with it.
// Note the inverse too: once Activities are on, Discord auto-creates a default
// entry point command, and a PUT that omits this entry would delete it.
if (process.env.ACTIVITY_ENABLED === "true") {
  commands.push({
    name: "shop",
    description: "Open the FlamingPalm points store",
    type: 4,
    handler: 2,
  });
  log.info("Including the Activity entry point command (ACTIVITY_ENABLED=true).");
}

const contextMenus = fs
  .readdirSync(path.join(__dirname, "interactionHandlers", "contextmenus"))
  .filter((file) => file.endsWith(".ts") || file.endsWith(".js"));

for (const file of contextMenus) {
  // const menu = require(`./interactions/contextmenus/${file}`);
  // if ("data" in menu && "toJSON" in menu.data) {
  //   guildCommands.push(menu.data.toJSON());
  // }
  const menuSource = require(`./interactionHandlers/contextmenus/${file}`);
  const menu: IHandler = new menuSource.default();

  if (menu.data != null) {
    guildCommands.push(menu.data.toJSON());
  }
}

const rest = new REST({ version: "9" }).setToken(process.env.TOKEN as string);

rest
  .put(Routes.applicationCommands(process.env.CLIENT_ID as string), {
    body: commands,
  })
  .then(() =>
    log.info("Successfully registered " + commands.length + " application commands.")
  )
  .catch((e) => log.error("Failed to register application commands:", e));

rest
  .put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID as string,
      process.env.GUILD_ID as string
    ),
    {
      body: guildCommands,
    }
  )
  .then(() =>
    log.info("Successfully registered " + guildCommands.length + " guild commands.")
  )
  .catch((e) => log.error("Failed to register guild commands:", e));
