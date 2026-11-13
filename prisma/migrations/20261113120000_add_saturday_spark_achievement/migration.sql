-- Party Night was rebranded to Saturday Spark. Keep the old achievement (ID 1)
-- so its history and the party5 badge stay intact, and add a new one for
-- Sparks. XP, points, type and notify level are copied from Party Night so a
-- Spark is worth the same. The code finds this row by name, not by ID.
INSERT INTO `Achievements` (`Type`, `Name`, `Description`, `Minimum`, `XpIncrease`, `points`, `NotifyLevel`)
SELECT `Type`, 'Saturday Spark', 'Joined a Saturday Spark', `Minimum`, `XpIncrease`, `points`, `NotifyLevel`
FROM `Achievements`
WHERE `ID` = 1
  AND NOT EXISTS (SELECT 1 FROM (SELECT `ID` FROM `Achievements` WHERE `Name` = 'Saturday Spark') AS existing);
