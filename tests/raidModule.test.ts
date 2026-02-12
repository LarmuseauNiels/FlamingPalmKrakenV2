import { describe, it, expect } from "vitest";
import { RaidModule } from "../modules/RaidModule";

describe("RaidModule.getUniCodeEmoji", () => {
  it("should return regional indicator for A", () => {
    expect(RaidModule.getUniCodeEmoji("A")).toBe("🇦");
  });

  it("should return regional indicator for B", () => {
    expect(RaidModule.getUniCodeEmoji("B")).toBe("🇧");
  });

  it("should return regional indicator for S", () => {
    expect(RaidModule.getUniCodeEmoji("S")).toBe("🇸");
  });

  it("should return char itself for unmapped letters", () => {
    expect(RaidModule.getUniCodeEmoji("Z")).toBe("Z");
  });
});
