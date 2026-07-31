#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  readManageBacCredentials,
  scrapeManageBacWithAssets,
} from "../lib/managebac";

const [studentKey, outputPath] = process.argv.slice(2);

const students = {
  advika: {
    name: "Advika Lakshmi",
    login: process.env.MANAGEBAC_LOGIN,
    password: process.env.MANAGEBAC_PASSWORD,
  },
  adrika: {
    name: "Adrika Lakshmi Saragadam",
    login: process.env.MANAGEBAC_ADRIKA_LOGIN,
    password: process.env.MANAGEBAC_ADRIKA_PASSWORD,
  },
} as const;

if (!studentKey || !outputPath || !(studentKey in students)) {
  throw new Error(
    "Usage: sync-managebac-direct.mts <advika|adrika> <output-json>",
  );
}

const student = students[studentKey as keyof typeof students];
const latestPath = path.resolve(
  "data/classroom",
  studentKey,
  "latest.json",
);

function collectKnownAssets(
  value: unknown,
  knownAssets: Record<string, string>,
) {
  if (Array.isArray(value)) {
    for (const item of value) collectKnownAssets(item, knownAssets);
    return;
  }
  if (!value || typeof value !== "object") return;

  const item = value as Record<string, unknown>;
  if (
    typeof item.sourceUrl === "string" &&
    typeof item.url === "string" &&
    /^https?:/i.test(item.sourceUrl) &&
    /^https:\/\/raw\.githubusercontent\.com\/skoolng\/schoolwork\//i.test(
      item.url,
    )
  ) {
    knownAssets[item.sourceUrl] = item.url;
  }
  for (const child of Object.values(item)) {
    collectKnownAssets(child, knownAssets);
  }
}

async function readKnownAssets() {
  const knownAssets: Record<string, string> = {};
  try {
    collectKnownAssets(
      JSON.parse(await readFile(latestPath, "utf8")),
      knownAssets,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return knownAssets;
}

const archived = await scrapeManageBacWithAssets(
  readManageBacCredentials({
    MANAGEBAC_BASE_URL:
      process.env.MANAGEBAC_BASE_URL ??
      "https://thegaudium.managebac.com",
    MANAGEBAC_LOGIN: student.login,
    MANAGEBAC_PASSWORD: student.password,
  }),
  studentKey,
  await readKnownAssets(),
);

const actualName = archived.snapshot.studentName.trim();
if (
  actualName &&
  !actualName
    .toLowerCase()
    .includes(student.name.split(/\s+/)[0].toLowerCase())
) {
  throw new Error(
    `ManageBac returned ${actualName} for the ${student.name} sync.`,
  );
}
const capturedItems =
  archived.snapshot.classes.length +
  archived.snapshot.assignments.length +
  archived.snapshot.notifications.length +
  archived.snapshot.calendar.length;
if (!capturedItems) {
  throw new Error(`ManageBac returned an empty workspace for ${student.name}.`);
}
archived.snapshot.studentName = actualName || student.name;

await writeFile(
  outputPath,
  JSON.stringify({
    ok: true,
    archives: [
      {
        student: studentKey,
        snapshot: archived.snapshot,
        assets: archived.assets.map((asset) => ({
          path: asset.path,
          contentType: asset.contentType,
          sourceUrl: asset.sourceUrl,
          contentBase64: Buffer.from(asset.content).toString("base64"),
        })),
      },
    ],
  }),
);
