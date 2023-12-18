module.exports = {
  name: "raidsignup",
  async execute(interaction) {
    let UserId = interaction.user.id;
    let SelectedRaid = interaction.values[0];


    await global.client.prisma.raidAttendees.create({
      data: {
        MemberId: UserId,
        RaidId: SelectedRaid
      }
    });

    interaction.reply({
      content: "Signed up to raid"
    });
  },
};
