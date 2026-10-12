import type { Session } from "../auth";
import { getPoints, getShopItems, redeemItem, type ShopItem } from "../api";
import { apiUrl } from "../http";
import type { Feature } from "../shell";
import { describe, renderStatus, toast } from "../ui";

type RedeemHandler = (item: ShopItem, button: HTMLButtonElement) => void;

/** Search and sort, matching the website's store page. */
interface Filters {
  query: string;
  sort: "desc" | "asc";
}

/** Title or description contains the query; sorted by price. */
function applyFilters(items: ShopItem[], filters: Filters): ShopItem[] {
  const q = filters.query.trim().toLowerCase();
  const result = q
    ? items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          (item.description ?? "").toLowerCase().includes(q)
      )
    : [...items];
  result.sort((a, b) => (filters.sort === "desc" ? b.price - a.price : a.price - b.price));
  return result;
}

async function loadShop(view: HTMLElement, session: Session, filters: Filters): Promise<void> {
  const [points, items] = await Promise.all([
    getPoints(session.token),
    getShopItems(session.token),
  ]);

  renderShop(view, points, items, filters, (item, button) => {
    handleRedeem(view, session, filters, item, button).catch((err) => {
      toast(describe(err), "bad");
    });
  });
}

async function handleRedeem(
  view: HTMLElement,
  session: Session,
  filters: Filters,
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
    await loadShop(view, session, filters).catch((err) =>
      console.error("Failed to refresh the store", err)
    );
  }
}

function renderShop(
  view: HTMLElement,
  points: number,
  items: ShopItem[],
  filters: Filters,
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

  // Only the grid redraws as you type or re-sort, so the search box keeps focus.
  const drawGrid = (): void => {
    const visible = applyFilters(items, filters);

    if (visible.length === 0) {
      const empty = document.createElement("p");
      empty.className = "status";
      empty.textContent =
        items.length === 0
          ? "The store is empty right now."
          : `No items match "${filters.query.trim()}".`;
      grid.replaceChildren(empty);
      return;
    }

    grid.replaceChildren(...visible.map((item) => renderCard(item, points, onRedeem)));
  };

  view.replaceChildren(toolbar, renderControls(filters, drawGrid), grid);
  drawGrid();
}

function renderControls(filters: Filters, onChange: () => void): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "controls";

  const search = document.createElement("div");
  search.className = "search";

  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "Search items…";
  input.setAttribute("aria-label", "Search store items");
  input.value = filters.query;

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "search-clear";
  clear.textContent = "✕";
  clear.setAttribute("aria-label", "Clear search");
  clear.hidden = !filters.query;

  input.addEventListener("input", () => {
    filters.query = input.value;
    clear.hidden = !input.value;
    onChange();
  });
  clear.addEventListener("click", () => {
    input.value = "";
    filters.query = "";
    clear.hidden = true;
    input.focus();
    onChange();
  });
  search.append(input, clear);

  const sort = document.createElement("div");
  sort.className = "sort";
  sort.setAttribute("role", "group");
  sort.setAttribute("aria-label", "Sort by price");

  const label = document.createElement("span");
  label.className = "muted";
  label.textContent = "Price:";
  sort.append(label);

  const pills: [Filters["sort"], string][] = [
    ["desc", "High → Low"],
    ["asc", "Low → High"],
  ];
  const buttons = pills.map(([order, text]) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "pill-toggle";
    pill.textContent = text;
    pill.addEventListener("click", () => {
      filters.sort = order;
      for (const [i, b] of buttons.entries()) {
        const on = pills[i][0] === order;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
      }
      onChange();
    });
    const on = filters.sort === order;
    pill.classList.toggle("active", on);
    pill.setAttribute("aria-pressed", String(on));
    return pill;
  });
  sort.append(...buttons);

  bar.append(search, sort);
  return bar;
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
    // Lives for this visit to the tab, so a redeem (which reloads the grid)
    // keeps whatever you'd searched and sorted by.
    await loadShop(view, session, { query: "", sort: "desc" });
  },
};
