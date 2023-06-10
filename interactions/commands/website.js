const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
module.exports = {
  name: "website",
  data: new SlashCommandBuilder()
    .setName("website")
    .setDescription("get a direct link to log into the website?"),
  async execute(interaction) {
    let embed = new EmbedBuilder()
      .setColor("#FD8612")
      .setTitle("website link")
      .setAuthor({
        name: interaction.user.username,
        iconURL:
          "https://cdn.discordapp.com/avatars/" +
          interaction.user.id +
          "/" +
          interaction.user.avatar,
        url: "https://flamingpalm.com",
      })
      .setDescription("Flamingpalm website login");
    let row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setURL(
          "https://discord.com/oauth2/authorize?state=xIMl4hl4dpSusL6n3hahJ6P3IjV8i2O6&scope=identify+guilds&response_type=code&approval_prompt=auto&client_id=534686392589221898&redirect_uri=https%3A%2F%2Fflamingpalm.com%2Flogin"
        )
        .setLabel("login into website")
        .setStyle(ButtonStyle.Link)
    );
    interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },
};
