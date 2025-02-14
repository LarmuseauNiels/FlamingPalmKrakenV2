import { Guild, Invite } from "discord.js";

module.exports = {
  name: "inviteCreate",
  execute(invite: Invite) {
    (invite.guild as Guild).invites.fetch().then((invites) => {
      global.client.invites.set(invite.guild.id, invites);
    });
  },
};
