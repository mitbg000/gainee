CREATE TABLE `coupon_uses` (
	`coupon_id` int NOT NULL,
	`user_id` int NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `coupon_uses_coupon_id_user_id_pk` PRIMARY KEY(`coupon_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(40) NOT NULL,
	`kind` enum('gift','discount') NOT NULL,
	`credits` double NOT NULL DEFAULT 0,
	`percent` int NOT NULL DEFAULT 0,
	`amount` int NOT NULL DEFAULT 0,
	`max_uses` int,
	`used` int NOT NULL DEFAULT 0,
	`expires_at` datetime(3),
	`active` boolean NOT NULL DEFAULT true,
	`note` varchar(255),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `coupons_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `login_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`login` varchar(191) NOT NULL,
	`ip` varchar(64) NOT NULL,
	`ok` boolean NOT NULL,
	`reason` varchar(40),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `login_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `credit_logs` MODIFY COLUMN `kind` enum('signup','topup','admin','ai','gift') NOT NULL;--> statement-breakpoint
ALTER TABLE `topups` ADD `coupon_id` int;--> statement-breakpoint
ALTER TABLE `topups` ADD `discount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `avatar` varchar(255);--> statement-breakpoint
ALTER TABLE `coupon_uses` ADD CONSTRAINT `coupon_uses_coupon_id_coupons_id_fk` FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coupon_uses` ADD CONSTRAINT `coupon_uses_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `login_logs_created` ON `login_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `login_logs_user` ON `login_logs` (`user_id`);