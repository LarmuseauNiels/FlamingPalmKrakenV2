-- Kraken AI conversations, so reply-to-continue and pending Confirm buttons
-- survive a restart/deploy instead of living in an in-memory Map.
CREATE TABLE `AiConversation` (
    `MessageId` VARCHAR(25) NOT NULL,
    `ChannelId` VARCHAR(25) NOT NULL,
    `UserId` VARCHAR(25) NOT NULL,
    `Messages` LONGTEXT NOT NULL,
    `PendingActions` TEXT NULL,
    `UpdatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `AiConversation_ChannelId_UpdatedAt_idx`(`ChannelId`, `UpdatedAt`),
    INDEX `AiConversation_UpdatedAt_idx`(`UpdatedAt`),
    PRIMARY KEY (`MessageId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
