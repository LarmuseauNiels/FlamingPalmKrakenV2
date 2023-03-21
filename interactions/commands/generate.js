const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
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
    // check if this is the admin user
    if (interaction.user.id !== "178435947816419328") {
      interaction.reply("You are not allowed to use this command");
      return;
    }
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
        response_format: "b64_json",
      });
      let images = imagesFromBase64Response(response.data);
      let image = images[0];
      let attachment = new AttachmentBuilder(image, { name: "dalle.png" });
      interaction.editReply({ content: message, files: [attachment] });
    } catch (e) {
      global.bugsnag.notify(e);
      console.log(e);
      interaction.editReply({ content: "error" });
    }
  },
  isGuild: true,
};

function imagesFromBase64Response(response) {
  const data = response.data;
  const resultData = data.map((d) => d.b64_json);
  return resultData.map((j) => Buffer.from(j, "base64"));
}
