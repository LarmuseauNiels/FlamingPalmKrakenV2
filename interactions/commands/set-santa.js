const { SlashCommandBuilder } = require('@discordjs/builders');



module.exports = {
	name: 'set-santa',
	data: new SlashCommandBuilder()
		.setName('set-santa')
		.setDescription('Tell receivers who they are giving a gift to.'),
	async execute(interaction) {
		await interaction.deferReply();

        const receiver = await client.prisma.sSReceiver.findMany({})
		const senders = await client.prisma.sSSender.findMany({})


      	var result = await attachUser(receiver, senders)
		await interaction.editReply({content: "Success", ephemeral:true})
	},   

    isGuild : true
};


async function attachUser (receivers, senders) {
	val = []
	added=[]
	output=[]

    for (var key in receivers){
		val.push(receivers[key].ID)
	}

	await shuffle(val)

	for(var receiver in receivers){
		for(var sender in val){
			if (receivers[receiver].ID == val[sender]){
				console.log("Skipped")
				continue
			}
	
			for(var obj in senders){
				if(senders[obj].ID==val[sender]){
					if((senders[obj].HasINTER == 1 && receivers[receiver].RequiresINTER == 1)  || (senders[obj].HasEU == 1 && receivers[receiver].RequiresEU == 1)){
						
						if(added.includes(receivers[receiver].ID))
						{
							continue
						}
						added.push(receivers[receiver].ID)
						output.push({SenderID: receivers[receiver].ID,ReceiverID:senders[obj].ID })
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

