import { test } from "node:test";
import assert from "node:assert/strict";
import { assertRequiredEnv, envInt, requiredEnv } from "../utils/config";

function withEnv(values: Record<string, string | undefined>, body: () => void): void {
  const saved = { ...process.env };
  try {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    body();
  } finally {
    process.env = saved;
  }
}

test("envInt returns the fallback when unset or blank", () => {
  withEnv({ TEST_INT: undefined }, () => assert.equal(envInt("TEST_INT", 30, 1, 100), 30));
  withEnv({ TEST_INT: "  " }, () => assert.equal(envInt("TEST_INT", 30, 1, 100), 30));
});

test("envInt accepts integers within bounds, including the bounds", () => {
  for (const [raw, expected] of [["1", 1], ["45", 45], ["100", 100], [" 7 ", 7]] as const) {
    withEnv({ TEST_INT: raw }, () => assert.equal(envInt("TEST_INT", 30, 1, 100), expected));
  }
});

test("envInt rejects values that are not integers or out of bounds", () => {
  for (const raw of ["21d", "1.5", "abc", "0", "101", "-5"]) {
    withEnv({ TEST_INT: raw }, () => assert.throws(() => envInt("TEST_INT", 30, 1, 100), /TEST_INT/));
  }
});

test("envInt rejects a fallback outside its own bounds", () => {
  assert.throws(() => envInt("TEST_INT", 0, 1, 10), /fallback/);
});

test("assertRequiredEnv names every missing variable", () => {
  const complete = { TOKEN: "t", CLIENT_ID: "c", GUILD_ID: "g", DATABASE_URL: "d", JWT_SECRET: "j" };
  withEnv(complete, () => assertRequiredEnv());
  withEnv({ ...complete, TOKEN: undefined, JWT_SECRET: " " }, () =>
    assert.throws(() => assertRequiredEnv(), /TOKEN, JWT_SECRET/)
  );
});

test("requiredEnv returns the trimmed value or throws", () => {
  withEnv({ JWT_SECRET: " secret " }, () => assert.equal(requiredEnv("JWT_SECRET"), "secret"));
  withEnv({ JWT_SECRET: undefined }, () => assert.throws(() => requiredEnv("JWT_SECRET"), /JWT_SECRET/));
});
