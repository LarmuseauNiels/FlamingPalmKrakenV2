import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";

export default class GiveAchievementCommand implements IHandler {
  name = "give-achievement";
  data = new SlashCommandBuilder()
    .setName("give-achievement")
    .setDescription("give achievement to users")
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
          "Optional description for this instance of the achievement"
        )
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const achievement = +interaction.options.getString("achievement");
    const description = interaction.options.getString("description");
    console.log(achievement, interaction.options.getString("achievement"));
    await global.client.achievementsModule.GiveAchievement(
      user.id,
      achievement,
      interaction.user.id,
      description
    );
    await interaction.reply({
      ephemeral: true,
      content: `gave ${achievement} to ${user.username}`,
    });
  }
  async autocomplete(interaction) {
    global.client.achievementsModule
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
  }
  isGuild: true;
}
