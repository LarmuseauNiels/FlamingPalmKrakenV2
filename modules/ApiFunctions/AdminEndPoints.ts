import { jsonify, authenticateToken } from "./Helpers";

interface yearOverviewItem {
  date: string;
  activity: number;
}

export function adminEndPoints(app) {
  let apiPrefix = "/admin/";

  app.get(
    apiPrefix + "yearOverview",
    authenticateToken,
    async function (req, res) {
      let results: yearOverviewItem[] = await globalThis.client.prisma
        .$queryRaw`select date(timestamp) as date,count(*) as activity from VoiceConnected  WHERE year(VoiceConnected.TimeStamp) = year(curdate())  group by date(timestamp)`;
      res.send(jsonify(results));
    }
  );
}
