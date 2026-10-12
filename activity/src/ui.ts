import { ApiError } from "./http";

const app = document.getElementById("app")!;

export function renderStatus(message: string, target: HTMLElement = app): void {
  const p = document.createElement("p");
  p.className = "status";
  p.textContent = message;
  target.replaceChildren(p);
}

export function renderError(message: string, target: HTMLElement = app): void {
  const box = document.createElement("div");
  box.className = "error";

  const title = document.createElement("h2");
  title.textContent = "Something went wrong";

  const detail = document.createElement("p");
  detail.textContent = message;

  box.append(title, detail);
  target.replaceChildren(box);
}

export function describe(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unexpected error";
}

/** Transient message pinned to the bottom of the frame. */
export function toast(message: string, kind: "ok" | "bad" = "ok"): void {
  document.querySelector(".toast")?.remove();

  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  document.body.append(el);

  setTimeout(() => el.remove(), 6000);
}
