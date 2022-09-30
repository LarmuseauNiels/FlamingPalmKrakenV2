import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { PrismaClient } from "@prisma/client";
import { Islander } from "../../islander/islander";

module.exports = {
  name: "build",
  async execute(interaction) {
    let Islander: Islander = global.client.islander;
  },
};
