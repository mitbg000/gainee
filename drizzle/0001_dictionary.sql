CREATE TABLE `dict_aliases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dict` varchar(32) NOT NULL,
	`lookup_key` varchar(191) NOT NULL,
	`entry_id` int NOT NULL,
	CONSTRAINT `dict_aliases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dict_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dict` varchar(32) NOT NULL,
	`headword` varchar(191) NOT NULL,
	`lookup_key` varchar(191) NOT NULL,
	`html` longtext NOT NULL,
	CONSTRAINT `dict_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `dict_aliases` ADD CONSTRAINT `dict_aliases_entry_id_dict_entries_id_fk` FOREIGN KEY (`entry_id`) REFERENCES `dict_entries`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `dict_aliases_key` ON `dict_aliases` (`lookup_key`);--> statement-breakpoint
CREATE INDEX `dict_aliases_dict` ON `dict_aliases` (`dict`);--> statement-breakpoint
CREATE INDEX `dict_entries_key` ON `dict_entries` (`lookup_key`);--> statement-breakpoint
CREATE INDEX `dict_entries_dict` ON `dict_entries` (`dict`);