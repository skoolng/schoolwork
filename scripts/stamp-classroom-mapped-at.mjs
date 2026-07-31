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
let previousLatest = null;

function stableUrl(value) {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function identity(kind, item, parent = "root") {
  const sourceUrl = item?.sourceUrl || item?.url;
  const value =
    (sourceUrl ? stableUrl(sourceUrl) : "") ||
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

function recordKey(item) {
  return stableUrl(item?.sourceUrl || item?.url || "") ||
    [item?.externalId, item?.title, item?.name, item?.dateText, item?.dueText]
      .filter(Boolean)
      .join("|")
      .toLowerCase();
}

function mergeRecords(current, previous) {
  const merged = { ...previous, ...current };
  for (const field of ["detail", "description", "dateText", "dueText", "status", "unit"]) {
    if (!merged[field] && previous?.[field]) merged[field] = previous[field];
  }
  for (const field of ["attachments", "images"]) {
    if (current?.[field] || previous?.[field]) {
      merged[field] = mergeRecordArrays(current?.[field] ?? [], previous?.[field] ?? []);
    }
  }
  return merged;
}

function mergeRecordArrays(current = [], previous = []) {
  const merged = new Map();
  for (const item of [...current, ...previous]) {
    const key = recordKey(item);
    if (!key) continue;
    const existing = merged.get(key);
    merged.set(key, existing ? mergeRecords(existing, item) : item);
  }
  return [...merged.values()];
}

function mergeClassrooms(current = [], previous = []) {
  const previousByKey = new Map(previous.map((item) => [recordKey(item), item]));
  const currentKeys = new Set();
  const merged = current.map((classroom) => {
    const key = recordKey(classroom);
    currentKeys.add(key);
    const old = previousByKey.get(key);
    if (!old) return classroom;
    return {
      ...old,
      ...classroom,
      latestActivity: classroom.latestActivity || old.latestActivity || "",
      stream: mergeRecordArrays(classroom.stream, old.stream),
      discussions: mergeRecordArrays(classroom.discussions, old.discussions),
      units: mergeRecordArrays(classroom.units, old.units),
      calendar: mergeRecordArrays(classroom.calendar, old.calendar),
      files: mergeRecordArrays(classroom.files, old.files),
    };
  });
  for (const classroom of previous) {
    if (!currentKeys.has(recordKey(classroom))) merged.push(classroom);
  }
  return merged;
}

function mergeSnapshot(current, previous) {
  if (!previous) return current;
  return {
    ...current,
    notifications: mergeRecordArrays(current.notifications, previous.notifications),
    assignments: mergeRecordArrays(current.assignments, previous.assignments),
    calendar: mergeRecordArrays(current.calendar, previous.calendar),
    classes: mergeClassrooms(current.classes, previous.classes),
  };
}

const historicalFiles = await readdir(historyDir).catch((error) => {
  if (error?.code === "ENOENT") return [];
  throw error;
});

for (const filename of historicalFiles.filter((value) => value.endsWith(".json")).sort()) {
  const snapshot = await readJsonIfPresent(path.join(historyDir, filename));
  if (snapshot) rememberSnapshot(snapshot);
}

previousLatest = await readJsonIfPresent(path.join(studentDir, "latest.json"));
if (previousLatest) rememberSnapshot(previousLatest);

const response = JSON.parse(await readFile(responsePath, "utf8"));
const incomingSnapshot = response?.archives?.[0]?.snapshot;
if (!incomingSnapshot?.syncedAt) {
  throw new Error("Sync response does not contain a timestamped classroom snapshot.");
}
const snapshot = mergeSnapshot(incomingSnapshot, previousLatest);

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
