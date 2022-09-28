const {} = require("discord.js");

module.exports = {
  name: "gatherStone",
  async execute(interaction) {
    if (
      client.islander.userCooldowns.has(interaction.user.id) &&
      client.islander.userCooldowns.get(interaction.user.id) > Date.now()
    ) {
      interaction.reply({
        content:
          "You are still gathering for " +
          client.islander.getGatherCooldownTime(interaction.user.id),
        ephemeral: true,
      });
    } else {
      let now = new Date();
      now.setHours(now.getHours() + 4);
      client.islander.userCooldowns.set(interaction.user.id, now);
      client.islander.AddStone(interaction.user.id, 10).then((stone) => {
        interaction.reply({ content: "You gather 10 stone", ephemeral: true });
      });
    }
  },
};
