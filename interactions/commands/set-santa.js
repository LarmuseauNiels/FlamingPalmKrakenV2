const { SlashCommandBuilder } = require('@discordjs/builders');
const { writeFile } = require('fs');



module.exports = {
	data: new SlashCommandBuilder()
		.setName('set-santa')
		.setDescription('Tell recievers who they are giving a gift to.'),
	async execute(interaction) {
        const reciever = await client.prisma.sSReciever.findMany({})
		const senders = await client.prisma.sSSender.findMany({})


        console.log(attachUser(reciever, senders))
		await interaction.reply({content:"logged to console", ephemeral:true})
	},   

    isGuild : true
};

async function attachUser (recievers, senders) {
	val = []
	added=[]
	output=[]

    for (var key in recievers){
		val.push(recievers[key].ID)
	}

	shuffle(val)

	for(var reciever in recievers){
		for(var sender in val){
			if (recievers[reciever].ID == val[sender]){
				console.log("Skipped")
				continue
			}
	
			for(var obj in senders){
				if(senders[obj].ID==val[sender]){
					if((senders[obj].HasINTER == 1 && recievers[reciever].RequiresINTER == 1)  || (senders[obj].HasEU == 1 && recievers[reciever].RequiresEU == 1)){
						
						if(added.includes(recievers[reciever].ID))
						{
							continue
						}
						added.push(recievers[reciever].ID)
						output.push(recievers[reciever].ID + ", " + senders[obj].ID)
						val.splice(sender, 1);
					}
				}
			}	 
		}
	}	
	
	console.log(output)

	//124214124, 12423523465
	//412412123, 31231312321
	let results = await client.prisma.sSLink.createMany({
		data: output.map(line => {return {SenderID: line[0], ReceiverID: line[1]}})
	})
}


async function shuffle(array){
	let currentIndex = array.length, randomIndex 

	while (currentIndex != 0){
		randomIndex = Math.floor(Math.random()*currentIndex)
		currentIndex--
    	[array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]]
	}
  	return array
}

