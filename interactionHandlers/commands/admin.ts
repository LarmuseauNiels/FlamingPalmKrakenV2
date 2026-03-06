import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  TextChannel,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";
import { createLogger } from "../../utils/logger";

const log = createLogger("AdminHandler");

export default class AdminHandler implements IHandler {
  name = "admin";
  data = new SlashCommandBuilder()
    .setName("admin")
    .setDescription("use admin power")
    .addStringOption((option) =>
      option
        .setName("command")
        .setDescription("admin command")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ) as SlashCommandBuilder;

  async execute(interaction: ChatInputCommandInteraction) {
    const command = interaction.options.getString("command");
    try {
      if (command === "generate info") {
        const text1 = `# Welcome to the Flaming Palm

## :palm_tree: About us
The Flaming Palm is a gaming community that specializes in organizing and hosting events to foster unity among our members. We are an active community involved in a variety of games and warmly welcome new members to join us.

## :palm_tree: Rules
Respect is key in our community. We have a zero-tolerance policy for spam, recruitment, NSFW content, and extreme toxicity. Failure to comply with these rules may result in post removal, warnings, or even a ban.

## :palm_tree: Roles
We offer several game-specific roles that can be self-assigned by anyone using the channels & roles option. By assigning these roles, you gain access to the necessary text channels and receive game event notifications.

## :palm_tree: Events
We organize a variety of events on a weekly or biweekly basis. You can find information about these events in the Discord Events tab or on our website's calendar.`;
        const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel("Calendar")
            .setURL("https://flamingpalm.com/calendar")
            .setStyle(ButtonStyle.Link)
        );

        await (interaction.channel as TextChannel).send({
          content: text1,
          components: [row2],
        });

        const text3 = `## :palm_tree: Points & Achievements

Members of our community have the opportunity to earn Achievements through various activities, with a primary focus on participating in events and recruiting new members. These Achievements grant :palm_tree:  points. The accumulated points can be redeemed for rewards on our webstore.`;
        const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel("Webstore")
            .setURL("https://flamingpalm.com/members/store")
            .setStyle(ButtonStyle.Link),
          new ButtonBuilder()
            .setLabel("Info page")
            .setURL("https://flamingpalm.com/members/info")
            .setStyle(ButtonStyle.Link)
        );

        await (interaction.channel as TextChannel).send({
          content: text3,
          components: [row3],
        });
      }

      interaction.reply({ content: "done", ephemeral: true });
    } catch (e) {
      log.error("Admin command error:", e);
    }
  }

  isGuild = true;
}
