
module.exports = {
    name: 'inviteCreate',
    execute(invite) {
        invite.guild.fetchInvites().then(invites =>
        {
            client.invites.set(invite.guild.id, invites );
        });

    },
};