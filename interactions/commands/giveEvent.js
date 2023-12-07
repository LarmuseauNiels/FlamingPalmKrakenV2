const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");

const getOffset = (timeZone = "UTC", date = new Date()) => {
  const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzDate = new Date(date.toLocaleString("en-US", { timeZone }));
  return (tzDate.getTime() - utcDate.getTime()) / 6e4;
};

class BuildersSelectMenuOption {}

module.exports = {
  name: "give-event",
  data: new SlashCommandBuilder()
    .setName("give-event")
    .setDescription("give event to users")
    .addIntegerOption((option) =>
      option
        .setName("time")
        .setDescription("The hour the event was at 24h format brussels time")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
        option
            .setName("daysago")
            .setDescription(
                "number of days ago"
            )
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
    const achievement = +interaction.options.getString("achievement");
    const description = interaction.options.getString("description");
    let hour = +interaction.options.getString("time");
    let daysago = +interaction.options.getString("daysago");
    hour = hour - getOffset("Europe/Brussels") / 60;
    let results = new Array();
    results = await globalThis.client.prisma
      .$queryRaw`select distinct M.ID, M.DisplayName from VoiceConnected join Members M on M.ID = VoiceConnected.ID where HOUR(TimeStamp) = ${hour} and DATE(TimeStamp) = select DATE(DATE_ADD(NOW(),INTERVAL -${daysago} DAY)) `;
    console.log(results);
    if (results.length === 0) {
      await interaction.reply({
        ephemeral: true,
        content: `Sorry no users found online at that time`,
      });
    } else {
      let row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`giveAchievement-${achievement}`)
          .setPlaceholder("Select users")
          .addOptions(
            results.map((u) => {
              return {
                label: u.DisplayName,
                description: `Give ${u.DisplayName} the achievement`,
                value: u.ID,
              };
            })
          )
      );

      const message = await interaction.reply({
        ephemeral: false,
        content: `Selecting the people will instantly grant them the event`,
        components: [row],
      });

      // create a collector for the select menu event
      const filter = (interaction) =>
        interaction.customId === `giveAchievement-${achievement}`;
      const collector = message.createMessageComponentCollector({
        filter,
        time: 300000,
      });

      // listen for selected option
      collector.on("collect", async (interaction) => {
        //check if same user
        if (interaction.user.id !== interaction.message.interaction.user.id) {
          await interaction.reply({
            ephemeral: true,
            content: `You can't give achievements`,
          });
          return;
        }

        const selectedOption = interaction.values[0]; // get the first selected option

        await global.client.achievementsModule.GiveAchievement(
          selectedOption,
          achievement,
          interaction.user.id,
          description
        );
        await interaction.reply({
          ephemeral: false,
          content: `gave achievement to ${
            results.find((u) => u.ID === selectedOption).DisplayName
          }`,
        });
      });
    }
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
