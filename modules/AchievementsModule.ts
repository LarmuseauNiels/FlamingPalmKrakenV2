import { AttachmentBuilder, Collection, EmbedBuilder, GuildMember, User } from "discord.js";
import Rank from "./profile";
import { ChannelUpdates } from "../islander/ChannelUpdates";
import type * as Prisma from "@prisma/client";

// Name of the weekly Saturday Spark achievement row (see the
// add_saturday_spark_achievement migration). Admins hand it out with /give-event.
export const SPARK_ACHIEVEMENT_NAME = "Saturday Spark";

/** Joining this voice channel each day earns the daily login achievement. */
const DAILY_LOGIN_VOICE_CHANNEL_ID = "530537522921734178";
/** Recorded as the granter of automatic daily login achievements. */
const DAILY_LOGIN_GRANTED_BY_ID = "178435947816419328";

export class AchievementsModule {
  async GiveAchievement(
    memberID: string,
    achievementID: number,
    grantedBy: string,
    description?: string | null
  ) {
    // get achievement
    const achievement = await global.client.prisma.achievements.findFirst({
      where: {
        ID: achievementID,
      },
    });
    if (!achievement) throw new Error(`GiveAchievement: no achievement with ID ${achievementID}`);
    const xpIncrease = achievement.XpIncrease ?? 0;
    const points = achievement.points ?? 0;
    // Shown after the name; absent used to print "null"/"undefined".
    const descriptionSuffix = description ? ` \n${description}` : "";

    global.client.log(
      "Giving achievement: " +
        achievement.Name +
        " to " +
        global.client.idToName(memberID)
    );
    await global.client.prisma.achievement_History.create({
      data: {
        UserID: memberID,
        AchievementID: achievementID,
        GrantedBy: grantedBy,
        Description: description,
      },
    });

    if (xpIncrease > 0) {
      // get member
      await global.client.prisma.members.update({
        where: {
          ID: memberID,
        },
        data: {
          XP: { increment: xpIncrease },
        },
      });
    }
    //check if achievement gives points
    if (points > 0) {
      ChannelUpdates.MessageWithProfile(
        `<@${memberID}> received an achievement!: ${achievement.Name}${descriptionSuffix}`,
        memberID
      ).catch((err) =>
        global.client.log("Failed to send achievement profile message for " + memberID + ": " + err)
      );

      await global.client.prisma.points.update({
        where: {
          userid: memberID,
        },
        data: {
          TotalPoints: { increment: points },
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
                // Field values must be non-empty, or the DM silently failed.
                { name: "Description", value: achievement.Description || "—" },
                {
                  name: "Points",
                  value: points.toString(),
                  inline: true,
                },
                {
                  name: "XP",
                  value: xpIncrease.toString(),
                  inline: true,
                }
              );
            global.client.users.cache
              .get(memberID)
              ?.send({ embeds: [embed] })
              .catch((err) =>
                global.client.log(
                  "Failed to send achievement DM to " + memberID + ": " + err
                )
              );
          }
        })
        .catch((err) =>
          global.client.log(
            "Failed to check achievement notifications for " + memberID + ": " + err
          )
        );
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
    const a = await global.client.prisma.$queryRaw<{ streak: number | null }[]>`SELECT MAX(streak) as streak
FROM (
  SELECT AchievementID, UserId, Timestamp,
         DATEDIFF(NOW(), Timestamp),
         @streak := IF( DATEDIFF(NOW(), Timestamp) - @days_diff > 1, @streak,
                       IF(@days_diff := DATEDIFF(NOW(), Timestamp), @streak+1, @streak+1))  AS streak
  FROM Achievement_History
  CROSS JOIN (SELECT @streak := 0, @days_diff := -1) AS vars
  WHERE UserId = ${memberID} AND Timestamp <= NOW() And AchievementID = 13
  ORDER BY Timestamp DESC) AS t`;
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
    let guildMember: User = await global.client.users.fetch(memberID);

    const rank = new Rank()
      .setUsername(guildMember.username)
      // Members without a custom avatar have avatarURL() === null.
      .setAvatar(guildMember.avatarURL() ?? guildMember.displayAvatarURL())
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
        "assets/" + member.Profile.BackgroundImage + ".png"
      );
    }
    let achievements = [];
    if (member?.Profile?.Achievement1 != null) {
      achievements.push({
        imagePath: "assets/badges/" + member.Profile.Achievement1 + ".png",
      });
    }
    if (member?.Profile?.Achievement2 != null) {
      achievements.push({
        imagePath: "assets/badges/" + member.Profile.Achievement2 + ".png",
      });
    }
    if (member?.Profile?.Achievement3 != null) {
      achievements.push({
        imagePath: "assets/badges/" + member.Profile.Achievement3 + ".png",
      });
    }
    if (member?.Profile?.Achievement4 != null) {
      achievements.push({
        imagePath: "assets/badges/" + member.Profile.Achievement4 + ".png",
      });
    }
    if (member?.Profile?.Achievement5 != null) {
      achievements.push({
        imagePath: "assets/badges/" + member.Profile.Achievement5 + ".png",
      });
    }
    rank.setOverlay("#2b2f35", 0.4).setAchievements(achievements);

    return await rank.build();
  }

  async checkAchievements(members: Collection<string, GuildMember>) {
    return global.client.prisma.achievements
      .findMany()
      .then((achievements) => {
        let DailyLoginAchievement = achievements.find(
          (achievement) =>
            achievement.Type == "VoiceLogin" && achievement.Minimum == 1
        );
        let startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        // Array.find returns undefined, not null, when there is no such achievement.
        if (DailyLoginAchievement) {
          const dailyLogin = DailyLoginAchievement;
          members
            .filter(
              (m) =>
                m.voice.channel != null &&
                m.voice.channelId === DAILY_LOGIN_VOICE_CHANNEL_ID
            )
            .forEach((member) => {
              global.client.prisma.achievement_History
                .findFirst({
                  where: {
                    UserID: member.id,
                    AchievementID: dailyLogin.ID,
                    TimeStamp: {
                      gte: startOfToday,
                    },
                  },
                })
                .then((achievement) => {
                  if (achievement == null) {
                    this.GiveAchievement(
                      member.id,
                      dailyLogin.ID,
                      DAILY_LOGIN_GRANTED_BY_ID,
                      new Date().toDateString()
                    ).catch((err) =>
                      global.client.log(
                        "Failed to give daily login achievement to " + member.id + ": " + err
                      )
                    );
                  }
                })
                .catch((err) =>
                  global.client.log(
                    "Failed to check daily login achievement for " +
                      member.id +
                      ": " +
                      err
                  )
                );
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
      })
      .catch((err) =>
        global.client.log("Failed to fetch achievements for check: " + err)
      );
  }

  getBadgeUnlocks(achievements: any[]) {
    let badgeUnlocks: string[] = [];
    if (achievements.filter((a) => a.AchievementID == 1).length > 5) {
      badgeUnlocks.push("party5");
    }
    if (achievements.filter((a) => a.AchievementID == 16).length > 5) {
      badgeUnlocks.push("arma5");
    }
    if (achievements.filter((a) => a.AchievementID == 18).length > 5) {
      badgeUnlocks.push("raid5");
    }
    // The Saturday Spark achievement is added by a data migration, so its ID
    // differs per database; match it by name instead. Needs the history rows
    // to include their Achievements relation.
    if (
      achievements.filter(
        (a) => a.Achievements?.Name === SPARK_ACHIEVEMENT_NAME
      ).length > 5
    ) {
      badgeUnlocks.push("spark5");
    }
    if (achievements.filter((a) => a.AchievementID == 11).length > 5) {
      badgeUnlocks.push("refReg1");
    }
    return badgeUnlocks;
  }
}
