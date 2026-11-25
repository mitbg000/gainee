CREATE TABLE `ielts_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`test_id` int NOT NULL,
	`section_id` int,
	`mode` enum('mock','practice') NOT NULL,
	`skill` enum('listening','reading','writing','full') NOT NULL,
	`answers` json NOT NULL,
	`detail` json NOT NULL,
	`score` int,
	`total` int,
	`band` double,
	`seconds` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ielts_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ielts_audio` (
	`id` int AUTO_INCREMENT NOT NULL,
	`book_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`path` varchar(255) NOT NULL,
	`size` int NOT NULL,
	`received` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ielts_audio_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ielts_books` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(191) NOT NULL,
	`status` enum('uploading','parsing','review','failed') NOT NULL DEFAULT 'uploading',
	`page_count` int NOT NULL DEFAULT 0,
	`error` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ielts_books_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ielts_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`book_id` int NOT NULL,
	`page` int NOT NULL,
	`text` longtext,
	`image_path` varchar(255),
	`ocr` boolean NOT NULL DEFAULT false,
	CONSTRAINT `ielts_pages_id` PRIMARY KEY(`id`),
	CONSTRAINT `ielts_pages_book_page` UNIQUE(`book_id`,`page`)
);
--> statement-breakpoint
CREATE TABLE `ielts_sections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`test_id` int NOT NULL,
	`skill` enum('listening','reading','writing') NOT NULL,
	`part` int NOT NULL,
	`title` varchar(255),
	`content` json NOT NULL,
	`answers` json NOT NULL,
	`transcript` longtext,
	`audio` json,
	`pages` json NOT NULL,
	`reviewed` boolean NOT NULL DEFAULT false,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ielts_sections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ielts_tests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`book_id` int NOT NULL,
	`number` int NOT NULL,
	`title` varchar(191) NOT NULL,
	CONSTRAINT `ielts_tests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ielts_attempts` ADD CONSTRAINT `ielts_attempts_test_id_ielts_tests_id_fk` FOREIGN KEY (`test_id`) REFERENCES `ielts_tests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ielts_attempts` ADD CONSTRAINT `ielts_attempts_section_id_ielts_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `ielts_sections`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ielts_audio` ADD CONSTRAINT `ielts_audio_book_id_ielts_books_id_fk` FOREIGN KEY (`book_id`) REFERENCES `ielts_books`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ielts_pages` ADD CONSTRAINT `ielts_pages_book_id_ielts_books_id_fk` FOREIGN KEY (`book_id`) REFERENCES `ielts_books`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ielts_sections` ADD CONSTRAINT `ielts_sections_test_id_ielts_tests_id_fk` FOREIGN KEY (`test_id`) REFERENCES `ielts_tests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ielts_tests` ADD CONSTRAINT `ielts_tests_book_id_ielts_books_id_fk` FOREIGN KEY (`book_id`) REFERENCES `ielts_books`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ielts_attempts_created` ON `ielts_attempts` (`created_at`);--> statement-breakpoint
CREATE INDEX `ielts_attempts_section` ON `ielts_attempts` (`section_id`);--> statement-breakpoint
CREATE INDEX `ielts_sections_test` ON `ielts_sections` (`test_id`,`skill`,`part`);--> statement-breakpoint
CREATE INDEX `ielts_tests_book` ON `ielts_tests` (`book_id`,`number`);