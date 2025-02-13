const { RaidModule } = require("../../modules/RaidModule");
const {} = require("discord.js");

module.exports = {
  name: "raidVotes",
  async execute(interaction) {
    interaction.deferReply({ ephemeral: true });
    let message = await interaction.channel.messages.fetch(
      interaction.message.id
    );
    let content = message.content;
    let embed = await RaidModule.showVotes(Number(content));
    await interaction.editReply({
      embeds: [embed],
      ephemeral: true,
    });
  },
};
