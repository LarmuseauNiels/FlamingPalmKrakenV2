import { test } from "node:test";
import assert from "node:assert/strict";
import { assertToolsConsistent, TOOL_HANDLERS } from "../components/ai/toolRegistry";
import { TOOL_DEFINITIONS } from "../components/ai/toolDefinitions";
import { checkConfirmable, CONFIRMED_TOOLS } from "../components/ai/confirmation";
import { formatTime, parseArgs } from "../components/ai/toolHelpers";

const ctx = { authorId: "1", timezone: null, pendingActions: [] };

test("every defined tool has a handler and vice versa", () => {
  assert.doesNotThrow(() => assertToolsConsistent());
  assert.equal(Object.keys(TOOL_HANDLERS).length, TOOL_DEFINITIONS.length);
});

test("every confirmed tool has its own pre-check, not the fallback", async () => {
  // Empty arguments fail validation before any database lookup.
  for (const name of CONFIRMED_TOOLS) {
    const checked = await checkConfirmable(name, {}, ctx);
    assert.ok("error" in checked, name);
    assert.notEqual(checked.error, "Tool not found.", `${name} has no case in checkConfirmable`);
  }
});

test("createRaid pre-check defaults to 4 minimum players", async () => {
  assert.deepEqual(await checkConfirmable("createRaid", { title: "  Vault  " }, ctx), {
    label: 'Create raid "Vault" (min 4)',
    args: { title: "Vault", minPlayers: 4 },
  });
});

test("parseArgs accepts JSON strings and objects, rejects the rest", () => {
  assert.deepEqual(parseArgs('{"raidId": 3}'), { raidId: 3 });
  assert.deepEqual(parseArgs({ raidId: 3 }), { raidId: 3 });
  assert.deepEqual(parseArgs(""), {});
  assert.equal(parseArgs("{not json"), null);
  assert.equal(parseArgs("42"), null);
});

test("formatTime gives member-local time plus a Discord timestamp tag", () => {
  const date = new Date("2026-07-03T17:00:00Z");
  assert.equal(formatTime(date, "Europe/Brussels"), "Fri 3 Jul 2026 19:00 Europe/Brussels (<t:1783098000:F>)");
  assert.equal(formatTime(date, null), "Fri 3 Jul 2026 17:00 UTC (<t:1783098000:F>)");
});
