const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const getOffset = (timeZone = "UTC", date = new Date()) => {
  const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzDate = new Date(date.toLocaleString("en-US", { timeZone }));
  return (tzDate.getTime() - utcDate.getTime()) / 6e4;
};

module.exports = {
  name: "give-event",
  data: new SlashCommandBuilder()
    .setName("give-event")
    .setDescription("give event to users")
    .addStringOption((option) =>
      option
        .setName("time")
        .setDescription("The hour the event was at 24h format brussels time")
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
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    let hour = +interaction.options.getString("time");

    hour = hour - getOffset("Europe/Brussels") / 60;

    let results = await globalThis.client.prisma
      .$queryRaw`select distinct M.ID, M.DisplayName from VoiceConnected join Members M on M.ID = VoiceConnected.ID where HOUR(TimeStamp) = ${hour} and DATE(TimeStamp) = DATE(NOW()) `;

    console.log(results);
    await interaction.reply({
      ephemeral: true,
      content: `test`,
    });
    //give achievement
    /*const user = interaction.options.getUser("user");
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
                                                                */
  },
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
  },
  isGuild: true,
};
