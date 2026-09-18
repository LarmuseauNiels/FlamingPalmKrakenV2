import "./style.css";
import { connect, type Session } from "./auth";
import { getPoints, getShopItems, redeemItem, type ShopItem } from "./api";
import { ApiError } from "./http";
import { renderError, renderShop, renderStatus, toast } from "./ui";

async function loadShop(session: Session): Promise<void> {
  const [points, items] = await Promise.all([
    getPoints(session.token),
    getShopItems(session.token),
  ]);

  renderShop({ username: session.username, points, items }, (item, button) => {
    handleRedeem(session, item, button).catch((err) => {
      toast(describe(err), "bad");
    });
  });
}

async function handleRedeem(
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
    await loadShop(session).catch((err) =>
      console.error("Failed to refresh the store", err)
    );
  }
}

function describe(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unexpected error";
}

async function boot(): Promise<void> {
  try {
    renderStatus("Connecting to Discord…");
    const session = await connect();

    renderStatus("Loading the store…");
    await loadShop(session);
  } catch (err) {
    console.error("Activity failed to start", err);
    renderError(describe(err));
  }
}

boot();
