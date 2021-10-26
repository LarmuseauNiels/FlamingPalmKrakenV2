module.exports = {
	name: 'ready',
	once: true,
	execute(client) {
		client.logChannel = client.channels.cache.get("894190067747262464");
		client.log(`Ready! Logged in as ${client.user.tag}`);
		client.channels.fetch("561128481384300554").then()
		.then(channel => channel.messages.fetch({limit: 100})) 
		.catch( err => client.log(err)
		);
		require("../modules/statistics.js")(client);
		require("../modules/webapi.js")(client);
		client.guilds.cache.get("530537522355240961")?.commands.fetch().then(commands => commands.forEach(command =>{
			let permissions = client.commands.get(command.name).permissions;
			if (permissions != null){
				command.permissions.set( { permissions });
			}
		}));
	},
};