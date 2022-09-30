const {} = require("discord.js");

module.exports = {
  name: "gatherStone",
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
      let gatherAmount = 5 + Math.floor(Math.random() * 5);
      global.client.islander
        .AddStone(interaction.user.id, gatherAmount)
        .then((stone) => {
          global.client.islander
            .GetMemberIsland(interaction.user.id)
            .then((member) => {
              let island = member.i_Island;
              global.client.islander
                .GetImage(interaction.user.id, island)
                .then(async (image) => {
                  await interaction.update({
                    files: [image],
                  });
                });
            });

          interaction.reply({
            content: `You gather ${gatherAmount} stone`,
            ephemeral: false,
          });
        });
    }
  },
};
