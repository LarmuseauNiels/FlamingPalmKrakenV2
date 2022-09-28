module.exports = {
  name: "messageReactionAdd",
  execute(reaction, user) {
    if (reaction.message.channel.id == "561128481384300554") {
      try {
        reaction.message.guild.roles
          .fetch()
          .then((roles) => {
            reaction.message.guild.members
              .fetch(user)
              .then((user) =>
                user.roles.add(
                  roles.find((val) => val.name == reaction.message.content)
                )
              );
          })
          .catch((err) => client.log(err));
      } catch (e) {
        client.log(e);
      }
    }
  },
};
