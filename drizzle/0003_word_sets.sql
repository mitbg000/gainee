CREATE TABLE `word_set_items` (
	`set_id` int NOT NULL,
	`word_id` int NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	CONSTRAINT `word_set_items_set_id_word_id_pk` PRIMARY KEY(`set_id`,`word_id`)
);
--> statement-breakpoint
CREATE TABLE `word_sets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(191) NOT NULL,
	`description` varchar(1000),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `word_sets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `word_set_items` ADD CONSTRAINT `word_set_items_set_id_word_sets_id_fk` FOREIGN KEY (`set_id`) REFERENCES `word_sets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `word_set_items` ADD CONSTRAINT `word_set_items_word_id_words_id_fk` FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `word_set_items_word` ON `word_set_items` (`word_id`);