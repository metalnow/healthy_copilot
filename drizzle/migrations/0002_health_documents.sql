ALTER TABLE `health_documents` ADD `page_media_ids` text;--> statement-breakpoint
ALTER TABLE `health_documents` ADD `extraction_id` text REFERENCES ai_extractions(id);--> statement-breakpoint
ALTER TABLE `health_documents` ADD `error` text;