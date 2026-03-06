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
// profile.js is a canvas/image module — mock it out entirely
jest.mock("../modules/profile", () =>
  jest.fn().mockImplementation(() => ({
    setUsername: jest.fn().mockReturnThis(),
    setAvatar: jest.fn().mockReturnThis(),
    setCurrentXP: jest.fn().mockReturnThis(),
    setRequiredXP: jest.fn().mockReturnThis(),
    setRank: jest.fn().mockReturnThis(),
    setLevel: jest.fn().mockReturnThis(),
    setCustomStatusColor: jest.fn().mockReturnThis(),
    setProgressBar: jest.fn().mockReturnThis(),
    setBackground: jest.fn().mockReturnThis(),
    setAchievements: jest.fn().mockReturnThis(),
    setOverlay: jest.fn().mockReturnThis(),
    build: jest.fn().mockResolvedValue(Buffer.from("png")),
  }))
);

import { profileEndPoints } from "../modules/ApiFunctions/ProfileEndPoints";

// ---------------------------------------------------------------------------
// Minimal mock Express app
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
  res.set = jest.fn().mockReturnValue(res);
  return res;
}

let app: ReturnType<typeof makeMockApp>;

beforeEach(() => {
  app = makeMockApp();
  profileEndPoints(app as any);
  (global as any).client = {
    prisma: { profile: { update: jest.fn(), upsert: jest.fn() } },
    achievementsModule: { GetProfileBlob: jest.fn(), getLevel: jest.fn() },
  };
});

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST /members/setBadge – achievementField slot logic
// ---------------------------------------------------------------------------

describe("POST /members/setBadge – slot validation", () => {
  /**
   * The logic under test:
   *   const achievementField = `Achievement${slot >= 2 && slot <= 5 ? slot : 1}`;
   */
  async function getAchievementField(slot: number, fileName = "admiral") {
    const upsertMock = jest.fn().mockResolvedValue({});
    (global as any).client.prisma.profile.upsert = upsertMock;
    const req = { user: { id: "u1" }, body: { slot, fileName } };
    const res = makeRes();
    await app.invoke("POST", "/members/setBadge", req, res);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const updateArg = upsertMock.mock.calls[0][0].update;
    return Object.keys(updateArg)[0]; // the key is the achievementField
  }

  it("uses Achievement2 for slot 2", async () => {
    expect(await getAchievementField(2)).toBe("Achievement2");
  });

  it("uses Achievement3 for slot 3", async () => {
    expect(await getAchievementField(3)).toBe("Achievement3");
  });

  it("uses Achievement4 for slot 4", async () => {
    expect(await getAchievementField(4)).toBe("Achievement4");
  });

  it("uses Achievement5 for slot 5", async () => {
    expect(await getAchievementField(5)).toBe("Achievement5");
  });

  it("falls back to Achievement1 for slot 1", async () => {
    expect(await getAchievementField(1)).toBe("Achievement1");
  });

  it("falls back to Achievement1 for slot 0 (out of range)", async () => {
    expect(await getAchievementField(0)).toBe("Achievement1");
  });

  it("falls back to Achievement1 for slot 6 (out of range)", async () => {
    expect(await getAchievementField(6)).toBe("Achievement1");
  });

  it("sets badge to null when fileName is empty string", async () => {
    const upsertMock = jest.fn().mockResolvedValue({});
    (global as any).client.prisma.profile.upsert = upsertMock;
    const req = { user: { id: "u1" }, body: { slot: 3, fileName: "" } };
    const res = makeRes();
    await app.invoke("POST", "/members/setBadge", req, res);
    const updateArg = upsertMock.mock.calls[0][0].update;
    expect(updateArg.Achievement3).toBeNull();
  });

  it("sets badge to the fileName when non-empty", async () => {
    const upsertMock = jest.fn().mockResolvedValue({});
    (global as any).client.prisma.profile.upsert = upsertMock;
    const req = { user: { id: "u1" }, body: { slot: 2, fileName: "admiral" } };
    const res = makeRes();
    await app.invoke("POST", "/members/setBadge", req, res);
    const updateArg = upsertMock.mock.calls[0][0].update;
    expect(updateArg.Achievement2).toBe("admiral");
  });

  it("returns 400 when body is missing", async () => {
    const req = { user: { id: "u1" }, body: null };
    const res = makeRes();
    await app.invoke("POST", "/members/setBadge", req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ---------------------------------------------------------------------------
// POST /members/setBackground
// ---------------------------------------------------------------------------

describe("POST /members/setBackground", () => {
  it("calls prisma upsert with the provided fileName", async () => {
    const upsertMock = jest.fn().mockResolvedValue({});
    (global as any).client.prisma.profile.upsert = upsertMock;
    const req = { user: { id: "u1" }, body: { fileName: "desert" } };
    const res = makeRes();
    await app.invoke("POST", "/members/setBackground", req, res);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { BackgroundImage: "desert" },
        create: { userid: "u1", BackgroundImage: "desert" },
      })
    );
    expect(res.send).toHaveBeenCalledWith(true);
  });

  it("returns 400 when body is null", async () => {
    const req = { user: { id: "u1" }, body: null };
    const res = makeRes();
    await app.invoke("POST", "/members/setBackground", req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ---------------------------------------------------------------------------
// GET /members/getLevel
// ---------------------------------------------------------------------------

describe("GET /members/getLevel", () => {
  it("returns the level computed by the achievementsModule", async () => {
    (global as any).client.prisma.members = {
      findFirst: jest.fn().mockResolvedValue({ XP: 2500 }),
    };
    (global as any).client.achievementsModule.getLevel = jest.fn().mockReturnValue(10);

    const req = { user: { id: "u1" } };
    const res = makeRes();
    await app.invoke("GET", "/members/getLevel", req, res);

    expect((global as any).client.achievementsModule.getLevel).toHaveBeenCalledWith(2500);
    expect(res.send).toHaveBeenCalledWith(JSON.stringify(10));
  });
});

// ---------------------------------------------------------------------------
// GET /members/getBadgeUnlocks
// ---------------------------------------------------------------------------

describe("GET /members/getBadgeUnlocks", () => {
  it("returns the badge unlocks computed by the achievementsModule", async () => {
    const achHistory = Array.from({ length: 6 }, () => ({ AchievementID: 1 }));
    (global as any).client.prisma.members = {
      findFirst: jest.fn().mockResolvedValue({ ID: "u1", Achievement_History: achHistory }),
    };
    (global as any).client.achievementsModule.getBadgeUnlocks = jest
      .fn()
      .mockReturnValue(["party5"]);

    const req = { user: { id: "u1" } };
    const res = makeRes();
    await app.invoke("GET", "/members/getBadgeUnlocks", req, res);

    expect((global as any).client.achievementsModule.getBadgeUnlocks).toHaveBeenCalledWith(
      achHistory
    );
    expect(res.send).toHaveBeenCalledWith(JSON.stringify(["party5"]));
  });
});
