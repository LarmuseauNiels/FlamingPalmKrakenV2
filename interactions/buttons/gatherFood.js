const {} = require("discord.js");

module.exports = {
  name: "gatherFood",
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
          "You are still gathering for " +
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
        .then((food) => {
          interaction.reply({
            content: `You gather ${gatherAmount} food`,
            ephemeral: false,
          }); //TODO make more intresting with different gathering amounts
        });

      global.client.islander
        .GetMemberIsland(interaction.user.id)
        .then((member) => {
          let island = member.i_Island;
          global.client.islander
            .GetImage(interaction.user.id, island)
            .then((image) => {
              interaction.update({
                files: [image],
              });
            });
        });
    }
  },
};
