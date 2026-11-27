CREATE TABLE `credit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`amount` double NOT NULL,
	`balance` double NOT NULL,
	`kind` enum('signup','topup','admin','ai') NOT NULL,
	`note` varchar(255),
	`ai_call_id` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `credit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `topups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`credits` double NOT NULL,
	`price` int NOT NULL,
	`status` enum('pending','done','rejected') NOT NULL DEFAULT 'pending',
	`note` varchar(255),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`done_at` datetime(3),
	CONSTRAINT `topups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(191) NOT NULL,
	`name` varchar(100),
	`password_hash` varchar(255) NOT NULL,
	`role` enum('student','editor','admin') NOT NULL DEFAULT 'student',
	`features` json,
	`credits` double NOT NULL DEFAULT 0,
	`disabled` boolean NOT NULL DEFAULT false,
	`session_version` int NOT NULL DEFAULT 0,
	`last_login_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `ai_calls` ADD `user_id` int;--> statement-breakpoint
ALTER TABLE `ai_calls` ADD `credits` double;--> statement-breakpoint
ALTER TABLE `jobs` ADD `user_id` int;--> statement-breakpoint
ALTER TABLE `credit_logs` ADD CONSTRAINT `credit_logs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `topups` ADD CONSTRAINT `topups_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `credit_logs_user` ON `credit_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `topups_status` ON `topups` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `topups_user` ON `topups` (`user_id`);--> statement-breakpoint
ALTER TABLE `ai_calls` ADD CONSTRAINT `ai_calls_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ai_calls_user` ON `ai_calls` (`user_id`,`created_at`);