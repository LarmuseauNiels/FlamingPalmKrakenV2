import { describe, it, expect } from "vitest";
import { cleanString } from "../modules/statistics";

describe("cleanString", () => {
  it("should return empty string for null", () => {
    expect(cleanString(null)).toBe("");
  });

  it("should return empty string for undefined", () => {
    expect(cleanString(undefined)).toBe("");
  });

  it("should keep ASCII characters", () => {
    expect(cleanString("hello world")).toBe("hello world");
  });

  it("should strip non-ASCII characters", () => {
    expect(cleanString("héllo wörld")).toBe("hllo wrld");
  });

  it("should handle empty string", () => {
    expect(cleanString("")).toBe("");
  });

  it("should strip emoji", () => {
    expect(cleanString("test🎮name")).toBe("testname");
  });
});
