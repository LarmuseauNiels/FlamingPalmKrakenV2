// Require the necessary discord.js classes
const fs = require('fs');
const { Client,Collection, Intents } = require('discord.js');
const { token,DBHOST,DBPASS } = require('./config.js');

const { PrismaClient } = require( '@prisma/client');
const mysql = require('mysql');
const Islander = require('./islander/islander.js')



class ClientDecorator extends Client{
    constructor(){
        super({
            intents: [
                GatewayIntentBits.GUILDS, GatewayIntentBits.GUILD_MEMBERS, GatewayIntentBits.GUILD_BANS,
                GatewayIntentBits.GUILD_EMOJIS_AND_STICKERS, GatewayIntentBits.GUILD_INTEGRATIONS, GatewayIntentBits.GUILD_WEBHOOKS,
                GatewayIntentBits.GUILD_INVITES, GatewayIntentBits.GUILD_VOICE_STATES, GatewayIntentBits.GUILD_PRESENCES,
                GatewayIntentBits.GUILD_MESSAGES, GatewayIntentBits.GUILD_MESSAGE_REACTIONS, GatewayIntentBits.GUILD_MESSAGE_TYPING,
                GatewayIntentBits.DIRECT_MESSAGES, GatewayIntentBits.DIRECT_MESSAGE_REACTIONS, GatewayIntentBits.DIRECT_MESSAGE_TYPING,
            ],
            partials: [Partials.MESSAGE, Partials.CHANNEL, Partials.REACTION]
         });
         this.DBconnection = mysql.createPool({
            connectionLimit : 10,
            host            : DBHOST,
            user            : 'root',
            password        : DBPASS,
            database        : 'discordstats'
          });
        
        this.prisma = new PrismaClient()
        this.logChannel;
        this.islander = new Islander(this);
    }
    log(loggText){
        console.log(loggText);
        //test
    }
    channelLog(){
        this.logChannel.send(loggText.toString());
    }
}
global.client = new ClientDecorator();

client.commands =  loadInteractionActions( 'commands');
client.buttons =  loadInteractionActions('buttons');
//client.selectMenus =  loadInteractionActions('selectMenus');

const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
	const event = require(`./events/${file}`);
	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args));
	} else {
		client.on(event.name, (...args) => event.execute(...args));
	}
}

// Login to Discord with your client's token
client.login(token);

function loadInteractionActions( folderName ){
    let tempList = new Collection();
    let actionFiles = fs.readdirSync('./interactions/'+ folderName).filter(file => file.endsWith('.js'));
    for (const file of actionFiles) {
        let action = require(`./interactions/${folderName}/${file}`);
        tempList.set(action.name, action);
    }
    return tempList;
}