module.exports = {
  name: "inviteCreate",
  execute(invite) {
    invite.guild.invites.fetch().then((invites) => {
      global.client.invites.set(invite.guild.id, invites);
    });
  },
};
