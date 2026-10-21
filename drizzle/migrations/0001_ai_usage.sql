ALTER TABLE `ai_extractions` ADD `usage` text;--> statement-breakpoint
ALTER TABLE `ai_extractions` ADD `duration_ms` integer;--> statement-breakpoint
CREATE INDEX `ai_extractions_user_created_idx` ON `ai_extractions` (`user_id`,`created_at`);