import type { ShopItem } from "./api";

const app = document.getElementById("app")!;

export type RedeemHandler = (item: ShopItem, button: HTMLButtonElement) => void;

export interface ShopView {
  username: string;
  points: number;
  items: ShopItem[];
}

function clear(): void {
  app.replaceChildren();
}

export function renderStatus(message: string): void {
  clear();
  const p = document.createElement("p");
  p.className = "status";
  p.textContent = message;
  app.append(p);
}

export function renderError(message: string): void {
  clear();
  const box = document.createElement("div");
  box.className = "error";

  const title = document.createElement("h2");
  title.textContent = "Something went wrong";

  const detail = document.createElement("p");
  detail.textContent = message;

  box.append(title, detail);
  app.append(box);
}

export function renderShop(view: ShopView, onRedeem: RedeemHandler): void {
  clear();

  const header = document.createElement("header");
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = view.username;

  const balance = document.createElement("span");
  balance.className = "balance";
  balance.textContent = `${view.points} 🌴`;

  header.append(who, balance);

  const grid = document.createElement("div");
  grid.className = "grid";

  if (view.items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "status";
    empty.textContent = "The store is empty right now.";
    grid.append(empty);
  }

  for (const item of view.items) {
    grid.append(renderCard(item, view.points, onRedeem));
  }

  app.append(header, grid);
}

function renderCard(item: ShopItem, points: number, onRedeem: RedeemHandler): HTMLElement {
  const card = document.createElement("article");
  card.className = "card";

  if (item.image) {
    const img = document.createElement("img");
    img.src = item.image;
    img.alt = "";
    img.loading = "lazy";
    // Reward art is hosted outside Discord, so it needs a URL mapping in the
    // developer portal. Until that's in place the proxy blocks it — drop the
    // broken image rather than showing a torn-page icon.
    img.addEventListener("error", () => img.remove());
    card.append(img);
  }

  const title = document.createElement("h3");
  title.textContent = item.title;

  const description = document.createElement("p");
  description.className = "description";
  description.textContent = item.description ?? "";

  const footer = document.createElement("div");
  footer.className = "card-footer";

  const price = document.createElement("span");
  price.className = "price";
  if (item.nonSalePrice && item.nonSalePrice > item.price) {
    const was = document.createElement("s");
    was.textContent = String(item.nonSalePrice);
    price.append(was, document.createTextNode(` ${item.price} 🌴`));
  } else {
    price.textContent = `${item.price} 🌴`;
  }

  const button = document.createElement("button");
  const outOfStock = item.stock === 0;
  const tooExpensive = item.price > points;

  button.textContent = outOfStock
    ? "Out of stock"
    : tooExpensive
      ? "Not enough points"
      : "Redeem";
  button.disabled = outOfStock || tooExpensive;
  button.addEventListener("click", () => onRedeem(item, button));

  footer.append(price, button);
  card.append(title, description, footer);
  return card;
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
