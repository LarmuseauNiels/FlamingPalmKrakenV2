module.exports = {
  name: "subscribe",
  async execute(interaction) {
    var role_name = interaction.customId.split("_")[1];

    interaction.message.guild.roles.fetch().then((roles) => {
      var hasRole = interaction.member.roles.cache.some(
        (role) => role.name === role_name
      );

      if (!hasRole) {
        interaction.member.roles.add(
          roles.find((val) => val.name === role_name)
        );
        interaction.reply({
          ephemeral: true,
          content: "Added role " + role_name,
        });
      } else {
        interaction.member.roles.remove(
          roles.find((val) => val.name === role_name)
        );
        interaction.reply({
          ephemeral: true,
          content: "Removed role " + role_name,
        });
      }
    });
  },
};
