import { EmbedBuilder, GuildMember, Role } from "discord.js";

module.exports = {
  name: "guildMemberUpdate",
  async execute(oldMember: GuildMember, newMember: GuildMember) {
    // If the role(s) are present on the new member object but are not on the old one (i.e role(s) were added)
    const addedRoles = newMember.roles.cache.filter(
      (role: Role) => !oldMember.roles.cache.has(role.id)
    );
    if (addedRoles.size > 0) {
      console.log(
        `roles changed! added roles: ${addedRoles.map((r: Role) => r.name)}}`
      );
      if (addedRoles.find((r: Role) => r.name === "Community Regular")) {
        await sendReferralMessage(newMember, false);
      }
      if (addedRoles.find((r: Role) => r.name === "Community Member")) {
        await sendReferralMessage(newMember, true);
      }
    }
  },
};

async function sendReferralMessage(member: GuildMember, isMember: boolean) {
  let referrer = await global.client.prisma.refferals.findFirst({
    where: {
      userid: member.id,
    },
    include: {
      Members_MembersToRefferals_refferer: true,
    },
  });

  if (!referrer) {
    console.error(`No referral found for user ${member.id}.`);
    return;
  }

  const embed = new EmbedBuilder()
    .setColor("#FD8612")
    .setTitle(
      `${member.user.username} has become a ${isMember ? "Member" : "Regular"}!`
    )
    .addFields(
      {
        name: "Referrer",
        value: referrer.Members_MembersToRefferals_refferer.DisplayName,
        inline: false,
      },
      {
        name: "Join date",
        value: referrer.CreatedTimestamp.toString(),
        inline: false,
      }
    )
    .setFooter({
      text: "Niels2398 FPG kraken bot",
      iconURL:
        "https://flamingpalm.com/assets/images/logo/FlamingPalmLogoSmall.png",
    });

  global.client.logChannel.send({ embeds: [embed] });
}
