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
      let convo = global.client.chats.get(interaction.user.id).convo;
      if (!convo) await interaction.reply("no conversation found");
      await interaction.deferReply();
      convo.push({ role: "user", content: message });
      const response = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: convo,
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
      convo.push(data.choices[0].message);
      global.client.chats.set(interaction.user.id, { convo: convo });
    } catch (e) {
      global.bugsnag.notify(e);
      console.log(e);
      await interaction.editReply({ content: "error" });
    }
  },
  isGuild: true,
};
