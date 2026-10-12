import type { Session } from "../auth";
import { getServers, powerServer, type GameServer, type GameServerList, type PowerSignal } from "../api";
import type { Feature } from "../shell";
import { describe, renderStatus, toast } from "../ui";

/** Matches the API's snapshot cache; polling faster would just re-read it. */
const POLL_MS = 10000;
/** How long a Stop/Restart button waits for its confirming second click. */
const CONFIRM_MS = 4000;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const STATE_LABELS: Record<string, string> = {
  running: "Online",
  starting: "Starting…",
  stopping: "Stopping…",
  offline: "Offline",
  missing: "Machine offline",
  unknown: "Status unavailable",
};

function stateOf(server: GameServer): string {
  return server.suspended ? "suspended" : server.state;
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

function formatUptime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

async function showServers(view: HTMLElement, session: Session): Promise<void> {
  renderStatus("Checking the servers…", view);
  let data: GameServerList = await getServers(session.token);
  let lastJson = JSON.stringify(data);

  /** Servers with a power request in flight, so a poll can't re-enable buttons mid-request. */
  const busy = new Set<string>();

  const toolbar = el("div", "toolbar");
  toolbar.append(el("h2", undefined, "Servers"));
  const list = el("div", "server-list");
  view.replaceChildren(toolbar, list);

  const draw = (): void => {
    if (data.servers.length === 0) {
      list.replaceChildren(el("p", "status", "No game servers found."));
      return;
    }
    // Running servers first, then alphabetical.
    const sorted = [...data.servers].sort(
      (a, b) =>
        Number(stateOf(b) === "running") - Number(stateOf(a) === "running") ||
        a.name.localeCompare(b.name)
    );
    list.replaceChildren(...sorted.map(card));
  };

  const card = (server: GameServer): HTMLElement => {
    const state = stateOf(server);
    const running = state === "running";

    const article = el("article", `server state-${state}`);

    const head = el("div", "server-head");
    const name = el("h3", undefined, server.name);
    const badge = el("span", "server-state", state === "suspended" ? "Suspended" : STATE_LABELS[state] ?? state);
    head.append(name, badge);
    article.append(head);

    if (server.address) {
      const address = el("button", "server-address", server.address);
      address.type = "button";
      address.title = "Copy address";
      address.addEventListener("click", () => copy(server.address!));
      article.append(address);
    }

    if (running) {
      const facts = el("div", "server-facts");
      facts.append(fact("Uptime", formatUptime(server.uptimeMs)));
      if (server.tracksPlayers) {
        const p = server.players;
        facts.append(fact("Players", p ? (p.max > 0 ? `${p.online}/${p.max}` : String(p.online)) : "Unknown"));
      }
      facts.append(fact("CPU", `${server.cpuPercent.toFixed(0)}%`));
      article.append(facts);

      if (server.players?.names.length) {
        article.append(el("p", "server-players", `🟢 ${server.players.names.join(", ")}`));
      }

      article.append(
        meter("RAM", server.memoryBytes, server.memoryLimitMb),
        meter("Disk", server.diskBytes, server.diskLimitMb)
      );
    }

    article.append(
      el(
        "p",
        "muted",
        server.lastBackup
          ? `Last backup ${server.lastBackup.age} · ${server.lastBackup.size}`
          : "No backups found"
      )
    );

    const actions = powerButtons(server, state);
    if (actions) article.append(actions);
    return article;
  };

  const powerButtons = (server: GameServer, state: string): HTMLElement | null => {
    if (!data.canStart && !data.canManage) return null;

    const row = el("div", "server-actions");
    const add = (signal: PowerSignal, label: string, enabled: boolean, className = "") => {
      const button = el("button", className, label);
      button.disabled = !enabled || busy.has(server.id);
      button.addEventListener("click", () => {
        // Start is harmless; Restart/Stop kick players, so ask for a second click.
        if (signal !== "start" && button.dataset.armed !== "1") {
          button.dataset.armed = "1";
          button.textContent = `Really ${signal}?`;
          setTimeout(() => {
            if (!button.isConnected) return;
            delete button.dataset.armed;
            button.textContent = label;
          }, CONFIRM_MS);
          return;
        }
        sendPower(server, signal);
      });
      row.append(button);
    };

    if (data.canStart) add("start", "▶ Start", state === "offline");
    if (data.canManage) {
      add("restart", "🔄 Restart", state === "running", "secondary");
      add("stop", "⏹ Stop", state === "running" || state === "starting", "danger");
    }
    return row;
  };

  const refresh = async (): Promise<void> => {
    const next = await getServers(session.token);
    const json = JSON.stringify(next);
    if (json === lastJson) return;
    lastJson = json;
    data = next;
    draw();
  };

  const sendPower = (server: GameServer, signal: PowerSignal): void => {
    busy.add(server.id);
    draw();
    powerServer(session.token, server.id, signal)
      .then((result) => toast(result.message))
      .catch((err) => toast(describe(err), "bad"))
      .finally(() => {
        busy.delete(server.id);
        lastJson = "";
        refresh().catch((err) => console.error("Server refresh failed", err));
      });
  };

  draw();

  // Same lifecycle as the raid board: stops once this view is replaced.
  const timer = setInterval(() => {
    if (!toolbar.isConnected) {
      clearInterval(timer);
      return;
    }
    if (document.hidden || busy.size > 0) return;
    refresh().catch((err) => console.error("Server refresh failed", err));
  }, POLL_MS);
}

function fact(label: string, value: string): HTMLElement {
  const node = el("span", "fact");
  node.append(el("span", "muted", label), el("strong", undefined, value));
  return node;
}

function meter(label: string, usedBytes: number, limitMb: number): HTMLElement {
  const row = el("div", "meter");
  const text = el(
    "span",
    "muted",
    limitMb > 0 ? `${label} ${formatBytes(usedBytes)} / ${formatBytes(limitMb * 1024 * 1024)}` : `${label} ${formatBytes(usedBytes)}`
  );
  row.append(text);
  if (limitMb > 0) {
    const bar = el("div", "bar");
    const fill = el("div", "bar-fill");
    const ratio = Math.min(usedBytes / (limitMb * 1024 * 1024), 1);
    fill.style.width = `${(ratio * 100).toFixed(1)}%`;
    fill.classList.toggle("hot", ratio > 0.9);
    bar.append(fill);
    row.append(bar);
  }
  return row;
}

function copy(text: string): void {
  // The clipboard API can be blocked inside Discord's iframe; say so rather
  // than silently doing nothing.
  navigator.clipboard
    ?.writeText(text)
    .then(() => toast(`Copied ${text}`))
    .catch(() => toast(`Couldn't copy — the address is ${text}`, "bad")) ??
    toast(`The address is ${text}`);
}

export const servers: Feature = {
  id: "servers",
  label: "Servers",
  icon: "🖥️",
  mount(view, session) {
    return showServers(view, session);
  },
};
