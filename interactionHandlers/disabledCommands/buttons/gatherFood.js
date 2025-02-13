const {} = require("discord.js");

module.exports = {
  name: "gatherFood",
  async execute(interaction) {
    if (interaction.user.id !== interaction.message.interaction.user.id) {
      await interaction.reply({
        content: "You can't interact with someone else's buttons!",
        ephemeral: true,
      });
      return;
    }
    //test
    if (
      global.client.islander.userCooldowns.has(interaction.user.id) &&
      global.client.islander.userCooldowns.get(interaction.user.id) > Date.now()
    ) {
      await interaction.reply({
        content:
          "You gatherers are still tired for " +
          global.client.islander.getGatherCooldownTime(interaction.user.id),
        ephemeral: true,
      });
    } else {
      let now = new Date();
      now.setHours(now.getHours() + 4);
      global.client.islander.userCooldowns.set(interaction.user.id, now);
      let gatherAmount = 5 + Math.floor(Math.random() * 12);
      global.client.islander
        .AddFood(interaction.user.id, gatherAmount)
        .then(async (food) => {
          await interaction.reply({
            content: `You gather ${gatherAmount} food`,
            ephemeral: false,
          }); //TODO make more intresting with different gathering amounts
        });
    }
  },
};
