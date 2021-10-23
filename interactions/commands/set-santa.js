const { SlashCommandBuilder } = require('@discordjs/builders');



module.exports = {
	name: 'set-santa',
	data: new SlashCommandBuilder()
		.setName('set-santa')
		.setDescription('Tell recievers who they are giving a gift to.'),
	async execute(interaction) {
		await interaction.deferReply();

        const reciever = await client.prisma.sSReciever.findMany({})
		const senders = await client.prisma.sSSender.findMany({})


      	var result = await attachUser(reciever, senders)
		await interaction.editReply({content: "Success", ephemeral:true})
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

	await shuffle(val)

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
						output.push({SenderID: recievers[reciever].ID,RecieverID:senders[obj].ID })
						val.splice(sender, 1);
					}
				}
			}	 
		}
	}	
	
	//console.log(output)

	//124214124, 12423523465
	//412412123, 31231312321
	let results = await client.prisma.sSLink.createMany({
		data: output
	})

	return results
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

