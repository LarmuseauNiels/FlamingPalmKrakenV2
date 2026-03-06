// All external modules must be mocked before the module under test is imported
jest.mock("discord.js", () => ({ TextChannel: jest.fn() }));
jest.mock("../utils/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));
jest.mock("../modules/ApiFunctions/Helpers", () => ({
  authenticateToken: (_req: any, _res: any, next: any) => next(),
  jsonify: (obj: any) => JSON.stringify(obj),
}));

import { shopEndPoints } from "../modules/ApiFunctions/ShopEndPoints";

/** Flush all pending Promise microtasks (handles .then()/.catch() chains). */
const flushPromises = () => new Promise<void>(resolve => setImmediate(resolve));

// ---------------------------------------------------------------------------
// Helpers: thin mock Express app that captures registered route handlers
// ---------------------------------------------------------------------------

type Handler = (req: any, res: any, next?: any) => any;

function makeMockApp() {
  const routes: Record<string, Handler[]> = {};
  return {
    get: (path: string, ...handlers: Handler[]) => { routes[`GET:${path}`] = handlers; },
    post: (path: string, ...handlers: Handler[]) => { routes[`POST:${path}`] = handlers; },
    /** Call the last handler for a route (the business logic, after middleware). */
    invoke(method: "GET" | "POST", path: string, req: any, res: any) {
      const key = `${method}:${path}`;
      const handlers = routes[key];
      if (!handlers) throw new Error(`No handler registered for ${key}`);
      // invoke the final (non-auth-middleware) handler
      return handlers[handlers.length - 1](req, res);
    },
  };
}

function makeRes() {
  const res: any = {};
  res.send = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  return res;
}

// ---------------------------------------------------------------------------
// /members/points
// ---------------------------------------------------------------------------

describe("GET /members/points", () => {
  let app: ReturnType<typeof makeMockApp>;

  beforeEach(() => {
    app = makeMockApp();
    shopEndPoints(app as any);
  });

  it("returns total points when user is not blocked", async () => {
    (global as any).client = {
      prisma: {
        points: { findFirst: jest.fn().mockResolvedValue({ TotalPoints: 500, Blocked: false }) },
      },
    };
    const req = { user: { id: "u1" } };
    const res = makeRes();
    await app.invoke("GET", "/members/points", req, res);
    expect(res.send).toHaveBeenCalledWith(JSON.stringify(500));
  });

  it("returns 0 when user is blocked", async () => {
    (global as any).client = {
      prisma: {
        points: { findFirst: jest.fn().mockResolvedValue({ TotalPoints: 999, Blocked: true }) },
      },
    };
    const req = { user: { id: "u1" } };
    const res = makeRes();
    await app.invoke("GET", "/members/points", req, res);
    expect(res.send).toHaveBeenCalledWith(JSON.stringify(0));
  });
});

// ---------------------------------------------------------------------------
// POST /members/redeemItem
// ---------------------------------------------------------------------------

describe("POST /members/redeemItem", () => {
  let app: ReturnType<typeof makeMockApp>;

  beforeEach(() => {
    app = makeMockApp();
    shopEndPoints(app as any);
  });

  it("returns 400 when rewardId is missing from body", async () => {
    (global as any).client = { prisma: {} };
    const req = { user: { id: "u1" }, body: {} };
    const res = makeRes();
    await app.invoke("POST", "/members/redeemItem", req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith("No rewardId");
  });

  it("returns 400 when no stock is available", async () => {
    (global as any).client = {
      prisma: {
        rewardItem: { findFirst: jest.fn().mockResolvedValue(null) },
      },
    };
    const req = { user: { id: "u1" }, body: { rewardId: 5 } };
    const res = makeRes();
    await app.invoke("POST", "/members/redeemItem", req, res);
    await flushPromises();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith("No items left");
  });

  it("returns 400 when user is blocked from redeeming", async () => {
    (global as any).client = {
      prisma: {
        rewardItem: {
          findFirst: jest.fn().mockResolvedValue({ RewardItemID: 1, Reward: { Price: 100, Title: "Game" } }),
        },
        points: { findUnique: jest.fn().mockResolvedValue({ TotalPoints: 200, Blocked: true }) },
      },
    };
    const req = { user: { id: "u1" }, body: { rewardId: 5 } };
    const res = makeRes();
    await app.invoke("POST", "/members/redeemItem", req, res);
    await flushPromises();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith("You are blocked from redeeming items");
  });

  it("returns 400 when user has insufficient points", async () => {
    (global as any).client = {
      prisma: {
        rewardItem: {
          findFirst: jest.fn().mockResolvedValue({ RewardItemID: 1, Reward: { Price: 500, Title: "Expensive" } }),
        },
        points: { findUnique: jest.fn().mockResolvedValue({ TotalPoints: 100, Blocked: false }) },
      },
    };
    const req = { user: { id: "u1" }, body: { rewardId: 5 } };
    const res = makeRes();
    await app.invoke("POST", "/members/redeemItem", req, res);
    await flushPromises();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith("Not enough points");
  });

  it("completes redemption and deducts points on success", async () => {
    const updatedItem = { RewardItemID: 1, RedemptionText: "CODE-XYZ" };
    const updateRewardItem = jest.fn().mockResolvedValue(updatedItem);
    const updatePoints = jest.fn().mockResolvedValue({});
    const sendMock = jest.fn().mockResolvedValue({});

    (global as any).client = {
      prisma: {
        rewardItem: {
          findFirst: jest.fn().mockResolvedValue({ RewardItemID: 1, Reward: { Price: 100, Title: "Game" } }),
          update: updateRewardItem,
        },
        points: {
          findUnique: jest.fn().mockResolvedValue({ TotalPoints: 300, Blocked: false }),
          update: updatePoints,
        },
      },
      channels: {
        cache: {
          get: jest.fn().mockReturnValue({ send: sendMock }),
        },
      },
    };

    const req = { user: { id: "u1", username: "Niels" }, body: { rewardId: 5 } };
    const res = makeRes();
    await app.invoke("POST", "/members/redeemItem", req, res);
    await flushPromises();

    expect(updateRewardItem).toHaveBeenCalledWith(
      expect.objectContaining({ where: { RewardItemID: 1 } })
    );
    expect(updatePoints).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userid: "u1" },
        data: expect.objectContaining({ TotalPoints: { decrement: 100 } }),
      })
    );
    expect(res.send).toHaveBeenCalledWith(JSON.stringify(updatedItem));
  });
});

