import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import {
  classroomSnapshotHistory,
  classroomSnapshots,
} from "../../../db/schema";
import { getDb } from "../../../db";
import { commitSnapshotArchives } from "../../../lib/github-archive";
import {
  readManageBacCredentials,
  scrapeManageBacWithAssets,
} from "../../../lib/managebac";
import type { ArchivedAsset } from "../../../lib/managebac";
import type { ClassroomSnapshot } from "../../../lib/types";

const runtimeEnv = env as unknown as Record<string, string | undefined>;

interface StudentDefinition {
  key: string;
  fallbackName: string;
  login?: string;
  password?: string;
}

function assertSyncSecret(request: Request) {
  const expected = runtimeEnv.SYNC_SECRET;
  const received = request.headers.get("x-sync-secret") ?? "";

  if (!expected || received !== expected) {
    return Response.json({ error: "Unauthorized sync request." }, { status: 401 });
  }

  return null;
}

function configuredStudents(): StudentDefinition[] {
  return [
    {
      key: "advika",
      fallbackName: "Advika Lakshmi",
      login: runtimeEnv.MANAGEBAC_LOGIN,
      password: runtimeEnv.MANAGEBAC_PASSWORD,
    },
    {
      key: "adrika",
      fallbackName: "Adrika Lakshmi",
      login: runtimeEnv.MANAGEBAC_ADRIKA_LOGIN,
      password: runtimeEnv.MANAGEBAC_ADRIKA_PASSWORD,
    },
  ];
}

async function saveSnapshot(studentKey: string, snapshot: ClassroomSnapshot) {
  const db = getDb();
  const values = {
    studentKey,
    studentName: snapshot.studentName,
    syncedAt: snapshot.syncedAt,
    sourceUrl: snapshot.sourceUrl,
    status: snapshot.status,
    error: "",
    payload: JSON.stringify(snapshot),
  };

  await db
    .insert(classroomSnapshots)
    .values(values)
    .onConflictDoUpdate({
      target: classroomSnapshots.studentKey,
      set: values,
    });

  await db.insert(classroomSnapshotHistory).values(values);
}

async function saveSyncError(student: StudentDefinition, message: string) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(classroomSnapshots)
    .where(eq(classroomSnapshots.studentKey, student.key))
    .limit(1);
  const syncedAt = new Date().toISOString();
  const values = {
    studentKey: student.key,
    studentName: existing?.studentName ?? student.fallbackName,
    syncedAt,
    sourceUrl:
      existing?.sourceUrl ?? "https://thegaudium.managebac.com/student/home",
    status: "error",
    error: message,
    payload: existing?.payload ?? JSON.stringify({}),
  };

  await db
    .insert(classroomSnapshots)
    .values(values)
    .onConflictDoUpdate({
      target: classroomSnapshots.studentKey,
      set: {
        syncedAt,
        status: "error",
        error: message,
      },
    });
}

function summarize(studentKey: string, snapshot: ClassroomSnapshot) {
  return {
    student: studentKey,
    studentName: snapshot.studentName,
    syncedAt: snapshot.syncedAt,
    assignments: snapshot.assignments.length,
    classes: snapshot.classes.length,
    discussions: snapshot.classes.reduce(
      (sum, classroom) => sum + classroom.discussions.length,
      0,
    ),
    files: snapshot.classes.reduce(
      (sum, classroom) => sum + classroom.files.length,
      0,
    ),
    discussionImages: snapshot.classes.reduce(
      (sum, classroom) =>
        sum +
        classroom.discussions.reduce(
          (discussionSum, discussion) =>
            discussionSum + (discussion.images?.length ?? 0),
          0,
        ),
      0,
    ),
  };
}

export async function POST(request: Request) {
  const rejected = assertSyncSecret(request);
  if (rejected) return rejected;

  const requestedStudent = new URL(request.url).searchParams.get("student");
  const githubToken = request.headers.get("x-github-token")?.trim();
  if (!githubToken) {
    return Response.json(
      { error: "A short-lived GitHub Actions token is required." },
      { status: 400 },
    );
  }
  const definitions = configuredStudents();
  const targets = requestedStudent
    ? definitions.filter((student) => student.key === requestedStudent)
    : definitions;

  if (!targets.length) {
    return Response.json({ error: "Unknown student key." }, { status: 404 });
  }

  const results: Array<Record<string, unknown>> = [];
  const snapshots: Array<{
    student: string;
    snapshot: ClassroomSnapshot;
    assets: ArchivedAsset[];
  }> = [];
  let failed = false;

  for (const student of targets) {
    try {
      const archived = await scrapeManageBacWithAssets(
        readManageBacCredentials({
          MANAGEBAC_BASE_URL: runtimeEnv.MANAGEBAC_BASE_URL,
          MANAGEBAC_LOGIN: student.login,
          MANAGEBAC_PASSWORD: student.password,
        }),
        student.key,
      );
      const { snapshot, assets } = archived;
      await saveSnapshot(student.key, snapshot);
      snapshots.push({ student: student.key, snapshot, assets });
      results.push({
        ok: true,
        ...summarize(student.key, snapshot),
        archivedAssets: assets.length,
      });
    } catch (error) {
      failed = true;
      const message =
        error instanceof Error ? error.message : "ManageBac sync failed.";
      try {
        await saveSyncError(student, message);
      } catch {
        // Keep the per-student sync response useful if the error write fails.
      }
      results.push({ ok: false, student: student.key, error: message });
    }
  }

  let repository: { commit: string; assets: number } | null = null;
  if (!failed && snapshots.length) {
    try {
      repository = await commitSnapshotArchives(githubToken, snapshots);
    } catch (error) {
      failed = true;
      results.push({
        ok: false,
        repository: true,
        error:
          error instanceof Error
            ? error.message
            : "Repository archive commit failed.",
      });
    }
  }

  return Response.json(
    { ok: !failed, students: results, repository },
    { status: failed ? 500 : 200 },
  );
}
