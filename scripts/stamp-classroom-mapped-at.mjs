#!/usr/bin/env node

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [studentKey, responsePath, outputPath] = process.argv.slice(2);

if (!studentKey || !responsePath || !outputPath) {
  console.error(
    "Usage: stamp-classroom-mapped-at.mjs <student-key> <sync-response> <output>",
  );
  process.exit(1);
}

const studentDir = path.resolve("data/classroom", studentKey);
const historyDir = path.join(studentDir, "history");
const earliestMappedAt = new Map();

function identity(kind, item, parent = "root") {
  const value =
    item?.url ||
    item?.sourceUrl ||
    [item?.title, item?.name, item?.dateText, item?.dueText]
      .filter(Boolean)
      .join("|");
  return value ? `${parent}|${kind}|${value}` : "";
}

function eachMappedItem(snapshot, visit) {
  for (const notification of snapshot.notifications ?? []) {
    visit("notification", notification);
  }
  for (const entry of snapshot.calendar ?? []) {
    visit("calendar", entry);
  }
  for (const assignment of snapshot.assignments ?? []) {
    const assignmentKey = identity("assignment", assignment);
    visit("assignment", assignment);
    for (const attachment of assignment.attachments ?? []) {
      visit("attachment", attachment, assignmentKey);
    }
    for (const image of assignment.images ?? []) {
      visit("image", image, assignmentKey);
    }
  }
  for (const classroom of snapshot.classes ?? []) {
    const classKey = identity("class", classroom);
    visit("class", classroom);
    for (const unit of classroom.units ?? []) {
      visit("unit", unit, classKey);
    }
    for (const entry of classroom.calendar ?? []) {
      visit("class-calendar", entry, classKey);
    }
    for (const file of classroom.files ?? []) {
      visit("class-file", file, classKey);
    }
    for (const section of ["stream", "discussions"]) {
      for (const content of classroom[section] ?? []) {
        const contentKey = identity(section, content, classKey);
        visit(section, content, classKey);
        for (const attachment of content.attachments ?? []) {
          visit(`${section}-attachment`, attachment, contentKey);
        }
        for (const image of content.images ?? []) {
          visit(`${section}-image`, image, contentKey);
        }
      }
    }
  }
}

function rememberSnapshot(snapshot) {
  const fallback = snapshot.syncedAt;
  if (!fallback) return;
  eachMappedItem(snapshot, (kind, item, parent) => {
    const key = identity(kind, item, parent);
    if (!key) return;
    const timestamp = item.mappedAt || fallback;
    const known = earliestMappedAt.get(key);
    if (!known || new Date(timestamp).getTime() < new Date(known).getTime()) {
      earliestMappedAt.set(key, timestamp);
    }
  });
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

const historicalFiles = await readdir(historyDir).catch((error) => {
  if (error?.code === "ENOENT") return [];
  throw error;
});

for (const filename of historicalFiles.filter((value) => value.endsWith(".json")).sort()) {
  const snapshot = await readJsonIfPresent(path.join(historyDir, filename));
  if (snapshot) rememberSnapshot(snapshot);
}

const previousLatest = await readJsonIfPresent(path.join(studentDir, "latest.json"));
if (previousLatest) rememberSnapshot(previousLatest);

const response = JSON.parse(await readFile(responsePath, "utf8"));
const snapshot = response?.archives?.[0]?.snapshot;
if (!snapshot?.syncedAt) {
  throw new Error("Sync response does not contain a timestamped classroom snapshot.");
}

snapshot.notifications = (snapshot.notifications ?? []).filter(
  (notification) =>
    /notifications shown by ManageBac/i.test(notification.title ?? "") ||
    /^https?:\/\/[^/]+\/student\/notifications\/.+/i.test(notification.url ?? ""),
);

eachMappedItem(snapshot, (kind, item, parent) => {
  const key = identity(kind, item, parent);
  item.mappedAt = earliestMappedAt.get(key) || item.mappedAt || snapshot.syncedAt;
});

await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
