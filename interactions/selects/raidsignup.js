const { RaidModule } = require("../../islander/RaidModule");
module.exports = {
  name: "raidsignup",
  async execute(interaction) {
    await RaidModule.AddUserToRaid(
      interaction.user.id,
      parseInt(interaction.values[0])
    );
    interaction.reply({
      content: "Successfully signed up for the raid!",
      ephemeral: true,
    });
  },
};
