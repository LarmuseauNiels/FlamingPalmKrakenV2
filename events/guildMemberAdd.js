const { EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require("discord.js");

module.exports = {
  name: "guildMemberAdd",
  async execute(GuildMember) {
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
      let notExist = oldinvites.filter(
        (a) => !newInvites.has((b) => b.code === a.code)
      );
      console.log("removed");
      console.log(notExist);
      let usedInvite = newInvites.get(moreUses[0].code);
      /*
      console.log("got invites");
      let usedInvite;
      console.log(
        newInvites.find(
          (invite) =>
            cachedInvites.find((i) => i.code === invite.code).uses < invite.uses
        )
      );
      let possibleInvites = newInvites.filter(
        (invite) =>
          cachedInvites.find((i) => i.code === invite.code).uses < invite.uses
      ).size;
      console.log(possibleInvites + " possible invites");
      if (possibleInvites === 1) {
        usedInvite = newInvites.find(
          (invite) =>
            oldinvites.find((i) => i.code === invite.code).uses < invite.uses
        );
      }
      if (possibleInvites === 0) {
        console.log("invite not found checking for removed invite");
        let removedInvites = cachedInvites.filter(
          (inv) =>
            newInvites.filter((ninv) => ninv.code === inv.code).size === 0
        );
        if (removedInvites.size === 1) usedInvite = removedInvites[0];
        if (removedInvites.size > 1) {
          console.log("could not pin down single removed invite");
          console.log(removedInvites);
        }
      }
      console.log(usedInvite);
      */

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
      } catch (error) {
        console.log(error);
      }
      global.client.logChannel.send({ embeds: [embed] });
    });
  },
};
