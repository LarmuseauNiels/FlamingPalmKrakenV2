import { describe, it, expect } from "vitest";
import { jsonify } from "../modules/ApiFunctions/Helpers";

describe("jsonify", () => {
  it("should stringify a simple object", () => {
    expect(jsonify({ a: 1, b: "hello" })).toBe('{"a":1,"b":"hello"}');
  });

  it("should convert bigint values to numbers", () => {
    const obj = { id: BigInt(123456789) };
    expect(jsonify(obj)).toBe('{"id":123456789}');
  });

  it("should handle null", () => {
    expect(jsonify(null)).toBe("null");
  });

  it("should handle arrays", () => {
    expect(jsonify([1, 2, 3])).toBe("[1,2,3]");
  });
});
