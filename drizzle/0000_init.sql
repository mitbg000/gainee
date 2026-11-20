CREATE TABLE `achievements` (
	`code` varchar(64) NOT NULL,
	`progress` int NOT NULL DEFAULT 0,
	`unlocked_at` datetime(3),
	CONSTRAINT `achievements_code` PRIMARY KEY(`code`)
);
--> statement-breakpoint
CREATE TABLE `activity` (
	`day` date NOT NULL,
	`minutes` int NOT NULL DEFAULT 0,
	`xp` int NOT NULL DEFAULT 0,
	`reviews` int NOT NULL DEFAULT 0,
	`lessons_done` int NOT NULL DEFAULT 0,
	`words_added` int NOT NULL DEFAULT 0,
	`goal_met` boolean NOT NULL DEFAULT false,
	`freeze_used` boolean NOT NULL DEFAULT false,
	`mood` tinyint,
	`reflection` text,
	CONSTRAINT `activity_day` PRIMARY KEY(`day`)
);
--> statement-breakpoint
CREATE TABLE `ai_calls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider_id` int,
	`model` varchar(100) NOT NULL,
	`task` varchar(50) NOT NULL,
	`prompt_tokens` int,
	`completion_tokens` int,
	`cost_usd` double,
	`ok` boolean NOT NULL,
	`error` text,
	`duration_ms` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ai_calls_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_providers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(32) NOT NULL,
	`label` varchar(100) NOT NULL,
	`base_url` varchar(500) NOT NULL,
	`api_key_enc` text NOT NULL,
	`default_model` varchar(100) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ai_providers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `answer_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attempt_id` int NOT NULL,
	`qtype` enum('tfng','ynng','mcq','gap','matching','heading','short') NOT NULL,
	`correct` boolean NOT NULL,
	`given` varchar(500),
	`expected` varchar(500),
	CONSTRAINT `answer_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assessments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` enum('reading_test','vocab_size','writing_task2','speaking') NOT NULL,
	`score` double NOT NULL,
	`max_score` double,
	`band` double,
	`detail` json,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `assessments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lesson_id` int NOT NULL,
	`score` int NOT NULL,
	`total` int NOT NULL,
	`duration_sec` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(500) NOT NULL,
	`author` varchar(255),
	`source` varchar(1000),
	`source_type` enum('paste','pdf','docx','txt','url') NOT NULL,
	`file_path` varchar(500),
	`raw_text` longtext NOT NULL,
	`word_count` int NOT NULL DEFAULT 0,
	`level` varchar(8),
	`tags` json,
	`status` enum('draft','processing','ready','error') NOT NULL DEFAULT 'draft',
	`error` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` enum('daily_minutes','daily_reviews','weekly_lessons','weekly_words','target_band','exam_date') NOT NULL,
	`target` double NOT NULL,
	`due_date` date,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `goals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(50) NOT NULL,
	`payload` json NOT NULL,
	`status` enum('queued','running','done','failed') NOT NULL DEFAULT 'queued',
	`attempts` int NOT NULL DEFAULT 0,
	`max_attempts` int NOT NULL DEFAULT 3,
	`progress` varchar(255),
	`result` json,
	`error` text,
	`run_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`started_at` datetime(3),
	`finished_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lesson_vocab` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lesson_id` int NOT NULL,
	`headword` varchar(191) NOT NULL,
	`match` varchar(191) NOT NULL,
	`ipa` varchar(191),
	`pos` varchar(32),
	`meaning_vi` text,
	`definition_en` text,
	`example` text,
	`note` text,
	`context` text,
	`cefr` varchar(4),
	CONSTRAINT `lesson_vocab_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`document_id` int NOT NULL,
	`position` int NOT NULL,
	`title` varchar(500) NOT NULL,
	`title_vi` varchar(500),
	`paragraphs` json NOT NULL,
	`word_count` int NOT NULL DEFAULT 0,
	`warmup` text,
	`summary` text,
	`content` json,
	`status` enum('pending','generating','ready','error') NOT NULL DEFAULT 'pending',
	`error` text,
	`completed_at` datetime(3),
	`best_score` int,
	`notes` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `lessons_id` PRIMARY KEY(`id`),
	CONSTRAINT `lessons_doc_pos` UNIQUE(`document_id`,`position`)
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` enum('image','audio','document') NOT NULL,
	`path` varchar(500) NOT NULL,
	`mime` varchar(100) NOT NULL,
	`bytes` int NOT NULL,
	`width` int,
	`height` int,
	`source` enum('paste','upload','url','ai') NOT NULL DEFAULT 'upload',
	`source_url` varchar(1000),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `media_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reading_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lesson_id` int NOT NULL,
	`seconds` int NOT NULL,
	`words` int NOT NULL,
	`wpm` int NOT NULL,
	`lookups` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `reading_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `review_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`word_id` int NOT NULL,
	`rating` tinyint NOT NULL,
	`mode` enum('recognize','recall','cloze','listen','spell','image') NOT NULL,
	`state_before` tinyint NOT NULL,
	`duration_ms` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `review_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` varchar(191) NOT NULL,
	`value` json NOT NULL,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `word_media` (
	`word_id` int NOT NULL,
	`media_id` int NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`caption` varchar(500),
	CONSTRAINT `word_media_word_id_media_id_pk` PRIMARY KEY(`word_id`,`media_id`)
);
--> statement-breakpoint
CREATE TABLE `words` (
	`id` int AUTO_INCREMENT NOT NULL,
	`term` varchar(191) NOT NULL,
	`ipa` varchar(191),
	`pos` varchar(32),
	`meaning_vi` text,
	`definition_en` text,
	`context` text,
	`example` text,
	`note` text,
	`mnemonic` text,
	`tags` json,
	`lesson_id` int,
	`lesson_vocab_id` int,
	`due` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`stability` double NOT NULL DEFAULT 0,
	`difficulty` double NOT NULL DEFAULT 0,
	`elapsed_days` int NOT NULL DEFAULT 0,
	`scheduled_days` int NOT NULL DEFAULT 0,
	`reps` int NOT NULL DEFAULT 0,
	`lapses` int NOT NULL DEFAULT 0,
	`state` tinyint NOT NULL DEFAULT 0,
	`last_review` datetime(3),
	`suspended` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `words_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `writings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lesson_id` int,
	`kind` enum('paraphrase','speaking','task1','task2','free') NOT NULL,
	`prompt` text,
	`body` longtext NOT NULL,
	`audio_media_id` int,
	`word_count` int NOT NULL DEFAULT 0,
	`band_overall` double,
	`band_1` double,
	`band_2` double,
	`band_3` double,
	`band_4` double,
	`feedback` json,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `writings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `xp_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` varchar(50) NOT NULL,
	`amount` int NOT NULL,
	`ref_type` varchar(50),
	`ref_id` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `xp_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ai_calls` ADD CONSTRAINT `ai_calls_provider_id_ai_providers_id_fk` FOREIGN KEY (`provider_id`) REFERENCES `ai_providers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `answer_logs` ADD CONSTRAINT `answer_logs_attempt_id_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attempts` ADD CONSTRAINT `attempts_lesson_id_lessons_id_fk` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lesson_vocab` ADD CONSTRAINT `lesson_vocab_lesson_id_lessons_id_fk` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lessons` ADD CONSTRAINT `lessons_document_id_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reading_sessions` ADD CONSTRAINT `reading_sessions_lesson_id_lessons_id_fk` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_logs` ADD CONSTRAINT `review_logs_word_id_words_id_fk` FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `word_media` ADD CONSTRAINT `word_media_word_id_words_id_fk` FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `word_media` ADD CONSTRAINT `word_media_media_id_media_id_fk` FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `words` ADD CONSTRAINT `words_lesson_id_lessons_id_fk` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `words` ADD CONSTRAINT `words_lesson_vocab_id_lesson_vocab_id_fk` FOREIGN KEY (`lesson_vocab_id`) REFERENCES `lesson_vocab`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `writings` ADD CONSTRAINT `writings_lesson_id_lessons_id_fk` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `writings` ADD CONSTRAINT `writings_audio_media_id_media_id_fk` FOREIGN KEY (`audio_media_id`) REFERENCES `media`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ai_calls_created` ON `ai_calls` (`created_at`);--> statement-breakpoint
CREATE INDEX `answer_logs_type` ON `answer_logs` (`qtype`);--> statement-breakpoint
CREATE INDEX `assessments_kind` ON `assessments` (`kind`,`created_at`);--> statement-breakpoint
CREATE INDEX `attempts_created` ON `attempts` (`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_pick` ON `jobs` (`status`,`run_at`);--> statement-breakpoint
CREATE INDEX `lesson_vocab_lesson` ON `lesson_vocab` (`lesson_id`);--> statement-breakpoint
CREATE INDEX `reading_sessions_created` ON `reading_sessions` (`created_at`);--> statement-breakpoint
CREATE INDEX `review_logs_created` ON `review_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `words_due` ON `words` (`due`);--> statement-breakpoint
CREATE INDEX `words_term` ON `words` (`term`);--> statement-breakpoint
CREATE INDEX `xp_events_created` ON `xp_events` (`created_at`);