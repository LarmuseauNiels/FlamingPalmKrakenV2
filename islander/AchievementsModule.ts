import { AttachmentBuilder, Embed, EmbedBuilder, User } from "discord.js";
import Rank from "../islander/profile";
import { ChannelUpdates } from "../islander/ChannelUpdates";

export class AchievementsModule {
  async GiveAchievement(
    memberID: string,
    achievementID: number,
    grantedBy: string,
    description: string
  ) {
    // get achievement
    let achievement = await global.client.prisma.achievements.findFirst({
      where: {
        ID: achievementID,
      },
    });

    global.client.log(
      "Giving achievement: " +
        achievement.Name +
        " to " +
        global.client.idToName(memberID) ?? memberID
    );
    await global.client.prisma.achievement_History.create({
      data: {
        UserID: memberID,
        AchievementID: achievementID,
        GrantedBy: grantedBy,
        Description: description,
      },
    });

    if (achievement.XpIncrease > 0) {
      // get member
      await global.client.prisma.members.update({
        where: {
          ID: memberID,
        },
        data: {
          XP: { increment: achievement.XpIncrease },
        },
      });
    }
    //check if achievement gives points
    if (achievement.points > 0) {
      ChannelUpdates.MessageWithProfile(
        `<@${memberID}>recieved an achievement!: ${achievement.Name} \n${description}`,
        memberID
      );

      await global.client.prisma.points.update({
        where: {
          userid: memberID,
        },
        data: {
          TotalPoints: { increment: achievement.points },
          lastComment:
            achievement.Name + (description != null ? " " + description : ""),
        },
      });
    }

    try {
      //let user = global.client.users.cache.get(memberID)
      global.client.prisma.members
        .findFirst({
          where: {
            ID: memberID,
          },
          select: {
            AchievementNotifications: true,
          },
        })
        .then((result) => {
          if (result?.AchievementNotifications ?? false) {
            // send notification to user
            let embed = new EmbedBuilder()
              .setColor("#00FF00")
              .setTitle(`Achievement received: ${achievement.Name}`)
              .setURL("https://flamingpalm.com/")
              .addFields(
                { name: "Description", value: achievement.Description },
                {
                  name: "Points",
                  value: achievement.points.toString(),
                  inline: true,
                },
                {
                  name: "XP",
                  value: achievement.XpIncrease.toString(),
                  inline: true,
                }
              );
            global.client.users.cache.get(memberID).send({ embeds: [embed] });
          }
        });
    } catch (err) {
      global.client.log(err);
    }
  }

  // get all achievementsModule where type is manual
  async GetManualAchievements() {
    return global.client.prisma.achievements.findMany({
      where: {
        Type: "Manual",
      },
    });
  }

  getLevel(xp: number) {
    return Math.floor(0.2 * Math.sqrt(xp));
  }

  private getCurrentLevelXp(xp: number) {
    return xp - Math.pow(this.getLevel(xp) / 0.2, 2);
  }

  private getRequiredXp(level: number) {
    return Math.pow((level + 1) / 0.2, 2) - Math.pow(level / 0.2, 2);
  }

  async GetLoginStreak(memberID: string) {
    let a = await global.client.prisma.$queryRaw`SELECT MAX(streak) as streak
FROM (
  SELECT AchievementID, UserId, Timestamp,
         DATEDIFF(NOW(), Timestamp),
         @streak := IF( DATEDIFF(NOW(), Timestamp) - @days_diff > 1, @streak,
                       IF(@days_diff := DATEDIFF(NOW(), Timestamp), @streak+1, @streak+1))  AS streak
  FROM Achievement_History
  CROSS JOIN (SELECT @streak := 0, @days_diff := -1) AS vars
  WHERE UserId = ${memberID} AND Timestamp <= NOW() And AchievementID = 13
  ORDER BY Timestamp DESC) AS t`;
    console.log(a);
    return a[0].streak;
  }

  async GetProfile(memberID: string): Promise<AttachmentBuilder> {
    let data = await this.GetProfileBlob(memberID);
    return new AttachmentBuilder(data, {
      name: "profile-image.png",
    });
  }

