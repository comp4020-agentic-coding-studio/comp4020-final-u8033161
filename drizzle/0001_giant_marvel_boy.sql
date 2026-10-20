CREATE TABLE `participants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`room_id` integer NOT NULL,
	`token` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `participants_public_id_unique` ON `participants` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `participants_token_unique` ON `participants` (`token`);--> statement-breakpoint
ALTER TABLE `cards` ADD `participant_id` text REFERENCES participants(public_id);