import { ButtonInteraction } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { RaidModule } from "../../modules/RaidModule";

export default class RaidUnsub implements IHandler {
  name = "raidunsub";
  async execute(interaction: ButtonInteraction) {
    const raidId = parseInt(interaction.customId.split("_")[1], 10);
    if (!Number.isInteger(raidId)) throw new Error(`raidunsub: bad custom id "${interaction.customId}"`);

    // deleteMany, not delete: pressing the button twice (or after leaving some
    // other way) is not an error, just nothing left to remove.
    const removed = await global.client.prisma.raidAttendees.deleteMany({
      where: { RaidId: raidId, MemberId: interaction.user.id },
    });
    if (removed.count > 0) await RaidModule.touchRaid(raidId);

    await interaction.reply({
      content: removed.count > 0 ? "Successfully unsubscribed from the raid!" : "You weren't signed up for this raid.",
      ephemeral: true,
    });
  }
}
