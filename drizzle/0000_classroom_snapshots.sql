CREATE TABLE `classroom_snapshots` (
  `id` integer PRIMARY KEY NOT NULL,
  `student_name` text NOT NULL,
  `synced_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `source_url` text NOT NULL,
  `status` text DEFAULT 'ok' NOT NULL,
  `error` text DEFAULT '' NOT NULL,
  `payload` text NOT NULL
);
