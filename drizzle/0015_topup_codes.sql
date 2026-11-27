ALTER TABLE `topups` ADD `code` varchar(20);--> statement-breakpoint
UPDATE `topups` SET `code` = CONCAT(COALESCE((SELECT JSON_UNQUOTE(JSON_EXTRACT(s.`value`, '$.prefix')) FROM `settings` s WHERE s.`key` = 'payments.sepay'), 'GN'), LPAD(`id`, 6, '0')) WHERE `code` IS NULL;--> statement-breakpoint
ALTER TABLE `topups` MODIFY `code` varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE `topups` ADD CONSTRAINT `topups_code_unique` UNIQUE(`code`);
