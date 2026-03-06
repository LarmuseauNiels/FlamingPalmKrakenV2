jest.mock("../modules/ApiFunctions/Helpers", () => ({
  authenticateToken: (_req: any, _res: any, next: any) => next(),
  jsonify: (obj: any) => JSON.stringify(obj),
}));
jest.mock("../utils/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));
jest.mock(".prisma/client", () => ({}), { virtual: true });

import { memberEndPoints } from "../modules/ApiFunctions/MemberEndPoints";

/** Flush all pending Promise microtasks (handles .then()/.catch() chains). */
const flushPromises = () => new Promise<void>(resolve => setImmediate(resolve));

// ---------------------------------------------------------------------------
// Minimal mock Express app (same pattern as shopEndPoints.test.ts)
// ---------------------------------------------------------------------------

type Handler = (req: any, res: any, next?: any) => any;

function makeMockApp() {
  const routes: Record<string, Handler[]> = {};
  return {
    get: (path: string, ...handlers: Handler[]) => { routes[`GET:${path}`] = handlers; },
    post: (path: string, ...handlers: Handler[]) => { routes[`POST:${path}`] = handlers; },
    invoke(method: "GET" | "POST", path: string, req: any, res: any) {
      const key = `${method}:${path}`;
      const handlers = routes[key];
      if (!handlers) throw new Error(`No handler registered for ${key}`);
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

let app: ReturnType<typeof makeMockApp>;

beforeEach(() => {
  app = makeMockApp();
  memberEndPoints(app as any);
});

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST /members/profile
// ---------------------------------------------------------------------------

describe("POST /members/profile", () => {
  it("echoes the authenticated user object as JSON", async () => {
    const user = { id: "u123", username: "Niels", avatar: "abc123" };
    const req = { user };
    const res = makeRes();
    await app.invoke("POST", "/members/profile", req, res);
    expect(res.send).toHaveBeenCalledWith(JSON.stringify(user));
  });
});

// ---------------------------------------------------------------------------
// GET /members/library
// ---------------------------------------------------------------------------

describe("GET /members/library", () => {
  it("maps raw library items to the expected shape", async () => {
    const rawLibrary = [
      {
        RewardItemID: "order-1",
        RedemptionText: "CODE-ALPHA",
        RedemptionTimeStamp: "2024-01-10T12:00:00Z",
        Reward: { Title: "Half-Life 3" },
      },
      {
        RewardItemID: "order-2",
        RedemptionText: "CODE-BETA",
        RedemptionTimeStamp: "2024-02-20T08:00:00Z",
        Reward: { Title: "Portal 3" },
      },
    ];
    (global as any).client = {
      prisma: {
        rewardItem: { findMany: jest.fn().mockResolvedValue(rawLibrary) },
      },
    };

    const req = { user: { id: "u1" } };
    const res = makeRes();
    await app.invoke("GET", "/members/library", req, res);
    await flushPromises();

    const sent = JSON.parse(res.send.mock.calls[0][0]);
    expect(sent).toEqual([
      {
        game: "Half-Life 3",
        orderId: "order-1",
        redemptionText: "CODE-ALPHA",
        timestamp: "2024-01-10T12:00:00Z",
      },
      {
        game: "Portal 3",
        orderId: "order-2",
        redemptionText: "CODE-BETA",
        timestamp: "2024-02-20T08:00:00Z",
      },
    ]);
  });

  it("returns an empty array when the user has no library items", async () => {
    (global as any).client = {
      prisma: {
        rewardItem: { findMany: jest.fn().mockResolvedValue([]) },
      },
    };
    const req = { user: { id: "u2" } };
    const res = makeRes();
    await app.invoke("GET", "/members/library", req, res);
    await flushPromises();

    const sent = JSON.parse(res.send.mock.calls[0][0]);
    expect(sent).toEqual([]);
  });

  it("returns 500 when the database call fails", async () => {
    (global as any).client = {
      prisma: {
        rewardItem: { findMany: jest.fn().mockRejectedValue(new Error("DB down")) },
      },
    };
    const req = { user: { id: "u3" } };
    const res = makeRes();
    await app.invoke("GET", "/members/library", req, res);
    await flushPromises();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith("Failed to load library");
  });

  it("queries only items redeemed by the requesting user", async () => {
    const findManyMock = jest.fn().mockResolvedValue([]);
    (global as any).client = {
      prisma: { rewardItem: { findMany: findManyMock } },
    };
    const req = { user: { id: "specificUser" } };
    const res = makeRes();
    await app.invoke("GET", "/members/library", req, res);
    await flushPromises();

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { RedeemedBy: "specificUser" } })
    );
  });
});

// ---------------------------------------------------------------------------
// GET /members/dashboard
// ---------------------------------------------------------------------------

describe("GET /members/dashboard", () => {
  it("assembles dashboard with points, raids, and point history", async () => {
    const mockPoints = { TotalPoints: 750 };
    const mockRaids = [
      {
        ID: 1,
        Title: "Epic Raid",
        MinPlayers: 5,
        CreationTime: new Date("2024-01-01"),
        Status: 1,
        RaidAttendees: [{ MemberId: "a" }, { MemberId: "b" }],
      },
    ];
    const mockHistory = [
      { userid: "u1", points: 10, TimeStamp: "2024-01-01", comment: "Daily" },
    ];

    (global as any).client = {
      prisma: {
        points: { findFirst: jest.fn().mockResolvedValue(mockPoints) },
        raids: { findMany: jest.fn().mockResolvedValue(mockRaids) },
        pointHistory: { findMany: jest.fn().mockResolvedValue(mockHistory) },
      },
    };

    const req = { user: { id: "u1" } };
    const res = makeRes();
    await app.invoke("GET", "/members/dashboard", req, res);

    const sent = JSON.parse(res.send.mock.calls[0][0]);
    expect(sent.dashboardPoints).toBe(750);
    expect(sent.raids).toHaveLength(1);
    expect(sent.raids[0].Title).toBe("Epic Raid");
    expect(sent.raids[0].Attending).toBe(2);
    expect(sent.pointHistory).toEqual(mockHistory);
  });
});
