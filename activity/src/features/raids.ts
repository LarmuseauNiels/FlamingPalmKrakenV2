import type { Session } from "../auth";
import {
  getRaidBoard,
  getRaids,
  joinRaid,
  RaidStatus,
  setAvailability,
  suggestTime,
  type RaidAttendee,
  type RaidBoard,
  type RaidOption,
  type RaidSummary,
} from "../api";
import type { Feature } from "../shell";
import { describe, renderError, renderStatus, toast } from "../ui";

/** How often an open board re-reads votes, so everyone sees each other live. */
const POLL_MS = 4000;

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

// ─── Raid list ───────────────────────────────────────────────────────────────

async function showList(view: HTMLElement, session: Session): Promise<void> {
  renderStatus("Loading raids…", view);
  const raids = await getRaids(session.token);

  const toolbar = el("div", "toolbar");
  toolbar.append(el("h2", undefined, "Raids"));

  const scheduling = raids.filter((r) => r.status === RaidStatus.Scheduling);
  const open = raids.filter((r) => r.status === RaidStatus.Open);

  const sections: HTMLElement[] = [toolbar];
  sections.push(
    listSection(
      "Picking a time",
      scheduling,
      "No raids are picking a time right now.",
      (raid) => {
        const button = el("button", undefined, "Open board");
        button.addEventListener("click", () => {
          showBoard(view, session, raid.id).catch((err) => renderError(describe(err), view));
        });
        return button;
      }
    )
  );
  sections.push(
    listSection(
      "Open for sign-ups",
      open,
      "No raids are open. Start one with /create-raid.",
      (raid) => {
        const button = el("button", undefined, raid.attending ? "Joined" : "Join");
        button.disabled = raid.attending;
        button.addEventListener("click", () => {
          button.disabled = true;
          joinRaid(session.token, raid.id)
            .then(() => toast(`You joined ${raid.title}.`))
            .catch((err) => toast(describe(err), "bad"))
            // Joining can push a raid into scheduling, so re-read the list.
            .finally(() => showList(view, session).catch((err) => renderError(describe(err), view)));
        });
        return button;
      }
    )
  );

  view.replaceChildren(...sections);
}

function listSection(
  heading: string,
  raids: RaidSummary[],
  emptyText: string,
  action: (raid: RaidSummary) => HTMLElement
): HTMLElement {
  const section = el("section", "raid-section");
  section.append(el("h3", undefined, heading));

  if (raids.length === 0) {
    section.append(el("p", "muted", emptyText));
    return section;
  }

  for (const raid of raids) {
    const row = el("article", "raid-row");
    const text = el("div", "raid-text");
    const title = el("span", "raid-title", raid.title);
    if (raid.attending) title.append(el("span", "pill", "you're in"));

    const meta =
      raid.status === RaidStatus.Open
        ? `${raid.attendeeCount}/${raid.minPlayers} signed up`
        : `${raid.attendeeCount} signed up · needs ${raid.minPlayers} on one time`;
    text.append(title, el("span", "muted", meta));

    row.append(text, action(raid));
    section.append(row);
  }
  return section;
}

// ─── Scheduling board ────────────────────────────────────────────────────────

const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const fullFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" });