  async GetProfileBlob(memberID: string): Promise<Buffer> {
    let member = await global.client.prisma.members.findFirst({
      include: {
        Profile: true,
      },
      where: {
        ID: memberID,
      },
    });
    if (!member) {
      throw new Error(`Member not found for ID ${memberID}`);
    }
    console.log(member);
    let guildMember: User = await global.client.users.fetch(memberID, false);
    console.log(guildMember);

    const rank = new Rank()
      .setUsername(guildMember.username)
      .setAvatar(guildMember.avatarURL())
      .setCurrentXP(this.getCurrentLevelXp(member.XP))
      .setRequiredXP(this.getRequiredXp(this.getLevel(member.XP)))
      .setRank(1, "RANK", false)
      .setLevel(this.getLevel(member.XP), "LEVEL", true)
      .setCustomStatusColor(member?.Profile?.StatusColor ?? "#00FF00")
      .setProgressBar(member?.Profile?.ProgressBarColor ?? "#FF0000", "COLOR")
      .setBackground("COLOR", "#2b2f35")
      .setAchievements([]);
    if (member?.Profile?.BackgroundImage != null) {
      rank.setBackground(
        "IMAGE",
        "achievementIcons/" + member.Profile.BackgroundImage + ".png"
      );
    }
    let achievements = [];
    if (member?.Profile?.Achievement1 != null) {
      achievements.push({
        imagePath:
          "achievementIcons/badges/" + member.Profile.Achievement1 + ".png",
      });
    }
    if (member?.Profile?.Achievement2 != null) {
      achievements.push({
        imagePath:
          "achievementIcons/badges/" + member.Profile.Achievement2 + ".png",
      });
    }
    if (member?.Profile?.Achievement3 != null) {
      achievements.push({
        imagePath:
          "achievementIcons/badges/" + member.Profile.Achievement3 + ".png",
      });
    }
    if (member?.Profile?.Achievement4 != null) {
      achievements.push({
        imagePath:
          "achievementIcons/badges/" + member.Profile.Achievement4 + ".png",
      });
    }
    if (member?.Profile?.Achievement5 != null) {
      achievements.push({
        imagePath:
          "achievementIcons/badges/" + member.Profile.Achievement5 + ".png",
      });
    }
    rank.setOverlay("#2b2f35", 0.4).setAchievements(achievements);

    return await rank.build();
  }

  async checkAchievements(members) {
    global.client.prisma.achievements.findMany().then((achievements) => {
      let DailyLoginAchievement = achievements.find(
        (achievement) =>
          achievement.Type == "VoiceLogin" && achievement.Minimum == 1
      );
      let startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      if (DailyLoginAchievement !== null) {
        members
          .filter(
            (m) =>
              m.voice.channel != null &&
              m.voice.channelId === "530537522921734178"
          )
          .forEach((member) => {
            global.client.prisma.achievement_History
              .findFirst({
                where: {
                  UserID: member.id,
                  AchievementID: DailyLoginAchievement.ID,
                  TimeStamp: {
                    gte: startOfToday,
                  },
                },
              })
              .then((achievement) => {
                console.log(JSON.stringify(achievement));
                console.log(startOfToday);
                if (achievement == null) {
                  this.GiveAchievement(
                    member.id,
                    DailyLoginAchievement.ID,
                    "178435947816419328",
                    new Date().toDateString()
                  );
                }
              });
          });
      }
      /*
      let BattleBitSquadSize = achievements.find(
        (achievement) => achievement.Type == "BattleBitSquadSize"
      );
      if (BattleBitSquadSize !== null) {
        members.filter(
          (m) =>
            m.presence?.status !== "offline" &&
            m.user?.bot === false &&
            (m.presence?.activities?.filter(
              (a) => a.applicationId == 437355994125959168
            ).length ?? 0) > 0
        );

        const groupedMembers = members.reduce((groups, member) => {
          const key = member.propertyToGroupBy; // Replace 'propertyToGroupBy' with the actual property name you want to group by

          if (!groups[key]) {
            groups[key] = [];
          }

          groups[key].push(member);

          return groups;
        }, {});
      }
      */
    });
  }
}
