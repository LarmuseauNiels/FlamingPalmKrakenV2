const {} = require("discord.js");

module.exports = {
  name: "gatherWood",
  async execute(interaction) {
    if (
      client.islander.userCooldowns.has(interaction.user.id) &&
      client.islander.userCooldowns.get(interaction.user.id) > Date.now()
    ) {
      interaction.reply({
        content: "You are still gathering, please wait",
        ephemeral: true,
      });
    } else {
      let now = new Date();
      now.setHours(now.getHours() + 4);
      client.islander.userCooldowns.set(interaction.user.id, now);
      client.islander.AddWood(interaction.user.id, 10).then((wood) => {
        interaction.reply({ content: "You gather 10 wood", ephemeral: true });
      });
    }
  },
};
