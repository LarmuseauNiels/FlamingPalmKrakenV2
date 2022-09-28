const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");

module.exports = {
  name: "gather",
  data: new SlashCommandBuilder()
    .setName("gather")
    .setDescription("Gather resources on your island")
    .addStringOption((option) =>
      option
        .setName("resource")
        .setDescription("The resource you want to gather")
        .setRequired(true)
        .addChoices(
          { name: "Food", value: "food" },
          { name: "Wood", value: "wood" },
          { name: "Stone", value: "stone" }
        )
    ),
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
      if (interaction.options.getString("resource") == "wood") {
        client.islander.AddWood(interaction.user.id, 10).then((wood) => {
          interaction.reply({ content: "You gather 10 wood", ephemeral: true });
        });
      } else if (interaction.options.getString("resource") == "food") {
        client.islander.AddFood(interaction.user.id, 10).then((food) => {
          interaction.reply({ content: "You gather 10 food", ephemeral: true });
        });
      } else if (interaction.options.getString("resource") == "stone") {
        client.islander.AddStone(interaction.user.id, 10).then((stone) => {
          interaction.reply({
            content: "You gather 10 stone",
            ephemeral: true,
          });
        });
      }
    }
  },
  isGuild: true,
};
