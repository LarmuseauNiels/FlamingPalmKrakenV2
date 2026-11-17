import { test } from "node:test";
import assert from "node:assert/strict";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const statistics = require("../modules/statistics");

test("every event start time is announced by exactly one 15-minute tick", () => {
  const interval: number = statistics.STATISTICS_INTERVAL_MINUTES;
  // Every quarter minute of a day, against ticks spanning more than that day.
  for (let startMinute = 0; startMinute < 24 * 60; startMinute += 0.25) {
    let announcements = 0;
    for (let tickMinute = -2 * 60; tickMinute < 26 * 60; tickMinute += interval) {
      if (statistics.isDueForAnnouncement(startMinute - tickMinute)) announcements++;
    }
    assert.equal(announcements, 1, `event at minute ${startMinute}`);
  }
});

test("events already started or far away are not announced", () => {
  for (const minutesToGo of [-5, 0, 10, 22.5, 37.6, 60, 24 * 60]) {
    assert.equal(statistics.isDueForAnnouncement(minutesToGo), false, `${minutesToGo} min`);
  }
  assert.equal(statistics.isDueForAnnouncement(30), true);
});
