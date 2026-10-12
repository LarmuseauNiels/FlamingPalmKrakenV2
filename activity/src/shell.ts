import type { Session } from "./auth";
import { describe, renderError, renderStatus } from "./ui";

/**
 * One tab in the Activity. Each feature owns everything below the tab bar:
 * `mount` gets a fresh, empty element every time the tab is opened, so a
 * feature never has to clean up after itself — if the user switches away
 * mid-load, the late render lands in a detached element and is simply dropped.
 */
export interface Feature {
  id: string;
  label: string;
  icon: string;
  /** Shown in the menu but not openable yet. */
  comingSoon?: boolean;
  mount(view: HTMLElement, session: Session): void | Promise<void>;
}

const app = document.getElementById("app")!;

export function renderShell(session: Session, features: Feature[]): void {
  app.replaceChildren();

  const header = document.createElement("header");
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = session.username;
  header.append(who);

  const nav = document.createElement("nav");
  nav.className = "tabs";
  nav.setAttribute("role", "tablist");

  const main = document.createElement("main");
  const tabs = new Map<string, HTMLButtonElement>();

  const open = (feature: Feature): void => {
    for (const [id, tab] of tabs) {
      const active = id === feature.id;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    }

    const view = document.createElement("section");
    main.replaceChildren(view);

    Promise.resolve()
      .then(() => feature.mount(view, session))
      .catch((err) => {
        console.error(`Feature "${feature.id}" failed to load`, err);
        renderError(describe(err), view);
      });
  };

  for (const feature of features) {
    const tab = document.createElement("button");
    tab.className = "tab";
    tab.setAttribute("role", "tab");
    tab.textContent = `${feature.icon} ${feature.label}`;

    if (feature.comingSoon) {
      tab.disabled = true;
      tab.title = "Coming soon";
      const badge = document.createElement("span");
      badge.className = "soon";
      badge.textContent = "soon";
      tab.append(badge);
    } else {
      tab.addEventListener("click", () => open(feature));
    }

    tabs.set(feature.id, tab);
    nav.append(tab);
  }

  app.append(header, nav, main);

  const first = features.find((f) => !f.comingSoon);
  if (first) open(first);
  else renderStatus("Nothing to show yet.", main);
}
