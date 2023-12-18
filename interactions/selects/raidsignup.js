module.exports = {
  name: "raidsignup",
  async execute(interaction) {
    let UserId = interaction.user.id;
    let SelectedRaid = interaction.value;

    interaction.reply({
      content: "id: " + UserId + " raid: " + SelectedRaid
    })
  },
};
