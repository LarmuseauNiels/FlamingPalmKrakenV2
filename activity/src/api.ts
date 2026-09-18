import { getJson, postJson } from "./http";

export interface ShopItem {
  id: number;
  title: string;
  description: string;
  price: number;
  image: string | null;
  stock: number;
  nonSalePrice: number | null;
}

export interface Redemption {
  RewardItemID: number;
  RedemptionText: string | null;
}

/** GET /members/points — returns a bare number, 0 when blocked or unknown. */
export function getPoints(token: string): Promise<number> {
  return getJson<number>("/members/points", token);
}

/** GET /members/shopItems — visible rewards with live stock counts. */
export function getShopItems(token: string): Promise<ShopItem[]> {
  return getJson<ShopItem[]>("/members/shopItems", token);
}

/**
 * POST /members/redeemItem — spends points and claims the next free key.
 * Rejects with an ApiError carrying the API's plain-text reason
 * ("Not enough points", "No items left", …).
 */
export function redeemItem(token: string, rewardId: number): Promise<Redemption> {
  return postJson<Redemption>("/members/redeemItem", { rewardId }, token);
}
