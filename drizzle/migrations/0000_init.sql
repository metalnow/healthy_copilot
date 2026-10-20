CREATE TABLE `activity_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`local_date` text NOT NULL,
	`steps` integer,
	`distance_m` real,
	`active_minutes` integer,
	`active_kcal` real,
	`source` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_daily_user_date_source_uq` ON `activity_daily` (`user_id`,`local_date`,`source`);--> statement-breakpoint
CREATE TABLE `ai_extractions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`task` text NOT NULL,
	`model_profile` text NOT NULL,
	`model_id` text NOT NULL,
	`input_media_ids` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`raw_output` text,
	`parsed_output` text,
	`confidence` real,
	`error` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_extractions_user_idx` ON `ai_extractions` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `ai_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`period` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`model_id` text NOT NULL,
	`input_summary` text NOT NULL,
	`output` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_reviews_user_period_uq` ON `ai_reviews` (`user_id`,`period`,`period_start`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_logs_user_idx` ON `audit_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `drink_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`drink_type` text NOT NULL,
	`name` text,
	`occurred_at` text NOT NULL,
	`local_date` text NOT NULL,
	`timezone` text NOT NULL,
	`input_type` text NOT NULL,
	`volume_ml` real,
	`water_ml` real,
	`caffeine_mg` real,
	`sugar_g` real,
	`alcohol_g` real,
	`nutrition` text,
	`confidence` real,
	`extraction_id` text,
	`verified_by_user` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`extraction_id`) REFERENCES `ai_extractions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `drink_events_user_date_idx` ON `drink_events` (`user_id`,`local_date`);--> statement-breakpoint
CREATE TABLE `exercise_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`started_at` text NOT NULL,
	`local_date` text NOT NULL,
	`timezone` text NOT NULL,
	`duration_min` real NOT NULL,
	`intensity` text,
	`rpe` integer,
	`after_meal` integer,
	`note` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `exercise_sessions_user_date_idx` ON `exercise_sessions` (`user_id`,`local_date`);--> statement-breakpoint
CREATE TABLE `experiment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`experiment_id` text NOT NULL,
	`local_date` text NOT NULL,
	`adhered` integer NOT NULL,
	`note` text,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `experiment_events_date_uq` ON `experiment_events` (`experiment_id`,`local_date`);--> statement-breakpoint
CREATE TABLE `experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`hypothesis` text,
	`protocol` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`tracked_metrics` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `food_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`meal_type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`local_date` text NOT NULL,
	`timezone` text NOT NULL,
	`input_type` text NOT NULL,
	`total_nutrition` text,
	`ai_confidence` real,
	`media_id` text,
	`extraction_id` text,
	`note` text,
	`verified_by_user` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media_objects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`extraction_id`) REFERENCES `ai_extractions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `food_events_user_date_idx` ON `food_events` (`user_id`,`local_date`);--> statement-breakpoint
CREATE TABLE `food_items` (
	`id` text PRIMARY KEY NOT NULL,
	`food_event_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`name` text NOT NULL,
	`quantity` real,
	`portion` text,
	`cooking_method` text,
	`has_sauce` integer,
	`nutrition` text,
	`confidence` real,
	FOREIGN KEY (`food_event_id`) REFERENCES `food_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `food_items_event_idx` ON `food_items` (`food_event_id`);--> statement-breakpoint
CREATE TABLE `google_drive_backups` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`drive_file_id` text,
	`file_name` text NOT NULL,
	`format_version` integer NOT NULL,
	`includes_media` integer DEFAULT false NOT NULL,
	`record_counts` text,
	`size_bytes` integer,
	`checksum` text,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `google_drive_backups_user_idx` ON `google_drive_backups` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `health_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`media_id` text NOT NULL,
	`title` text,
	`institution` text,
	`report_date` text,
	`page_count` integer,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media_objects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `health_documents_user_idx` ON `health_documents` (`user_id`,`report_date`);--> statement-breakpoint
CREATE TABLE `health_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`metric` text NOT NULL,
	`unit` text,
	`baseline_value` real,
	`target_value` real,
	`target_date` text,
	`direction` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `health_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`sex` text,
	`birth_year` integer,
	`height_cm` real,
	`allergies` text,
	`conditions` text,
	`note` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`settings` text,
	`last_sync_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integrations_user_provider_uq` ON `integrations` (`user_id`,`provider`);--> statement-breakpoint
CREATE TABLE `lab_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code` text NOT NULL,
	`display_name` text NOT NULL,
	`value` real,
	`text_value` text,
	`unit` text,
	`measured_at` text NOT NULL,
	`reference_min` real,
	`reference_max` real,
	`reference_text` text,
	`abnormal_flag` text,
	`source_document_id` text,
	`source_page` integer,
	`source` text NOT NULL,
	`confidence` real,
	`extraction_id` text,
	`verified_by_user` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_document_id`) REFERENCES `health_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`extraction_id`) REFERENCES `ai_extractions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lab_observations_user_code_idx` ON `lab_observations` (`user_id`,`code`,`measured_at`);--> statement-breakpoint
CREATE TABLE `media_objects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`r2_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`original_filename` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_objects_r2_key_unique` ON `media_objects` (`r2_key`);--> statement-breakpoint
CREATE INDEX `media_objects_user_idx` ON `media_objects` (`user_id`,`kind`);--> statement-breakpoint
CREATE TABLE `medication_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`medication_id` text NOT NULL,
	`schedule_id` text,
	`scheduled_at` text,
	`taken_at` text,
	`local_date` text NOT NULL,
	`timezone` text NOT NULL,
	`status` text NOT NULL,
	`actual_dose` real,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`medication_id`) REFERENCES `medications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`schedule_id`) REFERENCES `medication_schedules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `medication_events_user_date_idx` ON `medication_events` (`user_id`,`local_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `medication_events_schedule_date_uq` ON `medication_events` (`schedule_id`,`local_date`);--> statement-breakpoint
