CREATE TABLE `drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meeting_id` integer NOT NULL,
	`voice_version` integer NOT NULL,
	`model` text NOT NULL,
	`facts` text NOT NULL,
	`ai_email` text NOT NULL,
	`flags` text NOT NULL,
	`to` text DEFAULT '' NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`notion_page_id` text,
	`sent_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `eval_cases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`meeting_type` text DEFAULT 'general' NOT NULL,
	`transcript` text NOT NULL,
	`sent_email` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `eval_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`model` text NOT NULL,
	`voice_version` integer NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`results` text DEFAULT '[]' NOT NULL,
	`recall` real,
	`invented_facts` integer,
	`tone_score` real,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `examples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meeting_type` text DEFAULT 'general' NOT NULL,
	`title` text NOT NULL,
	`transcript` text,
	`facts` text DEFAULT '' NOT NULL,
	`email` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meetings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_id` text NOT NULL,
	`source` text NOT NULL,
	`topic` text NOT NULL,
	`meeting_type` text DEFAULT 'general' NOT NULL,
	`start_time` integer,
	`zoom_meeting_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`processing_started_at` integer,
	`transcript_raw` text,
	`transcript_clean` text,
	`attendees` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meetings_external_id` ON `meetings` (`external_id`);--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`draft_id` integer NOT NULL,
	`proposal` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`applied_version` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `drafts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meeting_id` integer,
	`step` text NOT NULL,
	`status` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `voice_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version` integer NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`playbook` text NOT NULL,
	`rules` text NOT NULL,
	`templates` text DEFAULT '[]' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
