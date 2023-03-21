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
    try {
      await interaction.deferReply();
      const response = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: message }],
        max_tokens: 400,
      });
      console.log(response);
      const { data } = response;
      console.log(data);
      interaction.editReply(data.choices[0].message.content || "no response");
    } catch (e) {
      global.bugsnag.notify(e);
      console.log(e);
      interaction.editReply({ content: "error" });
    }
  },
  isGuild: true,
};
