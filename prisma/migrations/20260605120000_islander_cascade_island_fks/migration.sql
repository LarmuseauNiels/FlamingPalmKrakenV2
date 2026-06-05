-- Ensure deleting an i_Island row cascades to its buildings and units.
--
-- The islander tables were created manually during the P3009 recovery
-- (the original migration was `resolve --applied`, so its SQL never ran),
-- which means the live `IslandID` foreign keys may be missing or may not
-- carry ON DELETE CASCADE. This migration is written defensively:
--   1. Remove any orphaned child rows (so ADD CONSTRAINT can succeed).
--   2. Drop whatever IslandID FK currently exists (by its actual name).
--   3. Re-add it with ON DELETE CASCADE.
-- All steps are safe to run whether or not the FK already exists.

SET @schema := DATABASE();

-- ── i_Building_Island ──────────────────────────────────────────────────────
-- 1. Purge orphans (buildings whose island no longer exists).
DELETE bi FROM `i_Building_Island` bi
    LEFT JOIN `i_Island` i ON bi.`IslandID` = i.`ID`
    WHERE i.`ID` IS NULL;

-- 2. Drop the existing IslandID FK (whatever it's named), if present.
SET @fk := (
    SELECT `CONSTRAINT_NAME` FROM `information_schema`.`KEY_COLUMN_USAGE`
    WHERE `TABLE_SCHEMA` = @schema
      AND `TABLE_NAME` = 'i_Building_Island'
      AND `COLUMN_NAME` = 'IslandID'
      AND `REFERENCED_TABLE_NAME` = 'i_Island'
    LIMIT 1
);
SET @sql := IF(@fk IS NOT NULL,
    CONCAT('ALTER TABLE `i_Building_Island` DROP FOREIGN KEY `', @fk, '`'),
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Re-add with ON DELETE CASCADE.
ALTER TABLE `i_Building_Island`
    ADD CONSTRAINT `i_Building_Island_ibfk_2`
    FOREIGN KEY (`IslandID`) REFERENCES `i_Island`(`ID`)
    ON DELETE CASCADE ON UPDATE RESTRICT;

-- ── i_Unit_Island ───────────────────────────────────────────────────────────
DELETE ui FROM `i_Unit_Island` ui
    LEFT JOIN `i_Island` i ON ui.`IslandID` = i.`ID`
    WHERE i.`ID` IS NULL;

SET @fk := (
    SELECT `CONSTRAINT_NAME` FROM `information_schema`.`KEY_COLUMN_USAGE`
    WHERE `TABLE_SCHEMA` = @schema
      AND `TABLE_NAME` = 'i_Unit_Island'
      AND `COLUMN_NAME` = 'IslandID'
      AND `REFERENCED_TABLE_NAME` = 'i_Island'
    LIMIT 1
);
SET @sql := IF(@fk IS NOT NULL,
    CONCAT('ALTER TABLE `i_Unit_Island` DROP FOREIGN KEY `', @fk, '`'),
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE `i_Unit_Island`
    ADD CONSTRAINT `i_Unit_Island_ibfk_2`
    FOREIGN KEY (`IslandID`) REFERENCES `i_Island`(`ID`)
    ON DELETE CASCADE ON UPDATE CASCADE;
