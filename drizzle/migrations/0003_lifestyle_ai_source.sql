ALTER TABLE `exercise_sessions` ADD `confidence` real;--> statement-breakpoint
ALTER TABLE `exercise_sessions` ADD `extraction_id` text REFERENCES ai_extractions(id);--> statement-breakpoint
ALTER TABLE `symptom_events` ADD `source` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `symptom_events` ADD `confidence` real;--> statement-breakpoint
ALTER TABLE `symptom_events` ADD `extraction_id` text REFERENCES ai_extractions(id);