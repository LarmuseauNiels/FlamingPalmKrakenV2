const {} = require("discord.js");

module.exports = {
  name: "gatherWood",
  async execute(interaction) {
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
      global.client.islander.AddWood(interaction.user.id, 10).then((wood) => {
        interaction.reply({ content: "You gather 10 wood", ephemeral: true });
      });
    }
  },
};
