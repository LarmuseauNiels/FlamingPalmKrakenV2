const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  Collection,
  Invite,
} = require("discord.js");

module.exports = {
  name: "guildMemberAdd",
  async execute(GuildMember) {
    //give member role
    try {
      let memberRole = GuildMember.guild.roles.cache.find(
        (role) => role.name === "Guest"
      );
      GuildMember.roles.add(memberRole);
    } catch (error) {
      global.bugsnag.notify(error);
    }

    const cachedInvites = global.client.invites.get(GuildMember.guild.id);
    const oldinvites = cachedInvites.map((i) => {
      return { code: i.code, uses: i.uses };
    });
    console.log(oldinvites);
    GuildMember.guild.invites.fetch().then(async (newInvites) => {
      let invitemap = newInvites.map((i) => {
        return { code: i.code, uses: i.uses };
      });
      console.log(invitemap);
      let moreUses = invitemap.filter(
        (a) => oldinvites.find((b) => b.code === a.code).uses < a.uses
      );
      console.log("used");
      console.log(moreUses);
      let removed = oldinvites.filter(
        (a) => newInvites.find((b) => b.code === a.code) === undefined
      );
      console.log("removed");
      console.log(removed);
      let usedInvite;
      if (moreUses.length === 1) usedInvite = newInvites.get(moreUses[0].code);
      else if (removed.length === 1)
        usedInvite = cachedInvites.get(removed[0].code);
      global.client.invites.set(GuildMember.guild.id, newInvites);

      let embed = new EmbedBuilder()
        .setColor("#FD8612")
        .setTitle(`${GuildMember.user.username} joined`)
        .setAuthor({
          name: `${GuildMember.user.username}`,
          iconURL:
            "https://cdn.discordapp.com/avatars/" +
            GuildMember.user.id +
            "/" +
            GuildMember.user.avatar,
        })
        .addFields(
          { name: "ID ", value: `${GuildMember.id}`, inline: false },
          {
            name: "name & discriminator",
            value: `${GuildMember.user.username}#${GuildMember.user.discriminator}`,
            inline: false,
          },
          {
            name: "account created",
            value: `${GuildMember.user.createdAt}`,
            inline: false,
          },
          { name: "link code", value: `${usedInvite?.code}`, inline: false },
          {
            name: "inviter",
            value: `${usedInvite?.inviter?.username}`,
            inline: false,
          }
        )
        .setTimestamp();
      try {
        let user = await global.client.prisma.members.create({
          data: {
            ID: GuildMember.id,
            DisplayName: GuildMember.user.username,
            avatar: GuildMember.user.avatar,
          },
        });
        let referrer = await global.client.prisma.members.upsert({
          where: { ID: usedInvite.inviter.id },
          update: {
            DisplayName: usedInvite.inviter.username,
            avatar: usedInvite.inviter.avatar,
          },
          create: {
            ID: usedInvite.inviter.id,
            DisplayName: usedInvite.inviter.username,
            avatar: usedInvite.inviter.avatar,
          },
        });

        await global.client.prisma.refferals.create({
          data: {
            userid: GuildMember.id,
            refferer: usedInvite.inviter.id,
          },
        });

        await global.client.achievementsModule.GiveAchievement(
          usedInvite.inviter.id,
          14,
          "178435947816419328",
          GuildMember.user.username
        );
      } catch (error) {
        global.bugsnag.notify(error);
        console.log(error);
      }
      global.client.logChannel.send({ embeds: [embed] });
    });
  },
};
