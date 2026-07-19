import { env } from "cloudflare:workers";
import { readRepositorySnapshot } from "../../../lib/github-data";
import { buildWeeklyJournal } from "../../../lib/weekly-journal";
import type { WeeklyJournal, WeeklyJournalIndexItem } from "../../../lib/types";

const runtimeEnv = env as unknown as Record<string, string | undefined>;
const rawRoot =
  "https://raw.githubusercontent.com/skoolng/schoolwork/main/data/weekly-journal";

function assertSyncSecret(request: Request) {
  const expected = runtimeEnv.SYNC_SECRET;
  const received = request.headers.get("x-sync-secret") ?? "";
  return Boolean(expected && received === expected);
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Journal request failed with ${response.status}.`);
  return (await response.json()) as T;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const student = url.searchParams.get("student") ?? "advika";
  const requestedWeek = url.searchParams.get("week");
  try {
    const index = await readJson<{ journals: WeeklyJournalIndexItem[] }>(
      `${rawRoot}/${encodeURIComponent(student)}/index.json`,
    );
    const week = requestedWeek ?? index.journals[0]?.weekKey;
    if (!week) return Response.json({ journal: null, journals: [] });
    const journal = await readJson<WeeklyJournal>(
      `${rawRoot}/${encodeURIComponent(student)}/${encodeURIComponent(week)}.json`,
    );
    return Response.json({ journal, journals: index.journals });
  } catch {
    return Response.json({ journal: null, journals: [] });
  }
}

export async function POST(request: Request) {
  if (!assertSyncSecret(request)) {
    return Response.json({ error: "Unauthorized journal request." }, { status: 401 });
  }
  const student = new URL(request.url).searchParams.get("student") ?? "advika";
  const classroom = await readRepositorySnapshot(student);
  if (!classroom) {
    return Response.json({ error: "No classroom snapshot is available." }, { status: 404 });
  }
  return Response.json({
    ok: true,
    journal: buildWeeklyJournal(classroom.selectedStudent, classroom.snapshot),
  });
}
