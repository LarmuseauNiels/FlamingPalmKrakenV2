import { SlashCommandBuilder } from "discord.js";
import { IHandler } from "../../interfaces/IHandler";

export default class CrCreateCommand implements IHandler {
  name = "cr-create";
  isGuild = false;
  data = new SlashCommandBuilder()
    .setName("cr-create")
    .setDescription(
      "Initiate a custom raid that allows you to manually set scheduling options and attendees!"
    )
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("Name of the game/raid")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("min-attendees")
        .setDescription("The minimum attendees needed to pick a time")
        .setRequired(true)
    ) as SlashCommandBuilder;

  async execute(interaction: any) {
    const title = interaction.options.getString("title");
    const minPlayers = interaction.options.getInteger("min-attendees");
    let newraid = await global.client.prisma.raids.create({
      data: {
        Title: title,
        MinPlayers: minPlayers,
        Creator: interaction.user.id,
        Status: 5,
      },
    });
    interaction.reply({
      content:
        "Successfully created a custom raid! you can add your own scheduling options to raid id: " +
        newraid.ID +
        " by typing /add-schedule",
      ephemeral: true,
    });
  }
}
