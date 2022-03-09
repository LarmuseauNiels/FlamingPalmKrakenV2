const {Collection} = require("discord.js");
client.invites.set(invite.guild.id, await invite.guild.fetchInvites());
module.exports = {
    name: 'inviteCreate',
    execute(invite) {
        invite.guild.fetchInvites().then(invites =>
        {
            client.invites.set(invite.guild.id, invites );
        });

    },
};