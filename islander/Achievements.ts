import { createCanvas, Image } from "@napi-rs/canvas";
import { readFile } from "fs/promises";
import { AttachmentBuilder } from "discord.js";
const { request } = require("undici");

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

  async GetProfile(memberID: string) {
    let member = await global.client.prisma.members.findFirst({
      where: {
        ID: memberID,
      },
    });

    //get guild member from id
    let guildMember = await global.client.guild.members.fetch(memberID);

    const canvas = createCanvas(700, 250);
    const context = canvas.getContext("2d");

    const background = await readFile("./wallpaper.jpg");
    const backgroundImage = new Image();
    backgroundImage.src = background;
    context.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);

    context.strokeStyle = "#0099ff";
    context.strokeRect(0, 0, canvas.width, canvas.height);

    context.font = "28px sans-serif";
    context.fillStyle = "#ffffff";
    context.fillText("Profile", canvas.width / 2.5, canvas.height / 3.5);

    context.font = applyText(canvas, `${member.DisplayName}!`);
    context.fillStyle = "#ffffff";
    context.fillText(
      `${member.DisplayName}!`,
      canvas.width / 2.5,
      canvas.height / 1.8
    );

    context.beginPath();
    context.arc(125, 125, 100, 0, Math.PI * 2, true);
    context.closePath();
    context.clip();

    const { body } = await request(
      guildMember.avatar.displayAvatarURL({ format: "jpg" })
    );
    const avatar = new Image();
    avatar.src = Buffer.from(await body.arrayBuffer());
    context.drawImage(avatar, 25, 25, 200, 200);

    const attachment = new AttachmentBuilder(canvas.toBuffer("image/png"), {
      name: "profile-image.png",
    });
    return attachment;
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
