module.exports = {
  name: "messageCreate",
  execute(message) {
    if (message.channelId === process.env.MEMES_CHANNEL) {
      message.react("👍").then(console.log).catch(console.error);
      message.react("👎").then(console.log).catch(console.error);
    }
  },
};
