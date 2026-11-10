-- Raids expire after a stretch without activity (sign-ups, leaves, votes,
-- time suggestions). Track when the last one happened.
ALTER TABLE `Raids` ADD COLUMN `LastActivity` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill open raids from their creation time and latest sign-up: those are
-- the only activity an open raid can have, so stale ones expire right away.
UPDATE `Raids` r
SET r.`LastActivity` = GREATEST(
  COALESCE(r.`CreationTime`, CURRENT_TIMESTAMP),
  COALESCE((SELECT MAX(a.`CreationTime`) FROM `RaidAttendees` a WHERE a.`RaidId` = r.`ID`), '1970-01-01')
)
WHERE r.`Status` = 1;

-- Scheduling raids keep CURRENT_TIMESTAMP: votes were never timestamped, so
-- there is no way to tell an idle board from a busy one. They get the full
-- grace period from this deploy.
