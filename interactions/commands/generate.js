const { SlashCommandBuilder } = require("discord.js");
const { EmbedBuilder } = require("discord.js");
const { Configuration, OpenAIApi } = require("openai");
//const { EmbedBuilder,ActionRowBuilder, ButtonBuilder } = require('discord.js');

module.exports = {
  name: "generate",
  data: new SlashCommandBuilder()
    .setName("generate")
    .setDescription("Generate an image with AI")
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Image description")
        .setRequired(true)
    ),
  async execute(interaction) {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const message = interaction.options.getString("message");
    const openai = new OpenAIApi(configuration);
    try {
      await interaction.deferReply();
      const response = await openai.createImage({
        prompt: message,
        n: 1,
        size: "1024x1024",
      });
      let image_url = response.data.data[0].url;
      interaction.editReply({ content: image_url });
    } catch (e) {
      console.log(e);
      interaction.editReply({ content: "error" });
    }
  },
  isGuild: true,
};
