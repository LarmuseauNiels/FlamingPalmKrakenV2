import { RaidModule } from "../../modules/RaidModule";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SelectMenuInteraction,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";

export default class RaidSignupHandler implements IHandler {
  name = "raidsignup";

  async execute(interaction: SelectMenuInteraction) {
    if (!interaction.isSelectMenu()) return;

    let raid = await global.client.prisma.raids.findUnique({
      where: {
        ID: parseInt(interaction.values[0]),
      },
    });

    if (raid.Status !== 1) {
      interaction.reply({
        content: "This raid is no longer accepting signups.",
        ephemeral: true,
      });
      return;
    }

    let attending = await global.client.prisma.raidAttendees.count({
      where: {
        RaidId: parseInt(interaction.values[0]),
        MemberId: interaction.user.id,
      },
    });

    if (attending > 0) {
      let row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("raidunsub_" + interaction.values[0])
          .setLabel("Unsubscribe")
          .setStyle(ButtonStyle.Secondary)
      );

      interaction.reply({
        content:
          "You've previously enlisted for the raid! Should you wish to opt out, simply hit the button below to withdraw your participation.",
        components: [row],
        ephemeral: true,
      });
      return;
    }

    await RaidModule.AddUserToRaid(
      interaction.user.id,
      parseInt(interaction.values[0])
    );
    interaction.reply({
      content:
        "You've successfully enlisted for the raid! Type /raids again to view any updates or changes.",
      ephemeral: true,
    });
  }
}
