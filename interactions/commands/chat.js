const { SlashCommandBuilder } = require("discord.js");
const { EmbedBuilder } = require("discord.js");
const { Configuration, OpenAIApi } = require("openai");
//const { EmbedBuilder,ActionRowBuilder, ButtonBuilder } = require('discord.js');

module.exports = {
  name: "chat",
  data: new SlashCommandBuilder()
    .setName("chat")
    .setDescription("chat with the kraken")
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("The message to send")
        .setRequired(true)
    ),
  async execute(interaction) {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const message = interaction.options.getString("message");
    const openai = new OpenAIApi(configuration);
    await interaction.deferReply();
    const response = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: `I am a highly intelligent question answering bot. If you ask me a question that is rooted in truth, I will give you the answer. If you ask me a question that is nonsense, trickery, or has no clear answer,  I will answer with a sarcastic response.\n\nQ: ${message} \n`,
      temperature: 0,
      max_tokens: 100,
      top_p: 1,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
      stop: ["\n"],
    });
    await interaction.reply(response);
  },
  isGuild: true,
};
