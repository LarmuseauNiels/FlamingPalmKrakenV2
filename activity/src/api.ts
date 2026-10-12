import { getJson, post, postJson } from "./http";

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

/** Raid status codes, as stored in Raids.Status. */
export const RaidStatus = { Open: 1, Scheduling: 2, Scheduled: 3, Cancelled: 4 } as const;

export interface RaidSummary {
  id: number;
  title: string;
  minPlayers: number;
  status: number;
  attendeeCount: number;
  attending: boolean;
}

export interface RaidAttendee {
  id: string;
  name: string;
  /** Discord avatar hash, null for the default avatar. */
  avatar: string | null;
}

export interface RaidOption {
  id: number;
  /** ISO timestamp. */
  time: string;
  /** The slot the raid was locked in on. */
  selected: boolean;
  voters: string[];
}

export interface RaidBoard {
  id: number;
  title: string;
  minPlayers: number;
  status: number;
  maxOptions: number;
  attending: boolean;
  attendees: RaidAttendee[];
  options: RaidOption[];
}

/** GET /members/raids — open and scheduling raids. */
export function getRaids(token: string): Promise<RaidSummary[]> {
  return getJson<RaidSummary[]>("/members/raids", token);
}

/** POST /members/raids/:id/join — sign up for an open raid. */
export function joinRaid(token: string, raidId: number): Promise<void> {
  return post(`/members/raids/${raidId}/join`, {}, token);
}

/** GET /members/raids/:id/board — options, voters and attendees. */
export function getRaidBoard(token: string, raidId: number): Promise<RaidBoard> {
  return getJson<RaidBoard>(`/members/raids/${raidId}/board`, token);
}

/** POST /members/raids/:id/availability — mark yourself in or out of one slot. */
export function setAvailability(
  token: string,
  raidId: number,
  optionId: number,
  available: boolean
): Promise<void> {
  return post(`/members/raids/${raidId}/availability`, { optionId, available }, token);
}

/** POST /members/raids/:id/options — suggest a new slot (you're counted in on it). */
export function suggestTime(token: string, raidId: number, time: Date): Promise<{ id: number }> {
  return postJson<{ id: number }>(`/members/raids/${raidId}/options`, { time: time.toISOString() }, token);
}
