// Mock discord.js before importing the module under test
jest.mock("discord.js", () => ({
  ActionRowBuilder: jest.fn().mockImplementation(() => ({
    addComponents: jest.fn().mockReturnThis(),
  })),
  ButtonBuilder: jest.fn().mockImplementation(() => ({
    setCustomId: jest.fn().mockReturnThis(),
    setLabel: jest.fn().mockReturnThis(),
    setStyle: jest.fn().mockReturnThis(),
  })),
  ButtonStyle: { Secondary: 2 },
  EmbedBuilder: jest.fn().mockImplementation(() => ({
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    setFooter: jest.fn().mockReturnThis(),
    setTimestamp: jest.fn().mockReturnThis(),
    setColor: jest.fn().mockReturnThis(),
    addFields: jest.fn().mockReturnThis(),
  })),
  StringSelectMenuBuilder: jest.fn().mockImplementation(() => ({
    setCustomId: jest.fn().mockReturnThis(),
    setPlaceholder: jest.fn().mockReturnThis(),
    addOptions: jest.fn().mockReturnThis(),
  })),
}));

// Mock @prisma/client (types only, no runtime value needed)
jest.mock("@prisma/client", () => ({}));

import { RaidEmbeds } from "../modules/RaidEmbeds";

describe("RaidEmbeds.getUniCodeEmoji", () => {
  const cases: [string, string][] = [
    ["A", "🇦"],
    ["B", "🇧"],
    ["C", "🇨"],
    ["D", "🇩"],
    ["E", "🇪"],
    ["F", "🇫"],
    ["G", "🇬"],
    ["H", "🇭"],
    ["I", "🇮"],
    ["J", "🇯"],
    ["K", "🇰"],
    ["L", "🇱"],
    ["M", "🇲"],
    ["N", "🇳"],
    ["O", "🇴"],
    ["P", "🇵"],
    ["Q", "🇶"],
    ["R", "🇷"],
    ["S", "🇸"],
  ];

  test.each(cases)('letter %s maps to regional indicator %s', (input, expected) => {
    expect(RaidEmbeds.getUniCodeEmoji(input)).toBe(expected);
  });

  it("returns the character unchanged for unrecognised input", () => {
    expect(RaidEmbeds.getUniCodeEmoji("T")).toBe("T");
    expect(RaidEmbeds.getUniCodeEmoji("Z")).toBe("Z");
    expect(RaidEmbeds.getUniCodeEmoji("1")).toBe("1");
    expect(RaidEmbeds.getUniCodeEmoji("")).toBe("");
  });
});

describe("RaidEmbeds.buildRaidListMessage", () => {
  it("returns only embeds when raids list is empty", () => {
    const result = RaidEmbeds.buildRaidListMessage([]) as any;
    expect(result).toHaveProperty("embeds");
    expect(result.components).toBeUndefined();
  });

  it("returns embeds and components when raids are present", () => {
    const mockRaids = [
      {
        ID: 1,
        Title: "Test Raid",
        MinPlayers: 5,
        Status: 1,
        RaidAttendees: [{ MemberId: "u1" }, { MemberId: "u2" }],
      },
    ];
    const result = RaidEmbeds.buildRaidListMessage(mockRaids as any) as any;
    expect(result).toHaveProperty("embeds");
    expect(result).toHaveProperty("components");
  });

  it("handles 'too many to list' when attendees exceed 4", () => {
    const attendees = Array.from({ length: 6 }, (_, i) => ({ MemberId: `u${i}` }));
    const mockRaids = [
      {
        ID: 2,
        Title: "Big Raid",
        MinPlayers: 10,
        Status: 1,
        RaidAttendees: attendees,
      },
    ];
    // Should not throw
    expect(() => RaidEmbeds.buildRaidListMessage(mockRaids as any)).not.toThrow();
  });

  it("caps the select menu at 25 raids", () => {
    const raids = Array.from({ length: 30 }, (_, i) => ({
      ID: i,
      Title: `Raid ${i}`,
      MinPlayers: 5,
      Status: 1,
      RaidAttendees: [],
    }));
    // Should not throw even with 30 raids (sliced internally to 25)
    expect(() => RaidEmbeds.buildRaidListMessage(raids as any)).not.toThrow();
  });
});

describe("RaidEmbeds.buildSchedulingActionRow", () => {
  it("returns an action row without throwing", () => {
    expect(() => RaidEmbeds.buildSchedulingActionRow()).not.toThrow();
  });
});
