const { SlashCommandBuilder } = require("discord.js");
const { Configuration, OpenAIApi } = require("openai");

module.exports = {
  name: "respond",
  data: new SlashCommandBuilder()
    .setName("respond")
    .setDescription("Continue a conversation after using the chat command")
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
      let convo = global.client.chats.get(interaction.user.id).convo;
      convo.push({ role: "user", content: message });
      const response = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: convo,
        max_tokens: 360,
      });
      console.log(response);
      const { data } = response;
      console.log(data);
      if (data.choices[0].message.content.length > 2000) {
        interaction.editReply("response too long");
        return;
      }
      interaction.editReply(data.choices[0].message.content || "no response");
      convo.push(data.choices[0].message);
      global.client.chats.set(interaction.user.id, { convo: convo });
    } catch (e) {
      global.bugsnag.notify(e);
      console.log(e);
      interaction.editReply({ content: "error" });
    }
  },
  isGuild: true,
};