async function showBoard(view: HTMLElement, session: Session, raidId: number): Promise<void> {
  renderStatus("Loading the board…", view);
  let board: RaidBoard = await getRaidBoard(session.token, raidId);
  let lastJson = JSON.stringify(board);

  /** Votes this viewer just clicked, shown before the server confirms them. */
  const pending = new Map<number, boolean>();

  const toolbar = el("div", "toolbar");
  const back = el("button", "ghost", "← Raids");
  back.addEventListener("click", () => {
    showList(view, session).catch((err) => renderError(describe(err), view));
  });
  const title = el("h2");
  toolbar.append(back, title);

  const summary = el("p", "board-summary");
  const people = el("div", "people");
  const grid = el("div", "board-grid");

  // Built once and only shown/hidden by draw(), so a poll never wipes a time
  // the viewer is halfway through typing.
  const form = el("form", "suggest");
  const input = el("input");
  input.type = "datetime-local";
  input.required = true;
  const submit = el("button", undefined, "Suggest time");
  submit.type = "submit";
  form.append(el("label", undefined, "Can't make any of these?"), input, submit);

  view.replaceChildren(toolbar, summary, people, grid, form);

  const isIn = (option: RaidOption): boolean =>
    pending.get(option.id) ?? option.voters.includes(session.userId);

  const votersOf = (option: RaidOption): string[] => {
    const others = option.voters.filter((id) => id !== session.userId);
    return isIn(option) ? [...others, session.userId] : others;
  };

  const draw = (): void => {
    const canVote = board.attending && board.status === RaidStatus.Scheduling;
    const names = new Map(board.attendees.map((a) => [a.id, a]));

    title.textContent = board.title;
    summary.textContent = describeBoard(board);

    // Who's signed up — dimmed until they've marked at least one time, so it's
    // obvious whose answer the raid is still waiting on.
    const voted = new Set(board.options.flatMap(votersOf));
    people.replaceChildren(
      ...board.attendees.map((a) => {
        const chip = el("span", voted.has(a.id) ? "person" : "person waiting");
        chip.title = voted.has(a.id) ? a.name : `${a.name} hasn't picked any times yet`;
        chip.append(avatar(a), el("span", undefined, a.id === session.userId ? "You" : a.name));
        return chip;
      })
    );

    // One column per day, in the viewer's own timezone.
    const days = new Map<string, RaidOption[]>();
    for (const option of board.options) {
      const key = dayFormat.format(new Date(option.time));
      days.set(key, [...(days.get(key) ?? []), option]);
    }

    if (days.size === 0) {
      grid.replaceChildren(el("p", "muted", "No times yet — suggest one below."));
    } else {
      const now = Date.now();
      grid.replaceChildren(
        ...[...days].map(([day, options]) => {
          const column = el("div", "day");
          column.append(el("h4", undefined, day));
          for (const option of options) {
            column.append(slot(option, now, canVote, names));
          }
          return column;
        })
      );
    }

    form.hidden = !canVote;
    const full = board.options.length >= board.maxOptions;
    submit.disabled = full;
    submit.title = full ? `This raid already has ${board.maxOptions} times` : "";
    input.min = toLocalInputValue(new Date());
  };

  const slot = (
    option: RaidOption,
    now: number,
    canVote: boolean,
    names: Map<string, RaidAttendee>
  ): HTMLElement => {
    const voters = votersOf(option);
    const mine = isIn(option);
    const past = new Date(option.time).getTime() <= now;

    const button = el("button", "slot");
    button.classList.toggle("mine", mine);
    button.classList.toggle("locked", option.selected);
    button.classList.toggle("past", past && !option.selected);
    button.disabled = !canVote || past || pending.has(option.id);
    button.setAttribute("aria-pressed", String(mine));
    button.style.setProperty("--heat", String(Math.min(voters.length / board.minPlayers, 1)));
    button.title = voters.length
      ? voters.map((id) => names.get(id)?.name ?? "Unknown").join(", ")
      : "Nobody yet";

    const head = el("span", "slot-head");
    head.append(
      el("span", "slot-time", timeFormat.format(new Date(option.time))),
      el("span", "slot-count", option.selected ? "✓ locked in" : `${voters.length}/${board.minPlayers}`)
    );

    const faces = el("span", "faces");
    for (const id of voters.slice(0, 6)) {
      const who = names.get(id);
      if (who) faces.append(avatar(who));
    }
    if (voters.length > 6) faces.append(el("span", "more", `+${voters.length - 6}`));

    button.append(head, faces);
    button.addEventListener("click", () => toggle(option));
    return button;
  };

  const refresh = async (): Promise<void> => {
    const next = await getRaidBoard(session.token, raidId);
    const json = JSON.stringify(next);
    if (json === lastJson) return;
    lastJson = json;
    board = next;
    draw();
  };

  const toggle = (option: RaidOption): void => {
    const want = !isIn(option);
    pending.set(option.id, want);
    draw();
    setAvailability(session.token, raidId, option.id, want)
      .catch((err) => toast(describe(err), "bad"))
      .finally(() => {
        pending.delete(option.id);
        lastJson = "";
        refresh().catch((err) => console.error("Board refresh failed", err));
      });
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    // datetime-local has no zone: new Date() reads it as the viewer's local time.
    const time = new Date(input.value);
    if (isNaN(time.getTime()) || time.getTime() <= Date.now()) {
      toast("Pick a time in the future.", "bad");
      return;
    }
    submit.disabled = true;
    suggestTime(session.token, raidId, time)
      .then(() => {
        toast(`Added ${fullFormat.format(time)} — you're counted in.`);
        input.value = "";
      })
      .catch((err) => toast(describe(err), "bad"))
      .finally(() => {
        submit.disabled = false;
        lastJson = "";
        refresh().catch((err) => console.error("Board refresh failed", err));
      });
  });

  draw();

  // Live updates: poll while this board is on screen. The shell swaps in a new
  // element on tab change and showList() replaces our children, so once the
  // toolbar is detached this board is gone and the timer stops itself.
  const timer = setInterval(() => {
    if (!toolbar.isConnected) {
      clearInterval(timer);
      return;
    }
    if (document.hidden || pending.size > 0) return;
    refresh().catch((err) => console.error("Board refresh failed", err));
  }, POLL_MS);
}

function describeBoard(board: RaidBoard): string {
  switch (board.status) {
    case RaidStatus.Open:
      return `Still collecting sign-ups (${board.attendees.length}/${board.minPlayers}). The board opens once enough people join.`;
    case RaidStatus.Scheduled: {
      const locked = board.options.find((o) => o.selected);
      return locked
        ? `Locked in for ${fullFormat.format(new Date(locked.time))}. See you there!`
        : "This raid has been scheduled.";
    }
    case RaidStatus.Cancelled:
      return "No time worked for enough people, so this raid was cancelled.";
    default:
      return board.attending
        ? `Tap every time you can make. The first time ${board.minPlayers} people are in on gets locked in automatically.`
        : `You're not signed up for this raid, so you can watch but not vote. It locks in once ${board.minPlayers} people agree on a time.`;
  }
}

function avatar(person: RaidAttendee): HTMLElement {
  const initial = el("span", "avatar", (person.name.trim()[0] ?? "?").toUpperCase());
  if (!person.avatar) return initial;

  const img = el("img", "avatar");
  img.src = `https://cdn.discordapp.com/avatars/${person.id}/${person.avatar}.png?size=64`;
  img.alt = "";
  img.loading = "lazy";
  // The Discord proxy may block the CDN; fall back to the initial.
  img.addEventListener("error", () => img.replaceWith(initial));
  return img;
}

/** "YYYY-MM-DDTHH:mm" in local time, the format datetime-local expects. */
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const raids: Feature = {
  id: "raids",
  label: "Raids",
  icon: "⚔️",
  mount(view, session) {
    return showList(view, session);
  },
};
