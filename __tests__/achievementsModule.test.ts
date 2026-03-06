// Mock all external dependencies before importing the module under test
jest.mock("discord.js", () => ({
  AttachmentBuilder: jest.fn(),
  EmbedBuilder: jest.fn().mockImplementation(() => ({
    setColor: jest.fn().mockReturnThis(),
    setTitle: jest.fn().mockReturnThis(),
    setURL: jest.fn().mockReturnThis(),
    addFields: jest.fn().mockReturnThis(),
  })),
}));
jest.mock("../modules/profile", () => jest.fn().mockImplementation(() => ({})));
jest.mock("../islander/ChannelUpdates", () => ({ ChannelUpdates: { MessageWithProfile: jest.fn() } }));
jest.mock("@prisma/client", () => ({}));

import { AchievementsModule } from "../modules/AchievementsModule";

const am = new AchievementsModule();

describe("AchievementsModule.getLevel", () => {
  it("returns 0 for 0 XP", () => {
    expect(am.getLevel(0)).toBe(0);
  });

  it("returns 0 for small XP values below level 1 threshold", () => {
    // Level 1 requires xp where floor(0.2 * sqrt(xp)) = 1 → xp = 25
    expect(am.getLevel(24)).toBe(0);
  });

  it("returns 1 at 25 XP", () => {
    expect(am.getLevel(25)).toBe(1);
  });

  it("returns correct level for larger XP values", () => {
    // level = floor(0.2 * sqrt(xp))
    // xp = 10000 → 0.2 * 100 = 20
    expect(am.getLevel(10000)).toBe(20);
  });

  it("returns correct level for xp=2500", () => {
    // 0.2 * sqrt(2500) = 0.2 * 50 = 10
    expect(am.getLevel(2500)).toBe(10);
  });

  it("increases monotonically as XP increases", () => {
    const levels = [0, 25, 100, 225, 400, 625, 900, 1225, 2500, 10000].map(
      (xp) => am.getLevel(xp)
    );
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    }
  });
});

describe("AchievementsModule.getBadgeUnlocks", () => {
  it("returns empty array when no achievements are present", () => {
    expect(am.getBadgeUnlocks([])).toEqual([]);
  });

  it("unlocks party5 badge when achievementID 1 appears more than 5 times", () => {
    const achievements = Array.from({ length: 6 }, () => ({ AchievementID: 1 }));
    expect(am.getBadgeUnlocks(achievements)).toContain("party5");
  });

  it("does NOT unlock party5 badge when achievementID 1 appears exactly 5 times", () => {
    const achievements = Array.from({ length: 5 }, () => ({ AchievementID: 1 }));
    expect(am.getBadgeUnlocks(achievements)).not.toContain("party5");
  });

  it("unlocks arma5 badge when achievementID 16 appears more than 5 times", () => {
    const achievements = Array.from({ length: 6 }, () => ({ AchievementID: 16 }));
    expect(am.getBadgeUnlocks(achievements)).toContain("arma5");
  });

  it("does NOT unlock arma5 badge when achievementID 16 appears exactly 5 times", () => {
    const achievements = Array.from({ length: 5 }, () => ({ AchievementID: 16 }));
    expect(am.getBadgeUnlocks(achievements)).not.toContain("arma5");
  });

  it("unlocks raid5 badge when achievementID 18 appears more than 5 times", () => {
    const achievements = Array.from({ length: 6 }, () => ({ AchievementID: 18 }));
    expect(am.getBadgeUnlocks(achievements)).toContain("raid5");
  });

  it("does NOT unlock raid5 badge when achievementID 18 appears exactly 5 times", () => {
    const achievements = Array.from({ length: 5 }, () => ({ AchievementID: 18 }));
    expect(am.getBadgeUnlocks(achievements)).not.toContain("raid5");
  });

  it("unlocks refReg1 badge when achievementID 11 appears more than 5 times", () => {
    const achievements = Array.from({ length: 6 }, () => ({ AchievementID: 11 }));
    expect(am.getBadgeUnlocks(achievements)).toContain("refReg1");
  });

  it("does NOT unlock refReg1 badge when achievementID 11 appears exactly 5 times", () => {
    const achievements = Array.from({ length: 5 }, () => ({ AchievementID: 11 }));
    expect(am.getBadgeUnlocks(achievements)).not.toContain("refReg1");
  });

  it("unlocks multiple badges at once", () => {
    const achievements = [
      ...Array.from({ length: 6 }, () => ({ AchievementID: 1 })),
      ...Array.from({ length: 6 }, () => ({ AchievementID: 16 })),
      ...Array.from({ length: 6 }, () => ({ AchievementID: 18 })),
      ...Array.from({ length: 6 }, () => ({ AchievementID: 11 })),
    ];
    const badges = am.getBadgeUnlocks(achievements);
    expect(badges).toContain("party5");
    expect(badges).toContain("arma5");
    expect(badges).toContain("raid5");
    expect(badges).toContain("refReg1");
  });

  it("ignores achievements with irrelevant IDs", () => {
    const achievements = Array.from({ length: 10 }, () => ({ AchievementID: 99 }));
    expect(am.getBadgeUnlocks(achievements)).toEqual([]);
  });
});
