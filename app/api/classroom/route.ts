import { count, eq } from "drizzle-orm";
import {
  classroomSnapshotHistory,
  classroomSnapshots,
} from "../../../db/schema";
import { getDb } from "../../../db";
import type { ClassroomSnapshot } from "../../../lib/types";

function fallbackSnapshot(studentKey = "advika"): ClassroomSnapshot {
  return {
    studentName: studentKey === "adrika" ? "Adrika Lakshmi" : "Advika Lakshmi",
    syncedAt: "",
    sourceUrl: "https://thegaudium.managebac.com/student/home",
    status: "pending",
    error: "",
    notifications: [],
    classes: [],
    assignments: [],
    calendar: [],
  };
}

export async function GET(request: Request) {
  const requestedKey = new URL(request.url).searchParams.get("student") ?? "advika";

  try {
    const db = getDb();
    const rows = await db.select().from(classroomSnapshots);
    const selectedRow =
      rows.find((row) => row.studentKey === requestedKey) ??
      rows.find((row) => row.studentKey === "advika") ??
      rows[0];
    const selectedKey = selectedRow?.studentKey ?? requestedKey;
    const [history] = await db
      .select({ value: count() })
      .from(classroomSnapshotHistory)
      .where(eq(classroomSnapshotHistory.studentKey, selectedKey));

    if (!selectedRow) {
      return Response.json({
        snapshot: fallbackSnapshot(requestedKey),
        students: [],
        selectedStudent: requestedKey,
        historyCount: history?.value ?? 0,
      });
    }

    return Response.json({
      snapshot: {
        ...JSON.parse(selectedRow.payload),
        studentName: selectedRow.studentName,
        syncedAt: selectedRow.syncedAt,
        sourceUrl: selectedRow.sourceUrl,
        status: selectedRow.status,
        error: selectedRow.error,
      },
      students: rows
        .map((row) => ({
          key: row.studentKey,
          name: row.studentName,
          syncedAt: row.syncedAt,
          status: row.status,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      selectedStudent: selectedKey,
      historyCount: history?.value ?? 0,
    });
  } catch (error) {
    return Response.json({
      snapshot: {
        ...fallbackSnapshot(requestedKey),
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Unable to read the classroom snapshot.",
      },
      students: [],
      selectedStudent: requestedKey,
      historyCount: 0,
    });
  }
}
