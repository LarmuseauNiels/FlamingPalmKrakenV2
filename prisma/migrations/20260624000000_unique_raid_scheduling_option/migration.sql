-- Enforce one scheduling option per (RaidId, Timestamp) so a double-fired
-- interaction (gateway event replay on reconnect, or overlapping bot instances
-- during a deploy) can no longer create duplicate "No votes" time slots.
--
-- The live DB may already contain duplicates created before this guard existed,
-- which would make the CREATE UNIQUE INDEX below fail. So we de-duplicate first,
-- keeping the lowest ID per (RaidId, Timestamp) and preserving any votes.
--
-- NULL RaidId/Timestamp rows are intentionally left untouched: MySQL allows
-- multiple NULLs in a unique index, so they neither conflict nor need merging.

-- 1. Move votes from duplicate options onto the surviving (lowest-ID) option.
--    INSERT IGNORE skips members who already voted on the survivor (the
--    RaidAvailability PK is (SchedulingOptionId, MemberId)), avoiding collisions.
INSERT IGNORE INTO `RaidAvailability` (`SchedulingOptionId`, `MemberId`)
SELECT `keep`.`keepId`, `ra`.`MemberId`
FROM `RaidAvailability` `ra`
JOIN `RaidSchedulingOption` `dup` ON `ra`.`SchedulingOptionId` = `dup`.`ID`
JOIN (
  SELECT `RaidId`, `Timestamp`, MIN(`ID`) AS `keepId`
  FROM `RaidSchedulingOption`
  WHERE `RaidId` IS NOT NULL AND `Timestamp` IS NOT NULL
  GROUP BY `RaidId`, `Timestamp`
) `keep` ON `keep`.`RaidId` = `dup`.`RaidId` AND `keep`.`Timestamp` = `dup`.`Timestamp`
WHERE `dup`.`ID` <> `keep`.`keepId`;

-- 2. Remove the now-migrated votes that still point at duplicate options.
DELETE `ra` FROM `RaidAvailability` `ra`
JOIN `RaidSchedulingOption` `dup` ON `ra`.`SchedulingOptionId` = `dup`.`ID`
JOIN (
  SELECT `RaidId`, `Timestamp`, MIN(`ID`) AS `keepId`
  FROM `RaidSchedulingOption`
  WHERE `RaidId` IS NOT NULL AND `Timestamp` IS NOT NULL
  GROUP BY `RaidId`, `Timestamp`
) `keep` ON `keep`.`RaidId` = `dup`.`RaidId` AND `keep`.`Timestamp` = `dup`.`Timestamp`
WHERE `dup`.`ID` <> `keep`.`keepId`;

-- 3. Delete the duplicate scheduling options themselves.
DELETE `dup` FROM `RaidSchedulingOption` `dup`
JOIN (
  SELECT `RaidId`, `Timestamp`, MIN(`ID`) AS `keepId`
  FROM `RaidSchedulingOption`
  WHERE `RaidId` IS NOT NULL AND `Timestamp` IS NOT NULL
  GROUP BY `RaidId`, `Timestamp`
) `keep` ON `keep`.`RaidId` = `dup`.`RaidId` AND `keep`.`Timestamp` = `dup`.`Timestamp`
WHERE `dup`.`ID` <> `keep`.`keepId`;

-- 4. Enforce uniqueness going forward.
CREATE UNIQUE INDEX `RaidSchedulingOption_RaidId_Timestamp_key` ON `RaidSchedulingOption`(`RaidId`, `Timestamp`);
