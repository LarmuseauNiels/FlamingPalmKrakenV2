const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
module.exports = {
  name: "admin",
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("use admin power")
    .addStringOption((option) =>
      option
        .setName("command")
        .setDescription("admin command")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const command = interaction.options.getString("command");
    try {
      if (command === "generate info") {
        const text1 = `# Welcome to the Flaming Palm

## :palm_tree: About us
The Flaming Palm is a gaming community that specializes in organizing and hosting events to foster unity among our members. We are an active community involved in a variety of games and warmly welcome new members to join us.

## :palm_tree: Rules
Respect is key in our community. We have a zero-tolerance policy for spam, recruitment, NSFW content, and extreme toxicity. Failure to comply with these rules may result in post removal, warnings, or even a ban. Please note that long periods of inactivity may lead to a kick from the server.

## :palm_tree: Roles
We offer several game-specific roles that can be self-assigned by anyone using the buttons provided below. By assigning these roles, you gain access to the necessary text channels and receive game event notifications.`;

        let row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("toggleRole_EUIV")
            .setLabel("Europa Universalis IV")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("toggleRole_HOIIV")
            .setLabel("Hearts of Iron IV")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("toggleRole_CK3")
            .setLabel("Crusader Kings III")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("toggleRole_VIC3")
            .setLabel("Victoria III")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("toggleRole_PARTY")
            .setLabel("Party Games")
            .setStyle(ButtonStyle.Primary)
        );

        await interaction.channel.send({
          content: text1,
          components: [row],
        });

        const text2 = `## :palm_tree: Events
We organize a variety of events on a weekly or biweekly basis. You can find information about these events in the Discord Events tab or on our website's calendar.`;
        let row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel("Calendar")
            .setURL("https://flamingpalm.com/calendar")
            .setStyle(ButtonStyle.Link),
          new ButtonBuilder()
            .setCustomId("toggleRole_EventNotification")
            .setLabel("Get DM'd 30 min events")
            .setStyle(ButtonStyle.Primary)
        );

        await interaction.channel.send({
          content: text2,
          components: [row2],
        });

        const text3 = `## :palm_tree: Points & Achievements

Members of our community have the opportunity to earn Achievements through various activities, with a primary focus on participating in events and recruiting new members. These Achievements grant :palm_tree:  points. The accumulated points can be redeemed for rewards on our webstore.`;
        let row3 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel("Webstore")
            .setURL("https://flamingpalm.com/store")
            .setStyle(ButtonStyle.Link)
        );

        await interaction.channel.send({
          content: text3,
          components: [row3],
        });
      }

      interaction.reply("done", { ephemeral: true });
    } catch (e) {
      global.bugsnag.notify(e);
      console.log(e);
    }
  },
  isGuild: true,
};
