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
