import { PermissionFlagsBits } from "discord.js";
import { authenticateToken, jsonify } from "./Helpers";
import { createLogger } from "../../utils/logger";

const log = createLogger("GameServerEndPoints");
const PelicanStatusMonitor: any = require("../PelicanStatusMonitor.js");

interface PowerAccess {
  start: boolean;
  manage: boolean;
}

/**
 * What the member may do from the Activity: the union of the two existing
 * ways to control servers, so nobody gains power they don't already have —
 *  - status-channel buttons: Manage Messages permission → everything
 *  - AI assistant: PELICAN_START_ROLE_ID → start; PELICAN_MANAGE_ROLE_ID → everything
 */
async function getPowerAccess(userId: string): Promise<PowerAccess> {
  try {
    const guild = await global.client.guilds.fetch(process.env.GUILD_ID!);
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return { start: false, manage: false };

    const has = (roleId?: string) => !!roleId && member.roles.cache.has(roleId);
    const manage =
      member.permissions.has(PermissionFlagsBits.ManageMessages) ||
      has(process.env.PELICAN_MANAGE_ROLE_ID);
    return { start: manage || has(process.env.PELICAN_START_ROLE_ID), manage };
  } catch (err) {
    log.error("Failed to resolve game server permissions for " + userId + ":", err);
    return { start: false, manage: false };
  }
}

/** Game server dashboard behind the Activity's Servers tab. */
export function gameServerEndPoints(app) {
  const apiPrefix = "/members/servers";

  // GET /members/servers — every server's live status + what you may do.
  app.get(apiPrefix, authenticateToken, async function (req, res) {
    try {
      const snapshot = PelicanStatusMonitor.getServerSnapshot();
      if (!snapshot) return res.status(503).send("Game server monitoring is not configured");

      const [servers, access] = await Promise.all([snapshot, getPowerAccess(req.user.id)]);
      res.send(jsonify({ canStart: access.start, canManage: access.manage, servers }));
    } catch (err) {
      log.error("Failed to load game servers:", err);
      res.status(502).send("Couldn't reach the game server panel");
    }
  });

  // POST /members/servers/:id/power — { signal: "start" | "restart" | "stop" }
  app.post(apiPrefix + "/:id/power", authenticateToken, async function (req, res) {
    const signal = req.body?.signal;
    const serverId = req.params.id;

    if (!["start", "restart", "stop"].includes(signal)) {
      return res.status(400).send("Expected { signal: start | restart | stop }");
    }

    try {
      const access = await getPowerAccess(req.user.id);
      const allowed = signal === "start" ? access.start : access.manage;
      if (!allowed) {
        return res.status(403).send(`You don't have permission to ${signal} game servers`);
      }

      const result = await PelicanStatusMonitor.powerServerById(serverId, signal);
      log.info(`${req.user.username} (${req.user.id}) sent "${signal}" to ${serverId} from the Activity: ${result.message}`);
      if (!result.ok) return res.status(409).send(result.message);
      res.send(jsonify({ message: result.message }));
    } catch (err) {
      log.error(`Failed to send "${signal}" to ${serverId}:`, err);
      res.status(502).send(`Failed to ${signal} the server`);
    }
  });
}
