import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import fs from 'fs';
import path from 'path';

const commands = [];
const guildCommands = [];

const commandFiles = fs
  .readdirSync(path.join(__dirname, 'interactions', 'commands'))
  .filter((file) => file.endsWith('.ts') || file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./interactions/commands/${file}`);
  if ('data' in command && 'toJSON' in command.data) {
    commands.push(command.data.toJSON());
  }
}

const contextMenus = fs
  .readdirSync(path.join(__dirname, 'interactions', 'contextmenus'))
  .filter((file) => file.endsWith('.ts') || file.endsWith('.js'));

for (const file of contextMenus) {
  const menu = require(`./interactions/contextmenus/${file}`);
  if ('data' in menu && 'toJSON' in menu.data) {
    guildCommands.push(menu.data.toJSON());
  }
}

const rest = new REST({ version: '9' }).setToken(process.env.TOKEN as string);

rest
  .put(Routes.applicationCommands(process.env.CLIENT_ID as string), { body: commands })
  .then(() =>
    console.log(
      'Successfully registered ' + commands.length + ' application commands.'
    )
  )
  .catch(console.error);

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
    console.log(
      'Successfully registered ' + guildCommands.length + ' guild commands.'
    )
  )
  .catch(console.error);