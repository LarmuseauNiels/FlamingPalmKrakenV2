/** Kraken AI tools for the Pelican-managed game servers. */
import { createLogger } from "../../utils/logger";
import { checkMemberHasAnyRole } from "./toolHelpers";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PelicanStatusMonitor: any = require("../../modules/PelicanStatusMonitor.js");

const log = createLogger("OllamaAI");

export async function getGameServerStatusString(): Promise<string> {
  try {
    return await PelicanStatusMonitor.getServerStatuses();
  } catch (err: any) {
    log.error("Failed to fetch game server status:", err);
    return "Failed to fetch game server status. Please try again later.";
  }
}

export async function startGameServerString(rawArgs: string | object, authorId: string): Promise<string> {
  let args: any;
  try {
    args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
  } catch {
    return "Invalid arguments for startGameServer.";
  }
  const serverName = args?.serverName;
  if (!serverName || typeof serverName !== "string") {
    return "Please provide the name of the game server to start.";
  }

  // Server managers may also start servers
  const roleIds = [process.env.PELICAN_START_ROLE_ID, process.env.PELICAN_MANAGE_ROLE_ID].filter(Boolean) as string[];
  if (roleIds.length === 0) {
    return "Starting game servers through Kraken is not enabled.";
  }

  const denied = await checkMemberHasAnyRole(authorId, roleIds, "start game servers");
  if (denied) return denied;

  const result = await PelicanStatusMonitor.powerServer(serverName, "start");
  log.info(`User ${authorId} asked to start game server "${serverName}": ${result}`);
  return result;
}

export async function manageGameServerString(rawArgs: string | object, authorId: string): Promise<string> {
  let args: any;
  try {
    args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
  } catch {
    return "Invalid arguments for manageGameServer.";
  }
  const serverName = args?.serverName;
  const action = args?.action;
  if (!serverName || typeof serverName !== "string") {
    return "Please provide the name of the game server.";
  }
  if (action !== "restart" && action !== "stop") {
    return 'The action must be either "restart" or "stop".';
  }

  const roleId = process.env.PELICAN_MANAGE_ROLE_ID;
  if (!roleId) {
    return "Restarting or stopping game servers through Kraken is not enabled.";
  }

  const denied = await checkMemberHasAnyRole(authorId, [roleId], "restart or stop game servers");
  if (denied) return denied;

  const result = await PelicanStatusMonitor.powerServer(serverName, action);
  log.info(`User ${authorId} asked to ${action} game server "${serverName}": ${result}`);
  return result;
}
