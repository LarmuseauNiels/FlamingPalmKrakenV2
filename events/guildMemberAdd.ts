import { EmbedBuilder, Invite, GuildMember, Role } from "discord.js";
import { IEvent } from "../interfaces/IEvent";
import { createLogger } from "../utils/logger";

const log = createLogger("GuildMemberAdd");

export default class guildMemberAdd implements IEvent {
  name = "guildMemberAdd";
  async execute(GuildMember: GuildMember) {
    //give member role
    try {
      const memberRole: Role | undefined = GuildMember.guild.roles.cache.find(
        (role) => role.name === "Guest"
      );
      if (memberRole) {
        GuildMember.roles.add(memberRole);
      }
    } catch (error) {
      global.bugsnag.notify(error);
    }

    const cachedInvites = global.client.invites.get(GuildMember.guild.id);
    const oldinvites = cachedInvites.map((i: Invite) => {
      return { code: i.code, uses: i.uses };
    });
    log.debug("Cached invites:", oldinvites);
    GuildMember.guild.invites.fetch().then(async (newInvites) => {
      const invitemap = newInvites.map((i: Invite) => {
        return { code: i.code, uses: i.uses };
      });
      log.debug("New invites:", invitemap);
      const moreUses = invitemap.filter(
        (a) => oldinvites.find((b) => b.code === a.code)?.uses! < a.uses
      );
      log.debug("Invites with more uses:", moreUses);
      const removed = oldinvites.filter(
        (a) => newInvites.find((b) => b.code === a.code) === undefined
      );
      log.debug("Removed invites:", removed);
      let usedInvite: Invite | undefined;
      if (moreUses.length === 1) usedInvite = newInvites.get(moreUses[0].code);
      else if (removed.length === 1)
        usedInvite = cachedInvites.get(removed[0].code);
      global.client.invites.set(GuildMember.guild.id, newInvites);

      const embed = new EmbedBuilder()
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
        const user = await global.client.prisma.members.upsert({
          where: { ID: GuildMember.id },
          update: {
            DisplayName: GuildMember.user.username,
            avatar: GuildMember.user.avatar,
          },
          create: {
            ID: GuildMember.id,
            DisplayName: GuildMember.user.username,
            avatar: GuildMember.user.avatar,
          },
        });
        if (usedInvite?.inviter) {
          await global.client.prisma.members.upsert({
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
        }
      } catch (error) {
        global.bugsnag.notify(error);
        log.error("Error in guildMemberAdd:", error);
      }
      global.client.logChannel
        .send({ embeds: [embed] })
        .catch((error) => log.error("Failed to send log message:", error));
    }).catch((error) => log.error("Failed to fetch guild invites:", error));
  }
}
