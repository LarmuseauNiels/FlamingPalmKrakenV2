const { SlashCommandBuilder } = require("@discordjs/builders");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require("discord.js");

module.exports = {
  name: "island",
  data: new SlashCommandBuilder()
    .setName("island")
    .setDescription("Check progress on your island"),
  async execute(interaction) {
    client.islander.GetMemberIsland(interaction.user.id).then(
      (member) => {
        let island = member.i_Island;
        const embed = new EmbedBuilder()
          .setColor("#FD8612")
          .setTitle("Island")
          .setAuthor(
            member.DisplayName,
            "https://cdn.discordapp.com/avatars/" +
              member.ID +
              "/" +
              interaction.user.avatar,
            "https://flamingpalm.com"
          )
          //.setDescription('Some description here')
          //.setThumbnail('https://i.imgur.com/AfFp7pu.png')

          .setImage("https://www.kenney.nl/assets/hexagon-kit/sample.png")
          .setTimestamp()
          .setFooter(
            "Work in progress Islander game",
            "https://flamingpalm.com/images/FlamingPalmLogoSmall.png"
          );
        island.i_Building_Island.forEach((ibi) => {
          let bl = ibi.i_BuildingLevel;
          embed.addField(bl.Name, "lvl " + bl.Level, true);
        });

        const hiddenEmbed = new EmbedBuilder()
          .setColor("#c8dcff")
          .setTitle("Private island info")
          //.setURL('https://discord.js.org/')
          //.setAuthor('Islander', 'https://flamingpalm.com/images/FlamingPalmLogoSmall.png', 'https://flamingpalm.com/Islander')
          .setDescription(
            island.Wood +
              "🪵 " +
              island.Stone +
              "🧱 " +
              island.Food +
              "🍞 " +
              island.Currency +
              "🪙"
          )
          .setImage("https://flamingpalm.com/images/banner.png")
          .setTimestamp()
          .setFooter(
            "Work in progress Islander game",
            "https://flamingpalm.com/images/FlamingPalmLogoSmall.png"
          )
          .addFields(
            { name: "Units", value: "no units " },
            { name: "Expeditions", value: "no active expeditions" }
          );

        let row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("islanderBuild")
            .setLabel("Build")
            .setStyle("SECONDARY"),
          new ButtonBuilder()
            .setCustomId("islanderUpgrade")
            .setLabel("Upgrade")
            .setStyle("SECONDARY"),
          new ButtonBuilder()
            .setCustomId("islanderBuyUnits")
            .setLabel("Buy units")
            .setStyle("SECONDARY"),
          new ButtonBuilder()
            .setCustomId("islanderBuyShips")
            .setLabel("Buy ships")
            .setStyle("SECONDARY"),
          new ButtonBuilder()
            .setCustomId("islanderExpedition")
            .setLabel("Start expedition")
            .setStyle("SECONDARY")
        );

        interaction.reply({ embeds: [embed], ephemeral: true });
        interaction.followUp({
          embeds: [hiddenEmbed],
          components: [row],
          ephemeral: true,
        });
      },
      (error) => {
        console.log(error);
        interaction.reply({ content: "Island not available", ephemeral: true });
      }
    );
  },
  isGuild: true,
};
