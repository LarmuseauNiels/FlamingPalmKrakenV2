module.exports = {
  name: "inviteCreate",
  execute(invite) {
    invite.guild.invites.fetch().then((invites) => {
      client.invites.set(invite.guild.id, invites);
    });
  },
};
