import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

test("classroom dashboard source is wired", async () => {
  const [page, layout, packageJson, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Choose a classroom/);
  assert.match(page, /selectedStudent/);
  assert.match(page, /saved snapshots/);
  assert.match(page, /Home Assignments/);
  assert.match(page, /Classroom Learnings/);
  assert.match(page, /\/api\/classroom/);
  assert.match(page, /groupAssignmentsBySubject/);
  assert.match(page, /latest due first/);
  assert.match(page, /Choose a subject/);
  assert.match(page, /selectedSubject/);
  assert.match(page, /snapshot\.classes\.map/);
  assert.match(page, /filteredClasses/);
  assert.match(page, /aria-pressed/);
  assert.match(page, /Class stream/);
  assert.match(page, /Tasks & Units/);
  assert.match(page, /Discussions/);
  assert.match(page, /ClassLearningPanel/);
  assert.match(page, /classSection/);
  assert.match(page, /discussion-assignment/);
  assert.match(page, /From discussion/);
  assert.match(page, /ImageGallery/);
  assert.match(page, /Homework images/);
  assert.match(layout, /title:\s*"Schoolwork Dashboard"/);
  assert.match(css, /classroom-shell/);
  assert.match(css, /subject-heading/);
  assert.match(css, /subject-options/);
  assert.match(css, /class-section-tabs/);
  assert.match(css, /task-unit-grid/);
  assert.match(css, /discussion-assignment/);
  assert.match(css, /homework-image-gallery/);
  assert.match(css, /student-switcher/);
  assert.doesNotMatch(page, /_sites-preview|codex-preview|SkeletonPreview/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("classroom sync artifacts exist", async () => {
  const [syncRoute, schema, cron, runner, migration, historyMigration, workflow] =
    await Promise.all([
    readFile(new URL("../app/api/sync/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/install-managebac-cron.sh", import.meta.url), "utf8"),
    readFile(new URL("../scripts/run-managebac-sync.sh", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_classroom_snapshots.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_multi_student_history.sql", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/managebac-sync.yml", import.meta.url), "utf8"),
  ]);

  assert.match(syncRoute, /x-sync-secret/);
  assert.match(syncRoute, /scrapeManageBac/);
  assert.match(syncRoute, /MANAGEBAC_ADRIKA_LOGIN/);
  assert.match(syncRoute, /classroomSnapshotHistory/);
  assert.match(schema, /classroom_snapshots/);
  assert.match(schema, /classroom_snapshot_history/);
  assert.match(schema, /studentKey/);
  assert.match(cron, /advika-managebac-sync/);
  assert.match(cron, /SIWC_BYPASS_TOKEN/);
  assert.match(cron, /0 15 \* \* 1-5/);
  assert.match(cron, /30 16 \* \* 1-5/);
  assert.match(runner, /OAI-Sites-Authorization/);
  assert.match(runner, /x-sync-secret/);
  assert.match(migration, /CREATE TABLE `classroom_snapshots`/);
  assert.match(historyMigration, /ADD COLUMN `student_key`/);
  assert.match(historyMigration, /CREATE TABLE `classroom_snapshot_history`/);
  assert.match(workflow, /30 9 \* \* 1-5/);
  assert.match(workflow, /0 11 \* \* 1-5/);
  await access(new URL("../public/classroom-bg.png", import.meta.url));
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("app/_sites-preview", templateRoot)));
});

test("archived PDFs use the inline file proxy", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const route = await readFile(
    new URL("../app/api/file/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(page, /\/api\/file\?url=/);
  assert.match(route, /content-disposition/);
  assert.match(route, /application\/pdf/);
  assert.match(route, /request\.headers\.get\("range"\)/);
});

test("Word and PowerPoint files use the embedded Office viewer", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /docx\?/);
  assert.match(page, /pptx\?/);
  assert.match(page, /view\.officeapps\.live\.com\/op\/embed\.aspx/);
});

test("weekly journals and clickable notifications are wired", async () => {
  const [page, generator, route, workflow, scraper, classroomData] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/weekly-journal.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/weekly-journal/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/weekly-journal.yml", import.meta.url), "utf8"),
    readFile(new URL("../lib/managebac.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/github-data.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Weekly Journal/);
  assert.match(page, /notice-card-link/);
  assert.match(generator, /questionsFor/);
  assert.match(generator, /youtube\.com\/watch\?v=/);
  assert.doesNotMatch(generator, /youtube\.com\/results|search_query=/);
  assert.match(route, /buildWeeklyJournal/);
  assert.match(workflow, /30 11 \* \* 5/);
  assert.match(workflow, /data\/weekly-journal/);
  assert.match(scraper, /student\\\/notifications\\\/.\+/);
  assert.match(classroomData, /cleanNotifications/);
});

test("ManageBac scraper consolidates every class section", async () => {
  const [scraper, types] = await Promise.all([
    readFile(new URL("../lib/managebac.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/types.ts", import.meta.url), "utf8"),
  ]);

  for (const route of ["class_stream", "units", "calendar", "discussions", "files"]) {
    assert.match(scraper, new RegExp(`\\$\\{classUrl\\}/${route}`));
  }
  assert.match(scraper, /mapWithConcurrency/);
  assert.match(scraper, /parseClassContent/);
  assert.match(scraper, /parseUnits/);
  assert.match(scraper, /parseFiles/);
  assert.match(scraper, /parseDiscussions/);
  assert.match(scraper, /fetchDiscussionPages/);
  assert.match(scraper, /MAX_DISCUSSION_PAGES/);
  assert.match(scraper, /searchParams\.set\("page"/);
  assert.match(scraper, /discussionToAssignment/);
  assert.match(scraper, /DISCUSSION_ASSIGNMENT_PATTERN/);
  assert.match(scraper, /attachment\.name/);
  assert.match(scraper, /reading\\s\*comprehension/);
  assert.match(scraper, /querySelectorAll\("img"\)/);
  assert.match(scraper, /isImageAttachment/);
  assert.match(scraper, /NON_ASSIGNMENT_IMAGE_PATTERN/);
  assert.match(scraper, /IMAGE_ASSIGNMENT_PATTERN/);
  assert.match(types, /ClassContentItem/);
  assert.match(types, /discussions: ClassContentItem\[\]/);
  assert.match(types, /units: ClassUnit\[\]/);
  assert.match(types, /files: Attachment\[\]/);
});
