import axios from "axios";
import WebSocket from "ws";
import { createLogger } from "../utils/logger";

const log = createLogger("ValheimPlayerLog");

// Valheim's Steam query (A2S) returns a correct player count but blank player
// names, so the names are read from the server console instead. Relevant lines:
//   "Got character ZDOID from Niels : -123456:1"  → Niels spawned (join / respawn)
//   "Got character ZDOID from Niels : 0:0"        → Niels died
//   "... Steam_76561198000000000 ..."             → platform ID, logged just before the ZDOID line
//   "Closing socket 76561198000000000"            → that player left
//   "Load world: <name>"                          → server (re)started, nobody online
const ZDOID_RE = /Got character ZDOID from (.+?) : (-?\d+):(-?\d+)/;
const STEAM_ID_RE = /\b(?:Steam_)?(7656119\d{10})\b/;
const LEAVE_RE = /clos|disconnect|dispos/i;
const WORLD_LOAD_RE = /Load world:/;
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

/**
 * Tracks who is online on a Valheim server from its console output. Leave
 * lines are matched by Steam ID, which isn't always available (crossplay), so
 * callers should check `namesFor(count)` against the authoritative A2S count.
 */
export class ValheimPlayerTracker {
  private online = new Map<string, string | null>(); // name → Steam ID (if known)
  private pendingId: string | null = null;

  feed(rawLine: string): void {
    const line = rawLine.replace(ANSI_RE, "").trim();
    if (!line) return;

    if (WORLD_LOAD_RE.test(line)) {
      this.reset();
      return;
    }

    const zdoid = line.match(ZDOID_RE);
    if (zdoid) {
      const [, name, id] = zdoid;
      if (id === "0") return; // death, the player is still online
      if (!this.online.has(name) || this.pendingId) {
        this.online.set(name, this.pendingId ?? this.online.get(name) ?? null);
      }
      this.pendingId = null;
      return;
    }

    const steamId = line.match(STEAM_ID_RE)?.[1];
    if (!steamId) return;

    if (LEAVE_RE.test(line)) {
      for (const [name, id] of Array.from(this.online)) {
        if (id === steamId) this.online.delete(name);
      }
      if (this.pendingId === steamId) this.pendingId = null;
    } else {
      this.pendingId = steamId;
    }
  }

  reset(): void {
    this.online.clear();
    this.pendingId = null;
  }

  /**
   * Names of the online players, or null when the log-tracked list doesn't
   * match the server-reported count (a missed leave line, or a bot restart
   * that only replayed part of the log).
   */
  namesFor(count: number): string[] | null {
    if (count === 0) this.reset();
    return this.online.size === count ? Array.from(this.online.keys()) : null;
  }
}

/**
 * Streams a Pelican server's console over the Wings websocket and feeds every
 * line into the tracker. Reconnects on its own; resets the tracker whenever the
 * server leaves the running state.
 */
export function watchServerConsole(
  baseUrl: string,
  apiKey: string,
  identifier: string,
  tracker: ValheimPlayerTracker
): void {
  async function fetchCredentials(): Promise<{ token: string; socket: string }> {
    const res = await axios.get(`${baseUrl}/api/client/servers/${identifier}/websocket`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      timeout: 10000,
    });
    return res.data.data;
  }

  async function reauth(ws: WebSocket): Promise<void> {
    try {
      const { token } = await fetchCredentials();
      ws.send(JSON.stringify({ event: "auth", args: [token] }));
    } catch (err: any) {
      log.error(`Failed to refresh console token for ${identifier}:`, err.message || err);
      ws.close();
    }
  }

  async function connect(): Promise<void> {
    let creds: { token: string; socket: string };
    try {
      creds = await fetchCredentials();
    } catch (err: any) {
      log.error(`Failed to get console websocket for ${identifier}:`, err.message || err);
      setTimeout(connect, 60_000);
      return;
    }

    // Wings only accepts connections whose Origin is the panel URL
    const ws = new WebSocket(creds.socket, { origin: baseUrl });

    ws.on("open", () => {
      ws.send(JSON.stringify({ event: "auth", args: [creds.token] }));
    });

    ws.on("message", (data) => {
      let msg: { event: string; args?: string[] };
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      switch (msg.event) {
        case "auth success":
          log.info(`Watching console of ${identifier}`);
          // Replays recent output so a bot restart recovers who is online
          ws.send(JSON.stringify({ event: "send logs", args: [null] }));
          break;
        case "console output":
          tracker.feed(msg.args?.[0] ?? "");
          break;
        case "status":
          if (msg.args?.[0] !== "running") tracker.reset();
          break;
        case "token expiring":
          reauth(ws);
          break;
        case "token expired":
        case "jwt error":
          ws.close();
          break;
      }
    });

    ws.on("close", () => {
      log.warn(`Console websocket for ${identifier} closed, reconnecting in 30s`);
      setTimeout(connect, 30_000);
    });

    ws.on("error", (err) => {
      log.error(`Console websocket error for ${identifier}:`, err.message);
    });
  }

  connect();
}
