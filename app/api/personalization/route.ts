import { env } from "cloudflare:workers";
import {
  emptyPersonalization,
  type ItemNote,
  type MyNote,
  type PersonalizationDocument,
  type PersonalizationItem,
  type PersonalizationMutation,
  type PersonalizationUpload,
} from "../../../lib/personalization";
import type { Attachment } from "../../../lib/types";

const runtimeEnv = env as unknown as Record<string, string | undefined>;
const DEFAULT_REPOSITORY = "skoolng/schoolwork";
const DEFAULT_BRANCH = "main";
const MAX_REQUEST_BYTES = 9 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_UPLOADS = 8;
const ALLOWED_STUDENTS = new Set(["advika", "adrika"]);
const ALLOWED_CONTENT_TYPES = new Set([
  "application/msword",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/plain",
]);

class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

interface GitReference {
  object: { sha: string };
}

interface GitCommit {
  tree: { sha: string };
}

interface GitBlob {
  sha: string;
}

interface GitTree {
  sha: string;
}

interface GitHubContent {
  content?: string;
}

interface PreparedUpload {
  path: string;
  attachment: Attachment;
  contentBase64: string;
}

function repositoryConfig() {
  const repository =
    runtimeEnv.GITHUB_PERSONALIZATION_REPO?.trim() || DEFAULT_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("The personalization repository configuration is invalid.");
  }
  return {
    repository,
    branch:
      runtimeEnv.GITHUB_PERSONALIZATION_BRANCH?.trim() || DEFAULT_BRANCH,
    token: runtimeEnv.GITHUB_PERSONALIZATION_TOKEN?.trim() || "",
  };
}

function githubHeaders(token: string) {
  const headers = new Headers({
    accept: "application/vnd.github+json",
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28",
  });
  if (token) headers.set("authorization", `Bearer ${token}`);
  return headers;
}

async function githubRequest<T>(
  repository: string,
  path: string,
  token: string,
  init: RequestInit = {},
) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    ...init,
    headers: new Headers({
      ...Object.fromEntries(githubHeaders(token)),
      ...Object.fromEntries(new Headers(init.headers)),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new GitHubError(`GitHub request failed with ${response.status}.`, response.status);
  }
  return (await response.json()) as T;
}

function decodeBase64Text(value: string) {
  const binary = atob(value.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeStudent(value: string | null) {
  const student = value?.trim().toLowerCase() ?? "";
  return ALLOWED_STUDENTS.has(student) ? student : "";
}

function safeFilename(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "attachment"
  );
}

function safeItem(value: unknown): PersonalizationItem {
  const input = value as Partial<PersonalizationItem>;
  const id = text(input.id, 400);
  const title = text(input.title, 300);
  if (!id || !title) throw new Error("The saved item is missing an id or title.");

  const attachments = Array.isArray(input.attachments)
    ? input.attachments
        .slice(0, 30)
        .map((attachment) => ({
          name: text(attachment?.name, 180),
          url: text(attachment?.url, 1600),
          sourceUrl: text(attachment?.sourceUrl, 1600) || undefined,
          mappedAt: text(attachment?.mappedAt, 80) || undefined,
        }))
        .filter((attachment) => /^https?:\/\//i.test(attachment.url))
    : [];

  return {
    id,
    category: text(input.category, 80) || "Saved item",
    title,
    summary: text(input.summary, 12000),
    source: text(input.source, 300),
    sourceUrl: /^https?:\/\//i.test(text(input.sourceUrl, 1600))
      ? text(input.sourceUrl, 1600)
      : undefined,
    createdAt: text(input.createdAt, 80) || undefined,
    attachments,
  };
}

function validateUploads(value: unknown): PersonalizationUpload[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_UPLOADS) {
    throw new Error(`A note can include up to ${MAX_UPLOADS} files.`);
  }

  return value.map((upload) => {
    const input = upload as Partial<PersonalizationUpload>;
    const name = safeFilename(text(input.name, 180));
    const contentType = text(input.contentType, 120).toLowerCase();
    const contentBase64 = text(input.contentBase64, MAX_REQUEST_BYTES * 2).replace(
      /^data:[^;]+;base64,/i,
      "",
    );
    const estimatedBytes = Math.floor((contentBase64.length * 3) / 4);
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new Error(`${name} uses a file type that is not supported.`);
    }
    if (!contentBase64 || estimatedBytes > MAX_UPLOAD_BYTES) {
      throw new Error(`${name} must be smaller than 5 MB.`);
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(contentBase64)) {
      throw new Error(`${name} does not contain a valid file payload.`);
    }
    return { name, contentType, contentBase64 };
  });
}

