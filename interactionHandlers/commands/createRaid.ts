import { SlashCommandBuilder } from "discord.js";
import { ChannelUpdates } from "../../islander/ChannelUpdates";
import { IHandler } from "../../interfaces/IHandler";

export default class CreateRaidCommand implements IHandler {
  name = "create-raid";
  isGuild = false;
  data = new SlashCommandBuilder()
    .setName("create-raid")
    .setDescription("Initiate a new raid and add it to the list!")
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("Name of the game/raid")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("minplayers")
        .setDescription(
          "The minimum players needed to start scheduling the raid"
        )
        .setRequired(true)
    ) as SlashCommandBuilder;
  async execute(interaction: any) {
    const title = interaction.options.getString("title");
    const minPlayers = interaction.options.getInteger("minplayers");

    await global.client.prisma.raids.create({
      data: {
        Title: title,
        MinPlayers: minPlayers,
        Creator: interaction.user.id,
      },
    });
    ChannelUpdates.MessageWithRaid("New raid created: " + title);
    interaction.reply({
      content:
        "Successfully created a new raid! Check out the updated list by typing /raids.",
      ephemeral: true,
    });
  }
}