CREATE TABLE `medication_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`medication_id` text NOT NULL,
	`local_time` text NOT NULL,
	`days_of_week` text,
	`dose` real,
	`start_date` text,
	`end_date` text,
	FOREIGN KEY (`medication_id`) REFERENCES `medications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `medications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`dose` real,
	`unit` text,
	`timing` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `model_profiles` (
	`key` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'openrouter' NOT NULL,
	`model_id` text NOT NULL,
	`temperature` real,
	`max_tokens` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`purpose` text NOT NULL,
	`scope` text NOT NULL,
	`encrypted_access_token` text NOT NULL,
	`encrypted_refresh_token` text,
	`access_token_expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_tokens_user_purpose_uq` ON `oauth_tokens` (`user_id`,`provider`,`purpose`);--> statement-breakpoint
CREATE TABLE `observations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`local_date` text NOT NULL,
	`timezone` text NOT NULL,
	`values` text NOT NULL,
	`unit` text,
	`source` text NOT NULL,
	`confidence` real,
	`note` text,
	`context` text,
	`media_id` text,
	`extraction_id` text,
	`external_id` text,
	`verified_by_user` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media_objects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`extraction_id`) REFERENCES `ai_extractions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `observations_user_type_idx` ON `observations` (`user_id`,`type`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `observations_user_date_idx` ON `observations` (`user_id`,`local_date`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `sleep_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bedtime_at` text,
	`sleep_start_at` text,
	`wake_at` text NOT NULL,
	`local_date` text NOT NULL,
	`timezone` text NOT NULL,
	`awakenings` integer,
	`quality` integer,
	`total_sleep_min` integer,
	`awake_min` integer,
	`deep_min` integer,
	`rem_min` integer,
	`light_min` integer,
	`avg_heart_rate` real,
	`hrv_ms` real,
	`source` text NOT NULL,
	`confidence` real,
	`original_image_id` text,
	`extraction_id` text,
	`verified_by_user` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`original_image_id`) REFERENCES `media_objects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`extraction_id`) REFERENCES `ai_extractions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sleep_sessions_user_date_idx` ON `sleep_sessions` (`user_id`,`local_date`);--> statement-breakpoint
CREATE TABLE `symptom_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`local_date` text NOT NULL,
	`timezone` text NOT NULL,
	`severity` integer NOT NULL,
	`duration_min` integer,
	`note` text,
	`related_food_event_ids` text,
	`medication_event_ids` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `symptom_events_user_date_idx` ON `symptom_events` (`user_id`,`local_date`);--> statement-breakpoint
CREATE TABLE `user_keys` (
	`user_id` text PRIMARY KEY NOT NULL,
	`wrapped_key` text NOT NULL,
	`key_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`backup_frequency` text DEFAULT 'weekly' NOT NULL,
	`backup_include_media` integer DEFAULT false NOT NULL,
	`ai_log_raw_content` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`google_subject_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`avatar_url` text,
	`timezone` text DEFAULT 'Asia/Taipei' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_subject_id_unique` ON `users` (`google_subject_id`);