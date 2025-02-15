import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  SlashCommandBuilder,
  PermissionFlagsBits,
  CommandInteraction,
  TextChannel,
  MessageComponentInteraction,
  Message,
  InteractionEditReplyOptions,
  StringSelectMenuInteraction,
  ColorResolvable,
  ButtonInteraction,
  InteractionCollector,
} from "discord.js";
import { IHandler } from "../../interfaces/IHandler";

export default class EmbedBuilderCommand implements IHandler {
  name = "embed-builder";
  data = new SlashCommandBuilder()
    .setName("embed-builder")
    .setDescription("Create an embed message")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to send the embed message to.")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ) as SlashCommandBuilder;
  isGuild = true;

  async execute(interaction: CommandInteraction) {
    const channel = interaction.guild?.channels.cache.get(
      (interaction.options.get("channel")?.value as string) ||
        interaction.channelId
    ) as TextChannel;

    if (!channel)
      return interaction.reply({
        content: `\`❌\` Invalid channel.`,
        ephemeral: true,
      });

    const embedMain = new EmbedBuilder()
      .setTitle("Embed Builder")
      .setDescription(
        "Select an embed builder constructer in the select menu below to edit the embed message."
      )
      .setColor("Blurple");

    let embedToEdit = new EmbedBuilder().setDescription("Edit me!");

    interaction.reply({
      embeds: [embedMain, embedToEdit],
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("embed_builder")
            .setPlaceholder("Nothing selected.")
            .addOptions(
              { label: "Embed Author", value: "author" },
              { label: "Embed Title", value: "title" },
              { label: "Embed Description", value: "desc" },
              { label: "Embed Footer", value: "footer" },
              { label: "Embed Color", value: "color" },
              { label: "Embed Image", value: "image" },
              { label: "Embed Thumbnail", value: "thumbnail" }
            )
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("embed_creator_save")
            .setLabel("Save & Send")
            .setEmoji("📨")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("embed_creator_restart")
            .setLabel("Restart")
            .setEmoji("🔁")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("embed_creator_end")
            .setLabel("End Interaction")
            .setEmoji("🛑")
            .setStyle(ButtonStyle.Secondary)
        ),
      ],
    });

    const collectorMENU = interaction.channel?.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      filter: (i: MessageComponentInteraction) =>
        i.user.id === interaction.user.id,
    });

    collectorMENU?.on("collect", async (i: StringSelectMenuInteraction) => {
      if (!i.values) return;

      const ID = i.values[0];

      const handleInput = async (
        prompt: string,
        maxLength: number,
        callback: (message: string) => void
      ) => {
        i.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(prompt)
              .setColor("Blue")
              .setFooter({ text: 'Type "cancel" to cancel this interaction.' }),
          ],
          ephemeral: true,
        }).catch(() => {});

        const filter = (m: Message) => m.author.id === i.user.id;

        await interaction.channel
          ?.awaitMessages({
            filter,
            max: 1,
          })
          .then(async (received) => {
            received
              .first()
              ?.delete()
              .catch(() => {});

            const message = received.first()?.content.substr(0, maxLength);

            if (message === "cancel") {
              return i.editReply({
                embeds: [
                  new EmbedBuilder()
                    .setDescription("Cancelled.")
                    .setColor("Yellow"),
                ],
              });
            }

            callback(message!);

            i.editReply({
              content: `\`✅\` Embed \`${ID}\` has been successfully set.`,
              embeds: [],
              ephemeral: true,
            } as InteractionEditReplyOptions);

            return interaction
              .editReply({ embeds: [embedMain, embedToEdit] })
              .catch(() => {});
          });
      };

      switch (ID) {
        case "author":
          handleInput(
            "Please type in this channel the content that should be in the Author Embed.",
            256,
            (message) => {
              embedToEdit.setAuthor({ name: message });
            }
          );
          break;
        case "title":
          handleInput(
            "Please type in this channel the content that should be in the Title Embed.",
            256,
            (message) => {
              embedToEdit.setTitle(message);
            }
          );
          break;
        case "desc":
          handleInput(
            "Please type in this channel the content that should be in the Description Embed.",
            4096,
            (message) => {
              embedToEdit.setDescription(message);
            }
          );
          break;
        case "footer":
          handleInput(
            "Please type in this channel the content that should be in the Footer Embed.",
            2048,
            (message) => {
              embedToEdit.setFooter({ text: message });
            }
          );
          break;
        case "color":
          handleInput(
            "Please type in this channel the color name or HEX code that should be in the Color Embed.",
            256,
            (message) => {
              try {
                embedToEdit.setColor(message as ColorResolvable);
              } catch (e) {
                embedToEdit.setColor("Default");
              }
            }
          );
          break;
        case "image":
          handleInput(
            "Please provide a valid image URL in the channel for the Embed Image.",
            256,
            (message) => {
              try {
                embedToEdit.setImage(message);
              } catch (e) {
                embedToEdit.setImage(null);
              }
            }
          );
          break;
        case "thumbnail":
          handleInput(
            "Please provide a valid image URL in the channel for the Embed Thumbnail.",
            256,
            (message) => {
              try {
                embedToEdit.setThumbnail(message);
              } catch (e) {
                embedToEdit.setThumbnail(null);
              }
            }
          );
          break;
      }
    });

    const collectorBUTTONS: InteractionCollector<any> =
      interaction.channel?.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i: MessageComponentInteraction) =>
          i.user.id === interaction.user.id,
      });

    collectorBUTTONS?.on(
      "collect",
      async (i: ButtonInteraction): Promise<any> => {
        const ID = i.customId;

        if (ID === "embed_creator_save") {
          await channel
            .createWebhook({
              name: interaction.guild?.name!,
              avatar: "https://flamingpalm.com/assets/icons/icon-144x144.png",
            })
            .then(async (_webhook) => {
              await _webhook.send({ embeds: [embedToEdit] });
            });

          await i
            .reply({
              content: `\`✅\` Sent! Check the channel ${channel}.`,
              ephemeral: true,
            })
            .catch(() => {});

          interaction.deleteReply();

          return collectorBUTTONS.stop();
        }

        if (ID === "embed_creator_restart") {
          embedToEdit.setAuthor(null);
          embedToEdit.setTitle(null);
          embedToEdit.setDescription("Edit me!");
          embedToEdit.setFooter(null);
          embedToEdit.setColor(null);

          i.reply({
            content: `\`✅\` Restarted.`,
            ephemeral: true,
          }).catch(() => {});

          return interaction
            .editReply({ embeds: [embedMain, embedToEdit] })
            .catch(() => {});
        }

        if (ID === "embed_creator_end") {
          interaction.deleteReply();

          return collectorBUTTONS.stop();
        }

        if (ID === "embed_creator_help") {
          i.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle("How to create an embed message")
                .setDescription(
                  `To edit the embed message given, select a choice for the embed in the select menu. After selecting, type anything in the chat so I saves it into the Embed.
                Read the instructions from an embed message that is going shown when you have selected a choice.`
                )
                .setColor("Blue"),
            ],
            ephemeral: true,
          }).catch(() => {});
        }
      }
    );
  }
}
