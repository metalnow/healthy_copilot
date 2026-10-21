ALTER TABLE `ai_reviews` ADD `trigger` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_reviews` ADD `usage` text;--> statement-breakpoint
ALTER TABLE `ai_reviews` ADD `error` text;--> statement-breakpoint
ALTER TABLE `ai_reviews` ADD `duration_ms` integer;--> statement-breakpoint
ALTER TABLE `ai_reviews` ADD `completed_at` integer;