CREATE TABLE `document_groups` (
	`document_id` int NOT NULL,
	`group_id` int NOT NULL,
	CONSTRAINT `document_groups_document_id_group_id_pk` PRIMARY KEY(`document_id`,`group_id`)
);
--> statement-breakpoint
CREATE TABLE `learner_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`features` json,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `learner_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lesson_progress` (
	`user_id` int NOT NULL,
	`lesson_id` int NOT NULL,
	`completed_at` datetime(3),
	`best_score` int,
	`notes` text,
	CONSTRAINT `lesson_progress_user_id_lesson_id_pk` PRIMARY KEY(`user_id`,`lesson_id`)
);
--> statement-breakpoint
CREATE TABLE `listen_positions` (
	`user_id` int NOT NULL,
	`source_id` int NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	CONSTRAINT `listen_positions_user_id_source_id_pk` PRIMARY KEY(`user_id`,`source_id`)
);
--> statement-breakpoint
CREATE TABLE `listen_progress` (
	`user_id` int NOT NULL,
	`item_id` int NOT NULL,
	`round` int NOT NULL DEFAULT 0,
	`seen_at` datetime(3),
	`tries` int NOT NULL DEFAULT 0,
	`clean` int NOT NULL DEFAULT 0,
	`due` datetime(3),
	`interval` int NOT NULL DEFAULT 0,
	`lapses` int NOT NULL DEFAULT 0,
	`misses` json,
	CONSTRAINT `listen_progress_user_id_item_id_pk` PRIMARY KEY(`user_id`,`item_id`)
);
--> statement-breakpoint
CREATE TABLE `user_groups` (
	`user_id` int NOT NULL,
	`group_id` int NOT NULL,
	CONSTRAINT `user_groups_user_id_group_id_pk` PRIMARY KEY(`user_id`,`group_id`)
);
--> statement-breakpoint
ALTER TABLE `labels` DROP INDEX `labels_kind_name`;--> statement-breakpoint
DROP INDEX `words_due` ON `words`;--> statement-breakpoint
ALTER TABLE `achievements` ADD `user_id` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `achievements` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `activity` ADD `user_id` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `activity` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `achievements` ADD PRIMARY KEY(`user_id`,`code`);--> statement-breakpoint
ALTER TABLE `activity` ADD PRIMARY KEY(`user_id`,`day`);--> statement-breakpoint
ALTER TABLE `ai_messages` ADD `user_id` int;--> statement-breakpoint
ALTER TABLE `annotations` ADD `user_id` int;--> statement-breakpoint
ALTER TABLE `assessments` ADD `user_id` int;--> statement-breakpoint
ALTER TABLE `attempts` ADD `user_id` int;--> statement-breakpoint
ALTER TABLE `documents` ADD `user_id` int;--> statement-breakpoint
ALTER TABLE `documents` ADD `visibility` enum('private','public','groups') DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE `goals` ADD `user_id` int;--> statement-breakpoint
ALTER TABLE `ielts_attempts` ADD `user_id` int;--> statement-breakpoint
ALTER TABLE `labels` ADD `user_id` int;--> statement-breakpoint
ALTER TABLE `reading_sessions` ADD `user_id` int;--> statement-breakpoint
ALTER TABLE `review_logs` ADD `user_id` int;--> statement-breakpoint
ALTER TABLE `word_sets` ADD `user_id` int;--> statement-breakpoint
ALTER TABLE `words` ADD `user_id` int;--> statement-breakpoint
ALTER TABLE `writings` ADD `user_id` int;--> statement-breakpoint
ALTER TABLE `xp_events` ADD `user_id` int;--> statement-breakpoint
ALTER TABLE `labels` ADD CONSTRAINT `labels_user_kind_name` UNIQUE(`user_id`,`kind`,`name`);--> statement-breakpoint
ALTER TABLE `document_groups` ADD CONSTRAINT `document_groups_document_id_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_groups` ADD CONSTRAINT `document_groups_group_id_learner_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `learner_groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lesson_progress` ADD CONSTRAINT `lesson_progress_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lesson_progress` ADD CONSTRAINT `lesson_progress_lesson_id_lessons_id_fk` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `listen_positions` ADD CONSTRAINT `listen_positions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `listen_positions` ADD CONSTRAINT `listen_positions_source_id_listen_sources_id_fk` FOREIGN KEY (`source_id`) REFERENCES `listen_sources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `listen_progress` ADD CONSTRAINT `listen_progress_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `listen_progress` ADD CONSTRAINT `listen_progress_item_id_listen_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `listen_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_groups` ADD CONSTRAINT `user_groups_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_groups` ADD CONSTRAINT `user_groups_group_id_learner_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `learner_groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `document_groups_group` ON `document_groups` (`group_id`);--> statement-breakpoint
CREATE INDEX `listen_progress_due` ON `listen_progress` (`user_id`,`due`);--> statement-breakpoint
CREATE INDEX `user_groups_group` ON `user_groups` (`group_id`);--> statement-breakpoint
ALTER TABLE `ai_messages` ADD CONSTRAINT `ai_messages_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `annotations` ADD CONSTRAINT `annotations_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assessments` ADD CONSTRAINT `assessments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attempts` ADD CONSTRAINT `attempts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `goals` ADD CONSTRAINT `goals_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ielts_attempts` ADD CONSTRAINT `ielts_attempts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `labels` ADD CONSTRAINT `labels_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reading_sessions` ADD CONSTRAINT `reading_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_logs` ADD CONSTRAINT `review_logs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `word_sets` ADD CONSTRAINT `word_sets_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `words` ADD CONSTRAINT `words_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `writings` ADD CONSTRAINT `writings_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `xp_events` ADD CONSTRAINT `xp_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `words_due` ON `words` (`user_id`,`due`);