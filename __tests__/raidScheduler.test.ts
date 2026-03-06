// Mock all external Discord/Prisma dependencies
jest.mock("discord.js", () => ({
  EmbedBuilder: jest.fn().mockImplementation(() => ({
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    setColor: jest.fn().mockReturnThis(),
    setFooter: jest.fn().mockReturnThis(),
    addFields: jest.fn().mockReturnThis(),
  })),
}));
jest.mock("@prisma/client", () => ({}));
jest.mock("../modules/RaidEmbeds", () => ({
  RaidEmbeds: {
    getUniCodeEmoji: jest.fn((c) => c),
    buildSchedulingMessage: jest.fn(),
    buildSchedulingActionRow: jest.fn(),
  },
}));
jest.mock("../islander/ChannelUpdates", () => ({
  ChannelUpdates: { MessageWithRaid: jest.fn() },
}));

import { RaidScheduler } from "../modules/RaidScheduler";

// ---------------------------------------------------------------------------
// Shared prisma mock helpers
// ---------------------------------------------------------------------------

function makePrismaMock(overrides: Record<string, any> = {}) {
  return {
    raidSchedulingOption: {
      createMany: jest.fn().mockResolvedValue({ count: 9 }),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      ...overrides.raidSchedulingOption,
    },
    raids: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      ...overrides.raids,
    },
  };
}

beforeEach(() => {
  (global as any).client = { prisma: makePrismaMock() };
});

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// AddDayToRaidSchedulingOptions – date arithmetic
// ---------------------------------------------------------------------------

