const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
module.exports = {
  name: "give-achievement",
  data: new SlashCommandBuilder()
    .setName("give-achievement")
    .setDescription("give achievements to users")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to give the achievement to")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("achievement")
        .setDescription("Achievement to give")
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription(
          "Optional extra description for this instance of the achievement"
        )
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    //give achievement
    const user = interaction.options.getUser("user");
    const achievement = +interaction.options.getString("achievement");
    const description = interaction.options.getString("description");
    console.log(achievement, interaction.options.getString("achievement"));
    await global.client.achievements.GiveAchievement(
      user.id,
      achievement,
      interaction.user.id
    );
    await interaction.reply("Achievement given");
  },
  async autocomplete(interaction) {
    global.client.achievements
      .GetManualAchievements()
      .then(async (achievements) => {
        const focusedValue = interaction.options.getFocused();
        const options = achievements
          .filter((achievement) =>
            achievement.Name.toLowerCase().includes(focusedValue.toLowerCase())
          )
          .map((achievement) => {
            return {
              name: achievement.Name,
              value: achievement.ID.toString(),
            };
          });
        await interaction.respond(options);
      });
  },
  isGuild: true,
};
