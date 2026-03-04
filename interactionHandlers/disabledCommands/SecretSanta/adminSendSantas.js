import {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from "discord.js";

module.exports = {
  name: "admin-send-santas",
  data: new SlashCommandBuilder()
    .setName("admin-send-santas")
    .setDescription("Sends recipients name/id to santas")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    if (interaction.user.id != "178435947816419328") {
      interaction.reply({
        content: "You are not allowed to use this command",
        ephemeral: true,
      });
      return;
    }

    let links = await client.prisma.sSLink.findMany({
      include: {
        SSReceiver: {
          include: { Members: true },
        },
      },
    });
    links.forEach((link) => {
      client.users.fetch(link.SenderID, false).then((user) => {
        let embed = new EmbedBuilder()
          .setColor("#FD8612")
          .setTitle(
            `You have been assigned ${link.SSReceiver.Members.DisplayName} as your recipient`
          )
          .addFields(
            {
              name: "Info",
              value: `Welcome to Secret Santa 2024! 

It's very important to keep your identity hidden until the reveal party,
so we've made it possible to message your recipient and secret santa anonymously using the bot.
Use the command /send-to-receiver in this chat to message your gift recipient,
and use the command /send-to-santa to reply to your secret santa. 
It's that simple!
**Please read and reply to messages in this chat ASAP**

You'll also receive organisational messages with important information from time to time, so keep a look out for those. 
Some messages will have a button to confirm you have completed the action. 
Please use this button when applicable so we can confirm everyone has received / sent their gift!

Have a Merry Christmas!🎄 `,
            },
            { name: "Address", value: link.SSReceiver.Address },
            { name: "Store links", value: link.SSReceiver.StoreLinks }
          )
          .setFooter({
            text: `If you have any questions, please contact Niels#2398`,
            iconURL: "https://flamingpalm.com/images/FlamingPalmLogoSmall.png",
          })
          .setTimestamp();
        let row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("confirmSanta")
            .setLabel("I have read this message and will send a gift")
            .setStyle(ButtonStyle.Primary)
        );
        user.send({ embeds: [embed], components: [row], ephemeral: false });
      });
    });
    await interaction.reply("Sent secret santa recipients");
  },
  isGuild: true,
};
