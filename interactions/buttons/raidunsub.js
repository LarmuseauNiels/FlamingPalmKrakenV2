module.exports = {
  name: "raidunsub",
  async execute(interaction) {
    let raidId = interaction.customId.split("_")[1];
    await global.client.prisma.raidAttendees.delete({
      where: {
        RaidId_MemberId: {
          RaidId: parseInt(raidId),
          MemberId: interaction.user.id,
        },
      },
    });
  },
};
