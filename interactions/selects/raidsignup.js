module.exports = {
  name: "raidsignup",
  async execute(interaction) {
    await global.client.raidModule.AddUserToRaid(interaction.user.id, parseInt(interaction.values[0]))
    interaction.reply({
      content: "Signed up to raid",
      ephemeral: true
    });
  },
};