function normalizeDocument(value: unknown, studentKey: string) {
  const input = value as Partial<PersonalizationDocument> | null;
  const empty = emptyPersonalization(studentKey);
  if (!input || input.studentKey !== studentKey) return empty;
  return {
    ...empty,
    updatedAt: text(input.updatedAt, 80),
    favorites: Array.isArray(input.favorites) ? input.favorites : [],
    itemNotes: Array.isArray(input.itemNotes) ? input.itemNotes : [],
    notes: Array.isArray(input.notes) ? input.notes : [],
  } satisfies PersonalizationDocument;
}

async function readDocument(
  repository: string,
  branch: string,
  token: string,
  studentKey: string,
) {
  const path = `/contents/data/personalization/${studentKey}/index.json?ref=${encodeURIComponent(
    branch,
  )}`;
  try {
    const response = await githubRequest<GitHubContent>(repository, path, token);
    if (!response.content) return emptyPersonalization(studentKey);
    return normalizeDocument(
      JSON.parse(decodeBase64Text(response.content)),
      studentKey,
    );
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) {
      return emptyPersonalization(studentKey);
    }
    throw error;
  }
}

function prepareUploads(
  repository: string,
  branch: string,
  studentKey: string,
  ownerId: string,
  uploads: PersonalizationUpload[],
) {
  return uploads.map((upload) => {
    const fileId = crypto.randomUUID();
    const path = `data/personalization/${studentKey}/assets/${ownerId}/${fileId}-${upload.name}`;
    return {
      path,
      contentBase64: upload.contentBase64,
      attachment: {
        name: upload.name,
        url: `https://raw.githubusercontent.com/${repository}/${encodeURIComponent(
          branch,
        )}/${path}`,
      },
    } satisfies PreparedUpload;
  });
}

function applyMutation(
  current: PersonalizationDocument,
  mutation: PersonalizationMutation,
  now: string,
  ownerId: string,
  uploadedAttachments: Attachment[],
) {
  const document = structuredClone(current);
  document.updatedAt = now;

  if (mutation.action === "set_favorite") {
    const item = safeItem(mutation.item);
    document.favorites = document.favorites.filter(
      (favorite) => favorite.item.id !== item.id,
    );
    if (mutation.favorite) {
      document.favorites.unshift({ item, addedAt: now });
    }
  }

  if (mutation.action === "save_item_note") {
    const item = safeItem(mutation.item);
    const noteText = text(mutation.text, 20000);
    const existing = document.itemNotes.find((note) => note.item.id === item.id);
    document.itemNotes = document.itemNotes.filter(
      (note) => note.item.id !== item.id,
    );
    const attachments = [
      ...(existing?.attachments ?? []),
      ...uploadedAttachments,
    ];
    if (noteText || attachments.length) {
      document.itemNotes.unshift({
        id: existing?.id ?? ownerId,
        item,
        text: noteText,
        attachments,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      } satisfies ItemNote);
    }
  }

  if (mutation.action === "create_note") {
    const title = text(mutation.title, 200) || "My note";
    const noteText = text(mutation.text, 20000);
    if (!noteText && !uploadedAttachments.length) {
      throw new Error("Add text or at least one file to save a note.");
    }
    document.notes.unshift({
      id: ownerId,
      title,
      text: noteText,
      attachments: uploadedAttachments,
      createdAt: now,
      updatedAt: now,
    } satisfies MyNote);
  }

  if (mutation.action === "delete_note") {
    const noteId = text(mutation.noteId, 120);
    document.notes = document.notes.filter((note) => note.id !== noteId);
  }

  return document;
}

