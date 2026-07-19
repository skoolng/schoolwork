import type { ClassroomSnapshot } from "./types";

function cleanNotifications(snapshot: ClassroomSnapshot): ClassroomSnapshot {
  const notifications = snapshot.notifications.filter((notification) => {
    if (!/^https?:\/\//i.test(notification.url)) return false;
    if (/notifications shown by ManageBac/i.test(notification.title)) return true;

    try {
      return /^\/student\/notifications\/.+/i.test(
        new URL(notification.url).pathname,
      );
    } catch {
      return false;
    }
  });

  return { ...snapshot, notifications };
}

const rawDataRoot =
  "https://raw.githubusercontent.com/skoolng/schoolwork/main/data/classroom";

interface RepositoryStudent {
  key: string;
  name: string;
  syncedAt: string;
  status: string;
  historyCount: number;
}

interface RepositoryIndex {
  students: RepositoryStudent[];
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${rawDataRoot}/${path}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`GitHub data request failed with ${response.status}.`);
  }

  return (await response.json()) as T;
}

export async function readRepositorySnapshot(studentKey: string) {
  const index = await fetchJson<RepositoryIndex>("index.json");
  const selected =
    index.students.find((student) => student.key === studentKey) ??
    index.students.find((student) => student.key === "advika") ??
    index.students[0];

  if (!selected) return null;

  const snapshot = cleanNotifications(
    await fetchJson<ClassroomSnapshot>(
      `${encodeURIComponent(selected.key)}/latest.json`,
    ),
  );

  return {
    snapshot,
    students: index.students.map(({ historyCount: _historyCount, ...student }) =>
      student,
    ),
    selectedStudent: selected.key,
    historyCount: selected.historyCount,
  };
}
