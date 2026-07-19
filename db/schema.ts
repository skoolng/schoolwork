import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const classroomSnapshots = sqliteTable(
  "classroom_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    studentKey: text("student_key").notNull().default("advika"),
    studentName: text("student_name").notNull(),
    syncedAt: text("synced_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    sourceUrl: text("source_url").notNull(),
    status: text("status").notNull().default("ok"),
    error: text("error").notNull().default(""),
    payload: text("payload").notNull(),
  },
  (table) => [
    uniqueIndex("classroom_snapshots_student_key_unique").on(table.studentKey),
  ],
);

export const classroomSnapshotHistory = sqliteTable(
  "classroom_snapshot_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    studentKey: text("student_key").notNull(),
    studentName: text("student_name").notNull(),
    syncedAt: text("synced_at").notNull(),
    sourceUrl: text("source_url").notNull(),
    status: text("status").notNull().default("ok"),
    error: text("error").notNull().default(""),
    payload: text("payload").notNull(),
  },
  (table) => [
    index("classroom_snapshot_history_student_synced_idx").on(
      table.studentKey,
      table.syncedAt,
    ),
  ],
);
