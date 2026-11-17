import { test } from "node:test";
import assert from "node:assert/strict";
import { createExclusiveRunner, scheduleJob } from "../utils/scheduleJob";

test("a tick while the job is running is skipped", async () => {
  let active = 0;
  let maxActive = 0;
  let release: () => void = () => {};
  const runner = createExclusiveRunner("test", async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise<void>((resolve) => (release = resolve));
    active--;
  });

  const first = runner();
  assert.equal(await runner(), false, "overlapping tick should be skipped");
  release();
  assert.equal(await first, true);
  assert.equal(maxActive, 1);

  // Once the run finished, the next tick runs again.
  const third = runner();
  release();
  assert.equal(await third, true);
});

test("a failing run is contained and does not block the next one", async () => {
  let calls = 0;
  const runner = createExclusiveRunner("test", async () => {
    calls++;
    throw new Error("boom");
  });
  assert.equal(await runner(), true);
  assert.equal(await runner(), true);
  assert.equal(calls, 2);
});

test("an invalid cron expression is rejected up front", () => {
  assert.throws(() => scheduleJob("bad", "not a cron", async () => {}), /invalid cron/);
});
