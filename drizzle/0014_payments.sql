CREATE TABLE `payments` (
	`id` bigint NOT NULL,
	`topup_id` int,
	`amount` int NOT NULL,
	`content` varchar(500) NOT NULL,
	`status` enum('paid','underpaid','unmatched','settled') NOT NULL,
	`raw` json NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `payments_topup` ON `payments` (`topup_id`);--> statement-breakpoint
CREATE INDEX `payments_status` ON `payments` (`status`,`created_at`);