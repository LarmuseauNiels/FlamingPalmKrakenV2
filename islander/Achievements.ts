export class Achievements {
  async GiveAchievement(
    memberID: string,
    achievementID: number,
    grantedBy: string
  ) {
    await global.client.prisma.achievement_History.create({
      data: {
        UserID: memberID,
        AchievementID: achievementID,
        GrantedBy: grantedBy,
      },
    });
  }

  // get all achievements where type is manual
  async GetManualAchievements() {
    return await global.client.prisma.achievements.findMany({
      where: {
        Type: "Manual",
      },
    });
  }
}
