import { jsonify, authenticateToken } from "./Helpers";

export function adminEndPoints(app) {
  let apiPrefix = "/admin/";

  app.get(
    apiPrefix + "yearOverview",
    authenticateToken,
    async function (req, res) {
      let results = await globalThis.client.prisma
        .$queryRaw`select timestamp,count(*) as online from VoiceConnected  WHERE VoiceConnected.TimeStamp >= curdate() - INTERVAL DAYOFWEEK(curdate())+6 DAY  group by timestamp`;
      res.send(jsonify(results));
    }
  );
}
