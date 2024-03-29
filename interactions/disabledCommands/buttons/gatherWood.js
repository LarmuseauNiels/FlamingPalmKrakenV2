const {} = require("discord.js");

module.exports = {
  name: "gatherWood",
  async execute(interaction) {
    if (interaction.user.id !== interaction.message.interaction.user.id) {
      interaction.reply({
        content: "You can't interact with someone else's buttons!",
        ephemeral: true,
      });
      return;
    }

    if (
      global.client.islander.userCooldowns.has(interaction.user.id) &&
      global.client.islander.userCooldowns.get(interaction.user.id) > Date.now()
    ) {
      interaction.reply({
        content:
          "You gatherers are still tired for " +
          global.client.islander.getGatherCooldownTime(interaction.user.id),
        ephemeral: true,
      });
    } else {
      let now = new Date();
      now.setHours(now.getHours() + 4);
      global.client.islander.userCooldowns.set(interaction.user.id, now);
      let gatherAmount = 5 + Math.floor(Math.random() * 8);
      global.client.islander
        .AddWood(interaction.user.id, gatherAmount)
        .then((wood) => {
          interaction.reply({
            content: `You gather ${gatherAmount} wood`,
            ephemeral: false,
          });
        });
    }
  },
};
