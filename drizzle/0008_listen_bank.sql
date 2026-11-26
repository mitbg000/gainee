CREATE TABLE `listen_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source_id` int NOT NULL,
	`idx` int NOT NULL,
	`start` double NOT NULL,
	`end` double NOT NULL,
	`text` text NOT NULL,
	`speaker` varchar(64),
	`confidence` double,
	`rate` double NOT NULL DEFAULT 0,
	`hidden` boolean NOT NULL DEFAULT false,
	`round` int NOT NULL DEFAULT 0,
	`seen_at` datetime(3),
	`tries` int NOT NULL DEFAULT 0,
	`clean` int NOT NULL DEFAULT 0,
	`due` datetime(3),
	`interval` int NOT NULL DEFAULT 0,
	`lapses` int NOT NULL DEFAULT 0,
	`misses` json,
	CONSTRAINT `listen_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `listen_sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` enum('youtube','ielts') NOT NULL,
	`youtube_id` varchar(20),
	`section_id` int,
	`title` varchar(255) NOT NULL,
	`captions` enum('manual','auto','pasted','script') NOT NULL,
	`shift` double NOT NULL DEFAULT 0,
	`reviewed` boolean NOT NULL DEFAULT false,
	`position` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `listen_sources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `words` ADD `listen_source_id` int;--> statement-breakpoint
ALTER TABLE `listen_items` ADD CONSTRAINT `listen_items_source_id_listen_sources_id_fk` FOREIGN KEY (`source_id`) REFERENCES `listen_sources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `listen_sources` ADD CONSTRAINT `listen_sources_section_id_ielts_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `ielts_sections`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `listen_items_source` ON `listen_items` (`source_id`,`idx`);--> statement-breakpoint
CREATE INDEX `listen_items_due` ON `listen_items` (`due`);--> statement-breakpoint
ALTER TABLE `words` ADD CONSTRAINT `words_listen_source_id_listen_sources_id_fk` FOREIGN KEY (`listen_source_id`) REFERENCES `listen_sources`(`id`) ON DELETE set null ON UPDATE no action;