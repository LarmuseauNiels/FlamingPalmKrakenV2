-- Raid "starts soon" DMs: claimed per raid so a restart or overlapping
-- instance never sends the reminder twice.
ALTER TABLE `Raids` ADD COLUMN `ReminderSent` BOOLEAN NOT NULL DEFAULT false;

-- One-click timezone picker: remember when it was offered so members who
-- dismiss it aren't asked on every vote/sign-up.
ALTER TABLE `Members` ADD COLUMN `TimezonePromptedAt` DATETIME(0) NULL;
