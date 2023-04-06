const { SlashCommandBuilder } = require("discord.js");
const { Configuration, OpenAIApi } = require("openai");

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
        messages: [
          {
            role: "system",
            content: "you are a helpful assistant called kraken",
          },
          { role: "user", content: message },
        ],
        max_tokens: 360,
      });
      const { data } = response;
      console.log(
        interaction.user.id + " used " + data.usage.total_tokens + " tokens"
      );
      if (data.choices[0].message.content.length > 2000) {
        await interaction.editReply("response too long");
        return;
      }
      await interaction.editReply(
        data.choices[0].message.content || "no response"
      );
      global.client.chats.set(interaction.user.id, {
        convo: [
          {
            role: "system",
            content: "you are a helpful assistant called kraken",
          },
          { role: "user", content: message },
          data.choices[0].message,
        ],
      });
    } catch (e) {
      global.bugsnag.notify(e);
      console.log(e);
      await interaction.editReply({ content: "error" });
    }
  },
  isGuild: true,
};
