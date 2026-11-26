CREATE TABLE `listen_speech` (
	`section_id` int NOT NULL,
	`file_id` int NOT NULL,
	`start` double NOT NULL,
	`end` double,
	`heard` json NOT NULL,
	`quiet` json NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `listen_speech_section_id` PRIMARY KEY(`section_id`)
);
--> statement-breakpoint
ALTER TABLE `listen_speech` ADD CONSTRAINT `listen_speech_section_id_ielts_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `ielts_sections`(`id`) ON DELETE cascade ON UPDATE no action;