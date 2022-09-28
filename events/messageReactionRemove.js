module.exports = {
  name: "messageReactionRemove",
  execute(reaction, user) {
    if (reaction.message.channel.id == "561128481384300554") {
      try {
        reaction.message.guild.roles
          .fetch()
          .then((roles) => {
            reaction.message.guild.members
              .fetch(user)
              .then((user) =>
                user.roles.remove(
                  roles.find((val) => val.name == reaction.message.content)
                )
              );
          })
          .catch((err) => global.client.log(err));
      } catch (e) {
        global.client.log(e);
      }
    }
  },
};
