const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");

module.exports = {
  name: "admin-set-santas",
  data: new SlashCommandBuilder()
    .setName("admin-set-santas")
    .setDescription("Set receivers who they are giving a gift to.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    if (interaction.user.id != "178435947816419328") {
      interaction.reply({
        content: "You are not allowed to use this command",
        ephemeral: true,
      });
      return;
    }
    await interaction.deferReply();

    const receiver = await client.prisma.sSReceiver.findMany({});
    const senders = await client.prisma.sSSender.findMany({});

    let result = await attachUser(receiver, senders);
    if (result.count == receiver.length) {
      await interaction.editReply({ content: "Success", ephemeral: true });
    } else {
      await interaction.editReply({
        content: "Failed, Clear DB befor retry",
        ephemeral: true,
      });
    }
  },
  isGuild: true,
};

async function attachUser(receivers, senders) {
  let val = [];
  let added = [];
  let output = [];

  for (let key in receivers) {
    val.push(receivers[key].ID);
  }

  await shuffle(val);

  for (let receiver in receivers) {
    for (let sender in val) {
      if (receivers[receiver].ID == val[sender]) {
        console.log("Skipped");
        continue;
      }

      for (let obj in senders) {
        if (senders[obj].ID == val[sender]) {
          if (added.includes(receivers[receiver].ID)) {
            continue;
          }
          added.push(receivers[receiver].ID);
          output.push({
            SenderID: receivers[receiver].ID,
            ReceiverID: senders[obj].ID,
          });
          // @ts-ignore
          val.splice(sender, 1);
        }
      }
    }
  }

  //console.log(output)

  //124214124, 12423523465
  //412412123, 31231312321
  let results = await client.prisma.sSLink.createMany({
    data: output,
  });

  return results;
}

async function shuffle(array) {
  let currentIndex = array.length,
    randomIndex;

  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }
  return array;
}