async function writeDocument(
  studentKey: string,
  mutation: PersonalizationMutation,
  uploads: PersonalizationUpload[],
) {
  const { repository, branch, token } = repositoryConfig();
  if (!token) {
    throw new Error("Favorites and notes are not configured yet.");
  }

  const now = new Date().toISOString();
  const ownerId = crypto.randomUUID();
  const preparedUploads = prepareUploads(
    repository,
    branch,
    studentKey,
    ownerId,
    uploads,
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const reference = await githubRequest<GitReference>(
      repository,
      `/git/ref/heads/${encodeURIComponent(branch)}`,
      token,
    );
    const parentSha = reference.object.sha;
    const parentCommit = await githubRequest<GitCommit>(
      repository,
      `/git/commits/${parentSha}`,
      token,
    );
    const current = await readDocument(repository, parentSha, token, studentKey);

    const uploadedAttachments = preparedUploads.map(
      (upload) => upload.attachment,
    );
    const next = applyMutation(
      current,
      mutation,
      now,
      ownerId,
      uploadedAttachments,
    );

    const treeEntries: Array<{
      path: string;
      mode: "100644";
      type: "blob";
      sha: string;
    }> = [];

    for (const upload of preparedUploads) {
      const blob = await githubRequest<GitBlob>(
        repository,
        "/git/blobs",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            content: upload.contentBase64,
            encoding: "base64",
          }),
        },
      );
      treeEntries.push({
        path: upload.path,
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      });
    }

    const documentBlob = await githubRequest<GitBlob>(
      repository,
      "/git/blobs",
      token,
      {
        method: "POST",
        body: JSON.stringify({
          content: encodeBase64(`${JSON.stringify(next, null, 2)}\n`),
          encoding: "base64",
        }),
      },
    );
    treeEntries.push({
      path: `data/personalization/${studentKey}/index.json`,
      mode: "100644",
      type: "blob",
      sha: documentBlob.sha,
    });

    const tree = await githubRequest<GitTree>(
      repository,
      "/git/trees",
      token,
      {
        method: "POST",
        body: JSON.stringify({
          base_tree: parentCommit.tree.sha,
          tree: treeEntries,
        }),
      },
    );
    const commit = await githubRequest<{ sha: string }>(
      repository,
      "/git/commits",
      token,
      {
        method: "POST",
        body: JSON.stringify({
          message: `Update ${studentKey} favorites and notes`,
          tree: tree.sha,
          parents: [parentSha],
        }),
      },
    );

    try {
      await githubRequest(
        repository,
        `/git/refs/heads/${encodeURIComponent(branch)}`,
        token,
        {
          method: "PATCH",
          body: JSON.stringify({ sha: commit.sha, force: false }),
        },
      );
      return next;
    } catch (error) {
      if (
        !(error instanceof GitHubError) ||
        error.status !== 422 ||
        attempt === 2
      ) {
        throw error;
      }
    }
  }

  throw new Error("The note could not be saved after multiple attempts.");
}

function rejectCrossOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin !== new URL(request.url).origin);
}

export async function GET(request: Request) {
  const studentKey = safeStudent(new URL(request.url).searchParams.get("student"));
  if (!studentKey) {
    return Response.json({ error: "Unknown student key." }, { status: 404 });
  }

  try {
    const { repository, branch, token } = repositoryConfig();
    const document = await readDocument(repository, branch, token, studentKey);
    return Response.json({ document }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json(
      { document: emptyPersonalization(studentKey) },
      { headers: { "cache-control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  if (rejectCrossOrigin(request)) {
    return Response.json({ error: "Cross-origin writes are not allowed." }, { status: 403 });
  }

  const studentKey = safeStudent(new URL(request.url).searchParams.get("student"));
  if (!studentKey) {
    return Response.json({ error: "Unknown student key." }, { status: 404 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_REQUEST_BYTES) {
    return Response.json({ error: "The note payload is too large." }, { status: 413 });
  }

  try {
    const mutation = (await request.json()) as PersonalizationMutation;
    if (
      !mutation ||
      !["set_favorite", "save_item_note", "create_note", "delete_note"].includes(
        mutation.action,
      )
    ) {
      return Response.json({ error: "Unknown personalization action." }, { status: 400 });
    }
    const uploads =
      mutation.action === "save_item_note" || mutation.action === "create_note"
        ? validateUploads(mutation.uploads)
        : [];
    const document = await writeDocument(studentKey, mutation, uploads);
    return Response.json({ ok: true, document });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The note could not be saved.";
    const status = /not configured/i.test(message) ? 503 : 400;
    return Response.json({ error: message }, { status });
  }
}
