import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "net";
import { shopEndPoints } from "../modules/ApiFunctions/ShopEndPoints";

process.env.JWT_SECRET = "test-secret";
const token = jwt.sign({ id: "member-1", username: "Member" }, "test-secret", { expiresIn: "1h" });

/** A minimal in-memory stand-in for the Prisma calls redeemItem makes. */
function fakeDb(state: { keys: { id: number; redeemedBy: string }[]; balance: number; price: number }) {
  let sent = 0;
  const rewardItem = {
    findFirst: async () => {
      const key = state.keys.find((k) => k.redeemedBy === "");
      return key ? { RewardItemID: key.id, Reward: { Price: state.price, Title: "Game" } } : null;
    },
    updateMany: async ({ where, data }: any) => {
      const key = state.keys.find((k) => k.id === where.RewardItemID && k.redeemedBy === where.RedeemedBy);
      if (!key) return { count: 0 };
      key.redeemedBy = data.RedeemedBy;
      return { count: 1 };
    },
    findUniqueOrThrow: async ({ where }: any) => ({ RewardItemID: where.RewardItemID, RedemptionText: "KEY-123" }),
  };
  const points = {
    findUnique: async () => ({ TotalPoints: state.balance, Blocked: false }),
    updateMany: async ({ where, data }: any) => {
      if (state.balance < where.TotalPoints.gte) return { count: 0 };
      state.balance -= data.TotalPoints.decrement;
      return { count: 1 };
    },
  };
  (global as any).client = {
    prisma: {
      // Snapshot + restore models a rollback when the callback throws.
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        const snapshot = JSON.stringify(state);
        try {
          return await fn({ rewardItem, points });
        } catch (err) {
          Object.assign(state, JSON.parse(snapshot));
          throw err;
        }
      },
    },
    channels: { cache: { get: () => ({ send: async () => void sent++ }) } },
  };
  return { sentCount: () => sent };
}

async function redeem(): Promise<{ status: number; body: string }> {
  const app = express();
  app.use(express.json());
  shopEndPoints(app);
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/members/redeemItem`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ rewardId: 3 }),
      signal: AbortSignal.timeout(2000),
    });
    return { status: res.status, body: await res.text() };
  } finally {
    server.close();
  }
}

let state: { keys: { id: number; redeemedBy: string }[]; balance: number; price: number };
beforeEach(() => {
  state = { keys: [{ id: 12, redeemedBy: "" }], balance: 100, price: 40 };
});

test("a purchase claims the key, charges once and announces it", async () => {
  const db = fakeDb(state);
  const res = await redeem();
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).RedemptionText, "KEY-123");
  assert.equal(state.balance, 60);
  assert.equal(state.keys[0].redeemedBy, "member-1");
  await new Promise((r) => setImmediate(r));
  assert.equal(db.sentCount(), 1);
});

test("not enough points is a 400 and changes nothing", async () => {
  state.balance = 10;
  fakeDb(state);
  const res = await redeem();
  assert.equal(res.status, 400);
  assert.equal(res.body, "Not enough points");
  assert.equal(state.keys[0].redeemedBy, "");
});

test("losing the race for a key is a 400, and the member is not charged", async () => {
  fakeDb(state);
  // Another request claims the key between the read and the conditional write.
  const client = (global as any).client;
  const original = client.prisma.$transaction;
  client.prisma.$transaction = (fn: any) =>
    original(async (tx: any) => {
      const findFirst = tx.rewardItem.findFirst;
      tx.rewardItem.findFirst = async () => {
        const found = await findFirst();
        state.keys[0].redeemedBy = "someone-else";
        return found;
      };
      return fn(tx);
    });
  const res = await redeem();
  assert.equal(res.status, 400);
  assert.match(res.body, /just taken/);
  assert.equal(state.balance, 100);
});

test("a failing Discord notification does not fail a completed purchase", async () => {
  fakeDb(state);
  (global as any).client.channels.cache.get = () => undefined; // channel not cached
  const res = await redeem();
  assert.equal(res.status, 200);
  assert.equal(state.balance, 60);
});
