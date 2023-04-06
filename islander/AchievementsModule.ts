import Canvas, { createCanvas, Image } from "@napi-rs/canvas";
import { AttachmentBuilder, User } from "discord.js";

const { request } = require("undici");

export class AchievementsModule {
  async GiveAchievement(
    memberID: string,
    achievementID: number,
    grantedBy: string
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
          lastComment: achievement.Name + " " + achievement.Description,
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
    console.log(member);
    let guildMember: User = await global.client.users.fetch(memberID, false);
    console.log(guildMember);
    const canvas = createCanvas(700, 250);
    const context = canvas.getContext("2d");
    const backgroundImage = await Canvas.loadImage("sprites/profilebg.jpg");
    context.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#0099ff";
    context.strokeRect(0, 0, canvas.width, canvas.height);
    context.font = applyText(canvas, `${guildMember.username}!`);
    context.fillStyle = "#ffffff";
    context.fillText(
      `${guildMember.username}!`,
      canvas.width / 2.5,
      canvas.height / 1.8
    );
    context.beginPath();
    context.arc(125, 125, 100, 0, Math.PI * 2, true);
    context.closePath();
    context.clip();
    const { body } = await request(
      guildMember.displayAvatarURL({ extension: "jpg" })
    );
    const avatar = new Image();
    avatar.src = Buffer.from(await body.arrayBuffer());
    context.drawImage(avatar, 25, 25, 200, 200);
    return new AttachmentBuilder(canvas.toBuffer("image/png"), {
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
