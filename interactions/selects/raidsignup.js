const { RaidModule } = require("../../islander/RaidModule");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
module.exports = {
  name: "raidsignup",
  async execute(interaction) {
    let attending = await global.client.prisma.raidAttendees.count({
      where: {
        RaidId: parseInt(interaction.values[0]),
        MemberId: interaction.user.id,
      },
    });

    if (attending > 0) {
      let row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("raidunsub_" + interaction.values[0])
          .setLabel("Unsubscribe")
          .setStyle(ButtonStyle.Secondary)
      );

      interaction.reply({
        content:
          "You are already signed up for this raid! U can press the button below to remove yourself from the raid.",
        components: [row],
        ephemeral: true,
      });
      return;
    }

    await RaidModule.AddUserToRaid(
      interaction.user.id,
      parseInt(interaction.values[0])
    );
    interaction.reply({
      content:
        "Successfully signed up for the raid! Use /raids again to see changes!",
      ephemeral: true,
    });
  },
};
