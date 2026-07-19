import type { ArchivedAsset } from "./managebac";
import type { ClassroomSnapshot } from "./types";

const owner = "skoolng";
const repository = "schoolwork";
const branch = "main";
const apiRoot = `https://api.github.com/repos/${owner}/${repository}`;

interface SnapshotArchive {
  student: string;
  snapshot: ClassroomSnapshot;
  assets: ArchivedAsset[];
}

interface RepositoryStudent {
  key: string;
  name: string;
  syncedAt: string;
  status: string;
  historyCount: number;
}

async function githubRequest<T>(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${apiRoot}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub archive request failed (${response.status} ${response.statusText}).`,
    );
  }

  return (await response.json()) as T;
}

function bytesToBase64(bytes: Uint8Array) {
  let result = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    result += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(result);
}

async function createBlob(
  token: string,
  content: string | Uint8Array,
  encoding: "utf-8" | "base64",
) {
  const bodyContent =
    typeof content === "string" ? content : bytesToBase64(content);
  return githubRequest<{ sha: string }>(token, "/git/blobs", {
    method: "POST",
    body: JSON.stringify({ content: bodyContent, encoding }),
  });
}

async function readIndex(token: string) {
  try {
    const response = await githubRequest<{ content: string }>(
      token,
      "/contents/data/classroom/index.json",
    );
    return JSON.parse(atob(response.content.replace(/\s/g, ""))) as {
      students: RepositoryStudent[];
    };
  } catch {
    return { students: [] as RepositoryStudent[] };
  }
}

export async function commitSnapshotArchives(
  token: string,
  archives: SnapshotArchive[],
) {
  const reference = await githubRequest<{ object: { sha: string } }>(
    token,
    `/git/ref/heads/${branch}`,
  );
  const parent = await githubRequest<{ tree: { sha: string } }>(
    token,
    `/git/commits/${reference.object.sha}`,
  );
  const existingIndex = await readIndex(token);
  const entries: Array<{
    path: string;
    mode: "100644";
    type: "blob";
    sha: string;
  }> = [];

  for (const archive of archives) {
    for (const asset of archive.assets) {
      const blob = await createBlob(token, asset.content, "base64");
      entries.push({ path: asset.path, mode: "100644", type: "blob", sha: blob.sha });
    }

    const snapshotJson = `${JSON.stringify(archive.snapshot, null, 2)}\n`;
    const snapshotBlob = await createBlob(token, snapshotJson, "utf-8");
    const timestamp = archive.snapshot.syncedAt.replace(/[:.]/g, "-");
    entries.push(
      {
        path: `data/classroom/${archive.student}/latest.json`,
        mode: "100644",
        type: "blob",
        sha: snapshotBlob.sha,
      },
      {
        path: `data/classroom/${archive.student}/history/${timestamp}.json`,
        mode: "100644",
        type: "blob",
        sha: snapshotBlob.sha,
      },
    );
  }

  const updatedStudents = archives.map((archive) => {
    const previous = existingIndex.students.find(
      (student) => student.key === archive.student,
    );
    return {
      key: archive.student,
      name: archive.snapshot.studentName,
      syncedAt: archive.snapshot.syncedAt,
      status: archive.snapshot.status,
      historyCount: (previous?.historyCount ?? 0) + 1,
    };
  });
  const untouchedStudents = existingIndex.students.filter(
    (student) => !archives.some((archive) => archive.student === student.key),
  );
  const indexBlob = await createBlob(
    token,
    `${JSON.stringify({ students: [...updatedStudents, ...untouchedStudents] }, null, 2)}\n`,
    "utf-8",
  );
  entries.push({
    path: "data/classroom/index.json",
    mode: "100644",
    type: "blob",
    sha: indexBlob.sha,
  });

  const tree = await githubRequest<{ sha: string }>(token, "/git/trees", {
    method: "POST",
    body: JSON.stringify({ base_tree: parent.tree.sha, tree: entries }),
  });
  const commit = await githubRequest<{ sha: string }>(token, "/git/commits", {
    method: "POST",
    body: JSON.stringify({
      message: "Archive classroom snapshot and assets",
      tree: tree.sha,
      parents: [reference.object.sha],
    }),
  });
  await githubRequest(token, `/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return {
    commit: commit.sha,
    assets: archives.reduce((total, archive) => total + archive.assets.length, 0),
  };
}
