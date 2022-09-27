const {} = require("discord.js");

module.exports = {
    name: 'gatherStone',
    async execute(interaction) {
        if (client.islander.userCooldowns.has(interaction.user.id) && client.islander.userCooldowns.get(interaction.user.id) > Date.now()){
            let timespan =Math.floor((client.islander.userCooldowns.get(interaction.user.id) - Date.now()) /60000)
            let hours = Math.floor(timespan / 60)
            let min = timespan % 60
            let text = hours == 0? min + ' minutes': hours + ' hours and ' + min + ' minutes';            
            interaction.reply({ content: 'You are still gathering for ' + text , ephemeral: true });
        }
        else{
            let now = new Date();
            now.setHours(now.getHours() + 4);
            client.islander.userCooldowns.set(interaction.user.id,  now);
            client.islander.AddStone(interaction.user.id,10).then(stone => {
                interaction.reply({ content: 'You gather 10 stone', ephemeral: true });
            });
        }
    }
};