describe("RaidScheduler.AddDayToRaidSchedulingOptions", () => {
  /**
   * Given a base date the method must create exactly 9 scheduling options:
   *   day+0  → A 17:00, B 19:00, C 21:00
   *   day+2  → D 17:00, E 19:00, F 21:00
   *   day+5  → G 17:00, H 19:00, I 21:00
   */
  async function getCreatedData(baseDate: Date) {
    const prismaMock = makePrismaMock();
    (global as any).client = { prisma: prismaMock };
    await RaidScheduler.AddDayToRaidSchedulingOptions(42, baseDate);
    expect(prismaMock.raidSchedulingOption.createMany).toHaveBeenCalledTimes(1);
    return prismaMock.raidSchedulingOption.createMany.mock.calls[0][0].data as {
      RaidId: number;
      Timestamp: Date;
      Option: string;
    }[];
  }

  it("creates exactly 9 scheduling options", async () => {
    const data = await getCreatedData(new Date(2024, 0, 2)); // Jan 2
    expect(data).toHaveLength(9);
  });

  it("assigns options A through I in order", async () => {
    const data = await getCreatedData(new Date(2024, 0, 2));
    const letters = data.map((d) => d.Option);
    expect(letters).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I"]);
  });

  it("uses the provided raidId for all slots", async () => {
    const data = await getCreatedData(new Date(2024, 0, 2));
    expect(data.every((d) => d.RaidId === 42)).toBe(true);
  });

  it("day 0 slots are at 17:00, 19:00 and 21:00 on the base date", async () => {
    const base = new Date(2024, 0, 2); // Jan 2 2024
    const data = await getCreatedData(base);

    const [a, b, c] = data.slice(0, 3);
    expect(a.Option).toBe("A");
    expect(a.Timestamp.getDate()).toBe(2);
    expect(a.Timestamp.getHours()).toBe(17);

    expect(b.Option).toBe("B");
    expect(b.Timestamp.getDate()).toBe(2);
    expect(b.Timestamp.getHours()).toBe(19);

    expect(c.Option).toBe("C");
    expect(c.Timestamp.getDate()).toBe(2);
    expect(c.Timestamp.getHours()).toBe(21);
  });

  it("day+2 slots are at 17:00, 19:00 and 21:00 two days after base", async () => {
    const base = new Date(2024, 0, 2); // Jan 2 → day+2 = Jan 4
    const data = await getCreatedData(base);

    const [d, e, f] = data.slice(3, 6);
    expect(d.Option).toBe("D");
    expect(d.Timestamp.getDate()).toBe(4);
    expect(d.Timestamp.getHours()).toBe(17);

    expect(e.Option).toBe("E");
    expect(e.Timestamp.getDate()).toBe(4);
    expect(e.Timestamp.getHours()).toBe(19);

    expect(f.Option).toBe("F");
    expect(f.Timestamp.getDate()).toBe(4);
    expect(f.Timestamp.getHours()).toBe(21);
  });

  it("day+5 slots are at 17:00, 19:00 and 21:00 five days after base", async () => {
    const base = new Date(2024, 0, 2); // Jan 2 → day+5 = Jan 7
    const data = await getCreatedData(base);

    const [g, h, i] = data.slice(6, 9);
    expect(g.Option).toBe("G");
    expect(g.Timestamp.getDate()).toBe(7);
    expect(g.Timestamp.getHours()).toBe(17);

    expect(h.Option).toBe("H");
    expect(h.Timestamp.getDate()).toBe(7);
    expect(h.Timestamp.getHours()).toBe(19);

    expect(i.Option).toBe("I");
    expect(i.Timestamp.getDate()).toBe(7);
    expect(i.Timestamp.getHours()).toBe(21);
  });

  it("minutes and seconds are zeroed for all slots", async () => {
    const data = await getCreatedData(new Date(2024, 0, 2));
    for (const slot of data) {
      expect(slot.Timestamp.getMinutes()).toBe(0);
      expect(slot.Timestamp.getSeconds()).toBe(0);
      expect(slot.Timestamp.getMilliseconds()).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// AddSingleSchedulingOptionToRaid – option letter sequencing
// ---------------------------------------------------------------------------

describe("RaidScheduler.AddSingleSchedulingOptionToRaid", () => {
  async function captureCreatedOption(lastOption: string | null) {
    const findFirstMock = jest.fn().mockResolvedValue(
      lastOption === null ? null : { Option: lastOption }
    );
    const createMock = jest.fn().mockResolvedValue({ Option: "X" });
    (global as any).client = {
      prisma: {
        raidSchedulingOption: {
          findFirst: findFirstMock,
          create: createMock,
        },
      },
    };

    const ts = new Date(2024, 0, 15, 18, 0, 0);
    await RaidScheduler.AddSingleSchedulingOptionToRaid(7, ts);

    expect(createMock).toHaveBeenCalledTimes(1);
    return createMock.mock.calls[0][0].data as { Option: string; Timestamp: Date; RaidId: number };
  }

  it("uses option 'A' when no existing options are present", async () => {
    const data = await captureCreatedOption(null);
    expect(data.Option).toBe("A");
  });

  it("increments from 'A' to 'B'", async () => {
    const data = await captureCreatedOption("A");
    expect(data.Option).toBe("B");
  });

  it("increments from 'I' to 'J'", async () => {
    const data = await captureCreatedOption("I");
    expect(data.Option).toBe("J");
  });

  it("increments from 'S' to 'T'", async () => {
    const data = await captureCreatedOption("S");
    expect(data.Option).toBe("T");
  });

  it("stores the provided timestamp", async () => {
    const ts = new Date(2024, 5, 10, 20, 0, 0);
    const findFirstMock = jest.fn().mockResolvedValue({ Option: "C" });
    const createMock = jest.fn().mockResolvedValue({});
    (global as any).client = {
      prisma: { raidSchedulingOption: { findFirst: findFirstMock, create: createMock } },
    };
    await RaidScheduler.AddSingleSchedulingOptionToRaid(99, ts);
    expect(createMock.mock.calls[0][0].data.Timestamp).toEqual(ts);
  });

  it("stores the provided raidId", async () => {
    const data = await captureCreatedOption("B");
    expect(data.RaidId).toBe(7);
  });
});
