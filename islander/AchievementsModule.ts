import { AttachmentBuilder, User } from "discord.js";
import Rank from "../islander/profile";

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

    console.log("Giving achievement: " + achievement.Name + " to " + memberID);
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
      await global.client.prisma.points.update({
        where: {
          userid: memberID,
        },
        data: {
          TotalPoints: { increment: achievement.points },
          lastComment:
            achievement.Name + (description != null ? description : ""),
        },
      });
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

  async GetProfile(memberID: string): Promise<AttachmentBuilder> {
    let member = await global.client.prisma.members.findFirst({
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
      .setAvatar(guildMember.avatarURL())
      .setCurrentXP(member.XP)
      .setRequiredXP(1000)
      .setStatus("online")
      .setProgressBar(["#FF0000", "#0000FF"], "GRADIENT")
      .setUsername(guildMember.username)
      .setDiscriminator(guildMember.discriminator);

    const data = await rank.build();
    return new AttachmentBuilder(data, {
      name: "profile-image.png",
    });
  }
}

const applyText = (canvas, text) => {
  const context = canvas.getContext("2d");
  let fontSize = 70;

  do {
    context.font = `${(fontSize -= 10)}px sans-serif`;
  } while (context.measureText(text).width > canvas.width - 300);

  return context.font;
};
