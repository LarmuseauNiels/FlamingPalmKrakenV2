import cron from "node-cron";
import { ActivityType, BaseGuildTextChannel } from "discord.js";
import axios from "axios";
import { FpgClient } from "../components/FpgClient";

async function fetchVintageStoryServers(): Promise<any> {
  const url = "https://masterserver.vintagestory.at/api/v1/servers/list";
  const res = await axios.get(url, {
    headers: { Accept: "application/json" },
    timeout: 15000,
    validateStatus: () => true,
  });
  if (res.status >= 200 && res.status < 300) {
    return res.data;
  }
  throw new Error(
    `VintageStory master server request failed: ${res.status} ${res.statusText}`
  );
}

const VS_CHANNEL_ID = "1423193044567462009";

module.exports = function (client: FpgClient) {
  cron.schedule("10 * * * * *", () => {
    fetchVintageStoryServers()
      .then((data) => {
        console.log("Fetched Vintage Story servers");
        let server = data.data.find(
          (s) => s.serverName === process.env.VS_SERVER_NAME
        );
        if (!server) {
          throw new Error(`No server found for ${process.env.VS_SERVER_NAME}`);
        }
        global.client.user.setActivity(
          "VintageStory " + server.players + "/8",
          { type: ActivityType.Playing }
        );
        client.channels.fetch(VS_CHANNEL_ID).then((channel) => {
          (channel as BaseGuildTextChannel).setName(
            "🏕️┃vintage-story-" + server.players
          );
        });
      })
      .catch((err) => {
        console.error("Failed to fetch Vintage Story servers:", err);
        global.client.user.setActivity("flamingpalm.com", {
          type: ActivityType.Watching,
        });
        client.channels.fetch(VS_CHANNEL_ID).then((channel) => {
          (channel as BaseGuildTextChannel).setName("🏕️┃vintage-story");
        });
      });
  });
};
