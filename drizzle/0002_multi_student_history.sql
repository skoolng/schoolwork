ALTER TABLE `classroom_snapshots`
ADD COLUMN `student_key` text DEFAULT 'advika' NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `classroom_snapshots_student_key_unique`
ON `classroom_snapshots` (`student_key`);
--> statement-breakpoint
CREATE TABLE `classroom_snapshot_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_key` text NOT NULL,
	`student_name` text NOT NULL,
	`synced_at` text NOT NULL,
	`source_url` text NOT NULL,
	`status` text DEFAULT 'ok' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `classroom_snapshot_history_student_synced_idx`
ON `classroom_snapshot_history` (`student_key`, `synced_at`);
--> statement-breakpoint
INSERT INTO `classroom_snapshot_history` (
	`student_key`,
	`student_name`,
	`synced_at`,
	`source_url`,
	`status`,
	`error`,
	`payload`
)
SELECT
	`student_key`,
	`student_name`,
	`synced_at`,
	`source_url`,
	`status`,
	`error`,
	`payload`
FROM `classroom_snapshots`;
