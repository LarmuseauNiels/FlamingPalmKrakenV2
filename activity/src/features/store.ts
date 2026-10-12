import type { Session } from "../auth";
import { getPoints, getShopItems, redeemItem, type ShopItem } from "../api";
import { apiUrl } from "../http";
import type { Feature } from "../shell";
import { describe, renderStatus, toast } from "../ui";

type RedeemHandler = (item: ShopItem, button: HTMLButtonElement) => void;

async function loadShop(view: HTMLElement, session: Session): Promise<void> {
  const [points, items] = await Promise.all([
    getPoints(session.token),
    getShopItems(session.token),
  ]);

  renderShop(view, points, items, (item, button) => {
    handleRedeem(view, session, item, button).catch((err) => {
      toast(describe(err), "bad");
    });
  });
}

async function handleRedeem(
  view: HTMLElement,
  session: Session,
  item: ShopItem,
  button: HTMLButtonElement
): Promise<void> {
  button.disabled = true;
  button.textContent = "Redeeming…";

  try {
    const redemption = await redeemItem(session.token, item.id);
    toast(
      redemption.RedemptionText
        ? `${item.title}: ${redemption.RedemptionText}`
        : `Redeemed ${item.title} — check your library on the website.`
    );
  } finally {
    // Stock and balance both moved (or the attempt failed and we want the real
    // numbers back), so re-read rather than patching state locally. Swallow any
    // refresh failure here so it can't mask the redemption error.
    await loadShop(view, session).catch((err) =>
      console.error("Failed to refresh the store", err)
    );
  }
}

function renderShop(
  view: HTMLElement,
  points: number,
  items: ShopItem[],
  onRedeem: RedeemHandler
): void {
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";

  const title = document.createElement("h2");
  title.textContent = "Store";

  const balance = document.createElement("span");
  balance.className = "balance";
  balance.textContent = `${points} 🌴`;

  toolbar.append(title, balance);

  const grid = document.createElement("div");
  grid.className = "grid";

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "status";
    empty.textContent = "The store is empty right now.";
    grid.append(empty);
  }

  for (const item of items) {
    grid.append(renderCard(item, points, onRedeem));
  }

  view.replaceChildren(toolbar, grid);
}

function renderCard(item: ShopItem, points: number, onRedeem: RedeemHandler): HTMLElement {
  const card = document.createElement("article");
  card.className = "card";

  if (item.image) {
    const img = document.createElement("img");
    // Reward art lives on arbitrary hosts the Activity's CSP blocks, so the
    // API fetches it for us by reward ID. Still drop a dead link rather than
    // showing a torn-page icon.
    img.src = apiUrl(`/api/activity/images/reward/${item.id}`);
    img.alt = "";
    img.loading = "lazy";
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

export const store: Feature = {
  id: "store",
  label: "Store",
  icon: "🛒",
  async mount(view, session) {
    renderStatus("Loading the store…", view);
    await loadShop(view, session);
  },
};
