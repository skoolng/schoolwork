#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const {
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN,
  SCHOOL_EMAIL_QUERY = "from:thegaudium.com after:2026/07/01",
  SCHOOL_EMAIL_STUDENTS = "advika,adrika",
} = process.env;

for (const [name, value] of Object.entries({
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN,
})) {
  if (!value) throw new Error(`${name} is required.`);
}

const students = SCHOOL_EMAIL_STUDENTS.split(",")
  .map((student) => student.trim())
  .filter(Boolean);

if (!students.length) throw new Error("SCHOOL_EMAIL_STUDENTS is empty.");

function decodeBase64Url(value = "") {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function headerValue(headers = [], name) {
  return headers.find(
    (header) => header.name?.toLowerCase() === name.toLowerCase(),
  )?.value;
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function htmlToText(html) {
  return decodeHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:div|p|li|h[1-6]|blockquote|tr)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function walkParts(part, visit) {
  visit(part);
  for (const child of part.parts ?? []) walkParts(child, visit);
}

function messageBody(payload) {
  const plain = [];
  const html = [];
  walkParts(payload, (part) => {
    if (!part.body?.data) return;
    const value = decodeBase64Url(part.body.data).toString("utf8");
    if (part.mimeType === "text/plain") plain.push(value);
    if (part.mimeType === "text/html") html.push(value);
  });
  const body = plain.join("\n\n").trim() || htmlToText(html.join("\n"));
  return body.replace(/\n{3,}/g, "\n\n").trim();
}

function attachmentParts(payload) {
  const parts = [];
  walkParts(payload, (part) => {
    if (!part.filename || !part.body?.attachmentId) return;
    parts.push(part);
  });
  return parts;
}

function safeFilename(value) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "attachment";
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function accessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    throw new Error(`Gmail OAuth refresh failed with ${response.status}.`);
  }
  return (await response.json()).access_token;
}

async function gmailJson(token, pathname, searchParams = {}) {
  const url = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/me/${pathname}`,
  );
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Gmail API ${pathname} returned ${response.status}.`);
  }
  return response.json();
}

async function matchingMessageIds(token) {
  const ids = [];
  let pageToken;
  do {
    const page = await gmailJson(token, "messages", {
      q: SCHOOL_EMAIL_QUERY,
      maxResults: 500,
      pageToken,
    });
    ids.push(...(page.messages ?? []).map((message) => message.id));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return ids;
}

async function archiveMessageAttachments(token, student, message) {
  const assets = [];
  for (const part of attachmentParts(message.payload)) {
    const response = await gmailJson(
      token,
      `messages/${message.id}/attachments/${part.body.attachmentId}`,
    );
    const filename = safeFilename(part.filename);
    const relativePath =
      `data/classroom/${student}/assets/email-${message.id}-${filename}`;
    await mkdir(path.dirname(relativePath), { recursive: true });
    await writeFile(relativePath, decodeBase64Url(response.data));
    assets.push({
      name: part.filename,
      url: `https://raw.githubusercontent.com/skoolng/schoolwork/main/${relativePath}`,
      sourceUrl: `https://mail.google.com/mail/#all/${message.id}`,
    });
  }
  return assets;
}

function messageTimestamp(message) {
  const headerDate = headerValue(message.payload?.headers, "Date");
  const parsed = new Date(headerDate || Number(message.internalDate));
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

const token = await accessToken();
const messageIds = await matchingMessageIds(token);
const messages = [];
for (const id of messageIds) {
  messages.push(await gmailJson(token, `messages/${id}`, { format: "full" }));
}

for (const student of students) {
  const communicationsPath =
    `data/classroom/${student}/school-communications.json`;
  const existing = await readJson(communicationsPath, []);
  const existingById = new Map(
    existing.map((item) => [item.externalId, item]),
  );
  const imported = [];

  for (const message of messages) {
    const externalId = `gmail:${message.id}`;
    const previous = existingById.get(externalId);
    const attachments = await archiveMessageAttachments(
      token,
      student,
      message,
    );
    imported.push({
      title:
        headerValue(message.payload?.headers, "Subject") ||
        "School communication",
      detail: messageBody(message.payload),
      url: `https://mail.google.com/mail/#all/${message.id}`,
      createdAt: messageTimestamp(message),
      sender:
        headerValue(message.payload?.headers, "From") ||
        "The Gaudium School",
      origin: "The Gaudium School email",
      attachments,
      channel: "email",
      externalId,
      mappedAt: previous?.mappedAt || new Date().toISOString(),
    });
  }

  const merged = new Map(
    [...existing, ...imported].map((item) => [item.externalId, item]),
  );
  const ordered = [...merged.values()].sort(
    (left, right) =>
      new Date(right.createdAt || 0).getTime() -
      new Date(left.createdAt || 0).getTime(),
  );
  await mkdir(path.dirname(communicationsPath), { recursive: true });
  await writeFile(
    communicationsPath,
    `${JSON.stringify(ordered, null, 2)}\n`,
  );
}

console.log(
  `Archived ${messages.length} school emails for ${students.join(", ")}.`,
);
