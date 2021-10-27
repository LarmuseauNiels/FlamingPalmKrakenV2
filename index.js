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
                Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.GUILD_BANS,
                Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS, Intents.FLAGS.GUILD_INTEGRATIONS, Intents.FLAGS.GUILD_WEBHOOKS,
                Intents.FLAGS.GUILD_INVITES, Intents.FLAGS.GUILD_VOICE_STATES, Intents.FLAGS.GUILD_PRESENCES,
                Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_REACTIONS, Intents.FLAGS.GUILD_MESSAGE_TYPING,
                Intents.FLAGS.DIRECT_MESSAGES, Intents.FLAGS.DIRECT_MESSAGE_REACTIONS, Intents.FLAGS.DIRECT_MESSAGE_TYPING,
            ],
            partials: ['MESSAGE', 'CHANNEL', 'REACTION']
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