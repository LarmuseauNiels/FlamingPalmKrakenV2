import { test } from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "../utils/logger";

test("logging circular, BigInt and huge objects never throws", () => {
  const log = createLogger("Test");
  const circular: any = { id: 1n };
  circular.self = circular;
  assert.doesNotThrow(() => log.info("circular:", circular));
  assert.doesNotThrow(() => log.info("huge:", { text: "x".repeat(100_000) }));
  assert.doesNotThrow(() => log.info("odd:", undefined, null, Symbol("s"), () => 1));
});