// ---------------------------------------------------------------------------
// GET /members/pointHistory
// ---------------------------------------------------------------------------

describe("GET /members/pointHistory", () => {
  let app: ReturnType<typeof makeMockApp>;

  beforeEach(() => {
    app = makeMockApp();
    shopEndPoints(app as any);
  });

  it("maps point history to the expected shape", async () => {
    const raw = [
      { points: 50, TimeStamp: "2024-01-01T00:00:00Z", comment: "Daily login" },
      { points: 100, TimeStamp: "2024-01-02T00:00:00Z", comment: "Achievement" },
    ];
    (global as any).client = {
      prisma: {
        pointHistory: { findMany: jest.fn().mockResolvedValue(raw) },
      },
    };
    const req = { user: { id: "u1" } };
    const res = makeRes();
    await app.invoke("GET", "/members/pointHistory", req, res);
    await flushPromises();

    const sent = JSON.parse(res.send.mock.calls[0][0]);
    expect(sent).toEqual([
      { points: 50, timestamp: "2024-01-01T00:00:00Z", comment: "Daily login" },
      { points: 100, timestamp: "2024-01-02T00:00:00Z", comment: "Achievement" },
    ]);
  });

  it("returns 500 when database call fails", async () => {
    (global as any).client = {
      prisma: {
        pointHistory: { findMany: jest.fn().mockRejectedValue(new Error("DB error")) },
      },
    };
    const req = { user: { id: "u1" } };
    const res = makeRes();
    await app.invoke("GET", "/members/pointHistory", req, res);
    await flushPromises();
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---------------------------------------------------------------------------
// GET /members/shopItems
// ---------------------------------------------------------------------------

describe("GET /members/shopItems", () => {
  let app: ReturnType<typeof makeMockApp>;

  beforeEach(() => {
    app = makeMockApp();
    shopEndPoints(app as any);
  });

  it("maps shop items to the expected shape including stock count", async () => {
    const raw = [
      {
        RewardID: "r1",
        Title: "Half-Life 3",
        Description: "Very anticipated",
        Price: 200,
        imageurl: "hl3.png",
        nonSalePrice: 250,
        RewardItem: [{ RewardItemID: "i1" }, { RewardItemID: "i2" }],
      },
    ];
    (global as any).client = {
      prisma: { reward: { findMany: jest.fn().mockResolvedValue(raw) } },
    };
    const req = {};
    const res = makeRes();
    await app.invoke("GET", "/members/shopItems", req, res);

    const sent = JSON.parse(res.send.mock.calls[0][0]);
    expect(sent).toEqual([
      {
        id: "r1",
        title: "Half-Life 3",
        description: "Very anticipated",
        price: 200,
        image: "hl3.png",
        stock: 2,
        nonSalePrice: 250,
      },
    ]);
  });

  it("reports stock as 0 when no items are available", async () => {
    const raw = [
      {
        RewardID: "r2",
        Title: "Out of Stock Game",
        Description: "Gone",
        Price: 100,
        imageurl: "oos.png",
        nonSalePrice: 100,
        RewardItem: [],
      },
    ];
    (global as any).client = {
      prisma: { reward: { findMany: jest.fn().mockResolvedValue(raw) } },
    };
    const res = makeRes();
    await app.invoke("GET", "/members/shopItems", {}, res);

    const sent = JSON.parse(res.send.mock.calls[0][0]);
    expect(sent[0].stock).toBe(0);
  });
});
