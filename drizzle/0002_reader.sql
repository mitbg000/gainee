CREATE TABLE `ai_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lesson_id` int,
	`annotation_id` int,
	`action` enum('explain_word','explain_sentence','grammar','translate','paraphrase','custom') NOT NULL,
	`selection` text,
	`context` text,
	`question` text,
	`answer` longtext,
	`provider_id` int,
	`model` varchar(100),
	`pinned` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ai_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `annotations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lesson_id` int NOT NULL,
	`paragraph` int NOT NULL,
	`start_offset` int NOT NULL,
	`end_offset` int NOT NULL,
	`quote` varchar(1000) NOT NULL,
	`prefix` varchar(64),
	`suffix` varchar(64),
	`color` enum('yellow','green','blue','pink','purple') NOT NULL DEFAULT 'yellow',
	`note` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `annotations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ai_messages` ADD CONSTRAINT `ai_messages_lesson_id_lessons_id_fk` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_messages` ADD CONSTRAINT `ai_messages_annotation_id_annotations_id_fk` FOREIGN KEY (`annotation_id`) REFERENCES `annotations`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_messages` ADD CONSTRAINT `ai_messages_provider_id_ai_providers_id_fk` FOREIGN KEY (`provider_id`) REFERENCES `ai_providers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `annotations` ADD CONSTRAINT `annotations_lesson_id_lessons_id_fk` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ai_messages_lesson` ON `ai_messages` (`lesson_id`);--> statement-breakpoint
CREATE INDEX `annotations_lesson` ON `annotations` (`lesson_id`,`paragraph`);