const fs = require("fs");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
const { clientId, token } = require("./config.js");

const guildCommands = [];
const commands = [];

const commandFiles = fs
  .readdirSync("./interactions/commands")
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(`./interactions/commands/${file}`);
  if (command.isGuild) guildCommands.push(command.data.toJSON());
  else commands.push(command.data.toJSON());
}

const contextMenus = fs
  .readdirSync("./interactions/contextmenus")
  .filter((file) => file.endsWith(".js"));

for (const file of contextMenus) {
  const menu = require(`./interactions/contextmenus/${file}`);
  guildCommands.push(menu.data.toJSON());
}

const rest = new REST({ version: "9" }).setToken(token);

rest
  .put(Routes.applicationCommands(clientId), { body: commands })
  .then(() =>
    console.log(
      "Successfully registered " + commands.length + " application commands."
    )
  )
  .catch(console.error);

rest
  .put(Routes.applicationGuildCommands(clientId, "530537522355240961"), {
    body: guildCommands,
  })
  .then(() =>
    console.log(
      "Successfully registered " + guildCommands.length + " guild commands."
    )
  )
  .catch(console.error);
