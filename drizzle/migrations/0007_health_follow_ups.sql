CREATE TABLE `health_follow_ups` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`finding` text NOT NULL,
	`action` text NOT NULL,
	`department` text,
	`lab_key` text,
	`source_document_id` text,
	`found_at` text,
	`due_date` text,
	`status` text DEFAULT 'open' NOT NULL,
	`completed_at` text,
	`note` text,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_document_id`) REFERENCES `health_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `health_follow_ups_user_idx` ON `health_follow_ups` (`user_id`,`status`);