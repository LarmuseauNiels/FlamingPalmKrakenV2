const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

module.exports = {
  name: "island",
  data: new SlashCommandBuilder()
    .setName("island")
    .setDescription("Check the progress of your island"),
  async execute(interaction) {
    interaction.deferReply({ ephemeral: true });
    global.client.islander.GetMemberIsland(interaction.user.id).then(
      (member) => {
        let island = member.i_Island;
        var text = "";
        if (island == null) {
          let island = global.client.islander.SpawnIsland(member.ID);
          text =
            "Welcome to Islander, you have started alone on your own empty island";
        }
        let row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("gather")
            .setLabel("Gather")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("build")
            .setLabel("Buildings")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("islanderBuyUnits")
            .setLabel("Units")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId("islanderExpedition")
            .setLabel("Expeditions")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        );

        global.client.islander
          .GetImage(interaction.user.id, island)
          .then((image) => {
            interaction.reply({
              content: text,
              files: [image],
              components: [row],
              ephemeral: true,
            });
          });
      },
      (err) => {
        console.log("error island 01" + err);
        interaction.reply({
          content: "You do not have an island yet.",
          ephemeral: true,
        });
      }
    );
  },
  isGuild: true,
};
