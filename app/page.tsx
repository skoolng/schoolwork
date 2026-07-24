"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  Attachment,
  Assignment,
  ClassContentItem,
  ClassroomClass,
  ClassroomSnapshot,
  NotificationItem,
  StudentSummary,
  WeeklyJournal,
  WeeklyJournalHomeProject,
  WeeklyJournalIndexItem,
  WeeklyJournalUnit,
} from "../lib/types";
import {
  emptyPersonalization,
  type ItemNote,
  type PersonalizationDocument,
  type PersonalizationItem,
  type PersonalizationMutation,
  type PersonalizationUpload,
} from "../lib/personalization";

const FileWorkspaceContext = createContext<
  ((file: Attachment) => void) | null
>(null);
const DetailWorkspaceContext = createContext<
  ((item: DetailWorkspaceItem) => void) | null
>(null);
const PersonalizationContext = createContext<{
  document: PersonalizationDocument;
  isSaving: boolean;
  error: string;
  toggleFavorite: (item: PersonalizationItem) => void;
  editNote: (item: PersonalizationItem) => void;
  createNote: () => void;
  deleteNote: (noteId: string) => void;
} | null>(null);

function useFileWorkspace() {
  const openFile = useContext(FileWorkspaceContext);
  if (!openFile) throw new Error("File workspace is unavailable.");
  return openFile;
}

function useDetailWorkspace() {
  const openDetail = useContext(DetailWorkspaceContext);
  if (!openDetail) throw new Error("Detail workspace is unavailable.");
  return openDetail;
}

type ClassSection = "stream" | "tasks" | "discussions" | "calendar" | "files";
type DashboardView =
  | "overview"
  | "alerts"
  | "assignments"
  | "classes"
  | "journal"
  | "saved";

interface DetailWorkspaceItem {
  id: string;
  kind: string;
  title: string;
  detail: string;
  url: string;
  source: string;
  createdAt?: string;
  mappedAt?: string;
  attachments: Attachment[];
  facts?: Array<{ label: string; value: string }>;
}

const dashboardViews: { id: DashboardView; label: string; shortLabel: string }[] = [
  { id: "overview", label: "Overview", shortLabel: "Overview" },
  { id: "alerts", label: "Alerts & notices", shortLabel: "Alerts" },
  { id: "assignments", label: "Assignments", shortLabel: "Work" },
  { id: "classes", label: "Classroom", shortLabel: "Classes" },
  { id: "journal", label: "Weekly journal", shortLabel: "Journal" },
  { id: "saved", label: "Favorites & notes", shortLabel: "Saved" },
];

const classSections: { id: ClassSection; label: string }[] = [
  { id: "stream", label: "Class stream" },
  { id: "tasks", label: "Tasks & Units" },
  { id: "discussions", label: "Discussions" },
  { id: "calendar", label: "Calendar" },
  { id: "files", label: "Files" },
];

const emptySnapshot: ClassroomSnapshot = {
  studentName: "Advika Lakshmi",
  syncedAt: "",
  sourceUrl: "https://thegaudium.managebac.com/student/home",
  status: "pending",
  error: "",
  notifications: [],
  classes: [],
  assignments: [],
  calendar: [],
};

const defaultStudents: StudentSummary[] = [
  {
    key: "advika",
    name: "Advika Lakshmi",
    syncedAt: "",
    status: "pending",
  },
  {
    key: "adrika",
    name: "Adrika Lakshmi",
    syncedAt: "",
    status: "pending",
  },
];

function formatDate(value: string) {
  if (!value) return "Waiting for first sync";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function MappedTimestamp({ value }: { value?: string }) {
  if (!value) return null;
  return (
    <time className="mapped-time" dateTime={value} title={formatDate(value)}>
      Added to dashboard {formatDate(value)}
    </time>
  );
}

function urgency(dueText: string, status: string) {
  const lowered = `${dueText} ${status}`.toLowerCase();
  if (lowered.includes("overdue") || lowered.includes("not submitted")) return "Needs attention";
  if (lowered.includes("today") || lowered.includes("tomorrow")) return "Soon";
  return "Planned";
}

function hostOnly(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "attachment";
  }
}

function fileKind(file: Attachment) {
  const value = `${file.name} ${file.url}`.toLowerCase();
  if (/\.pdf(?:\?|$)/.test(value)) return "pdf";
  if (/\.(?:avif|gif|jpe?g|png|webp)(?:\?|$)/.test(value)) return "image";
  if (/\.(?:docx?|pptx?)(?:\?|$)/.test(value)) return "office";
  return "file";
}

function usePersonalization() {
  const context = useContext(PersonalizationContext);
  if (!context) throw new Error("Personalization workspace is unavailable.");
  return context;
}

function detailToPersonalization(item: DetailWorkspaceItem): PersonalizationItem {
  return {
    id: item.id,
    category: item.kind,
    title: item.title,
    summary: item.detail,
    source: item.source,
    sourceUrl: item.url,
    createdAt: item.createdAt ?? item.mappedAt,
    attachments: item.attachments,
  };
}

function personalizationToDetail(item: PersonalizationItem): DetailWorkspaceItem {
  return {
    id: item.id,
    kind: item.category,
    title: item.title,
    detail: item.summary,
    url: item.sourceUrl ?? "",
    source: item.source,
    createdAt: item.createdAt,
    attachments: item.attachments,
  };
}

function fileToPersonalization(file: Attachment): PersonalizationItem {
  return {
    id: `file-${file.url}`,
    category: "File",
    title: file.name || hostOnly(file.url),
    summary: "",
    source: hostOnly(file.sourceUrl || file.url),
    sourceUrl: file.sourceUrl || file.url,
    createdAt: file.mappedAt,
    attachments: [file],
  };
}

function SavedItemActions({
  item,
  compact = false,
}: {
  item: PersonalizationItem;
  compact?: boolean;
}) {
  const { document, editNote, isSaving, toggleFavorite } = usePersonalization();
  const favorite = document.favorites.some((entry) => entry.item.id === item.id);
  const note = document.itemNotes.some((entry) => entry.item.id === item.id);

  return (
    <div className={`saved-item-actions ${compact ? "compact" : ""}`}>
      <button
        className={favorite ? "active" : ""}
        type="button"
        aria-pressed={favorite}
        disabled={isSaving}
        onClick={() => toggleFavorite(item)}
        title={favorite ? "Remove from favorites" : "Add to favorites"}
      >
        <span aria-hidden="true">★</span>
        {favorite ? "Favorited" : "Favorite"}
      </button>
      <button
        className={note ? "active" : ""}
        type="button"
        disabled={isSaving}
        onClick={() => editNote(item)}
      >
        {note ? "Edit note" : "Add note"}
      </button>
    </div>
  );
}

function AttachmentButton({ file }: { file: Attachment }) {
  const openFile = useFileWorkspace();
  return (
    <button className="attachment-button" type="button" onClick={() => openFile(file)}>
      <span aria-hidden="true">{fileKind(file)}</span>
      <div className="attachment-copy">
        <strong>{file.name || hostOnly(file.url)}</strong>
        <MappedTimestamp value={file.mappedAt} />
      </div>
    </button>
  );
}

function FileWorkspace({ file, onClose }: { file: Attachment | null; onClose: () => void }) {
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const kind = file ? fileKind(file) : "file";
  const previewUrl =
    file && kind === "pdf"
      ? `/api/file?url=${encodeURIComponent(file.url)}`
      : file && kind === "office"
        ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(file.url)}`
      : file?.url;

  useEffect(() => {
    if (!file) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("workspace-open");
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("workspace-open");
    };
  }, [file, onClose]);

  if (!file) return null;

  return (
    <div className="file-workspace-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="file-workspace"
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-workspace-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">Document workspace</p>
            <h2 id="file-workspace-title">{file.name || "Classroom file"}</h2>
            <MappedTimestamp value={file.mappedAt} />
          </div>
          <button className="workspace-close" type="button" onClick={onClose} aria-label="Close file">
            Close
          </button>
        </header>

        <div className="workspace-toolbar">
          {kind === "image" ? (
            <>
              <button type="button" onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}>Zoom out</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((value) => Math.min(3, value + 0.25))}>Zoom in</button>
              <button type="button" onClick={() => setRotation((value) => value - 90)}>Rotate left</button>
              <button type="button" onClick={() => setRotation((value) => value + 90)}>Rotate right</button>
              <button type="button" onClick={() => { setZoom(1); setRotation(0); }}>Reset</button>
            </>
          ) : null}
          <a href={file.url} download={file.name || undefined}>Download</a>
          <a href={file.url} target="_blank" rel="noreferrer">Open original</a>
          <SavedItemActions item={fileToPersonalization(file)} compact />
        </div>

        <div className={`workspace-canvas ${kind}`}>
          {kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={file.url}
              alt={file.name || "Classroom image"}
              style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
            />
          ) : kind === "pdf" || kind === "office" ? (
            <iframe src={previewUrl} title={file.name || "Classroom document"} />
          ) : (
            <div className="unsupported-preview">
              <strong>Preview is not available for this file type.</strong>
              <p>Download it or open the archived copy in a new tab.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function DetailWorkspace({
  item,
  onClose,
  onOpenFile,
}: {
  item: DetailWorkspaceItem | null;
  onClose: () => void;
  onOpenFile: (file: Attachment) => void;
}) {
  useEffect(() => {
    if (!item) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("detail-workspace-open");
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("detail-workspace-open");
    };
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div className="detail-workspace-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="detail-workspace"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-workspace-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">{item.kind}</p>
            <h2 id="detail-workspace-title">{item.title}</h2>
          </div>
          <button
            className="workspace-close"
            type="button"
            onClick={onClose}
            aria-label="Close details"
          >
            Close
          </button>
        </header>

        <div className="detail-workspace-meta">
          {item.source ? <span>{item.source}</span> : null}
          {item.createdAt ? (
            <time dateTime={item.createdAt}>Posted {formatDate(item.createdAt)}</time>
          ) : null}
          <MappedTimestamp value={item.mappedAt} />
        </div>

        <div className="detail-workspace-body">
          {item.facts?.length ? (
            <dl className="detail-facts">
              {item.facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <p>{item.detail || "No additional detail was included."}</p>
          {item.attachments.length ? (
            <section className="detail-attachments" aria-labelledby="detail-attachments-title">
              <h3 id="detail-attachments-title">Attachments</h3>
              <div>
                {item.attachments.map((attachment) => (
                  <button
                    type="button"
                    key={attachment.url}
                    onClick={() => onOpenFile(attachment)}
                  >
                    <span aria-hidden="true">{fileKind(attachment)}</span>
                    <strong>{attachment.name || hostOnly(attachment.url)}</strong>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <footer>
          <SavedItemActions item={detailToPersonalization(item)} />
          {item.url && /^https?:/i.test(item.url) ? (
            <a href={item.url} target="_blank" rel="noreferrer">Open original</a>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

function assignmentMappedTimestamp(assignment: Assignment) {
  const parsed = new Date(assignment.mappedAt ?? "");
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function groupAssignmentsBySubject(assignments: Assignment[]) {
  const groups = new Map<string, Assignment[]>();

  for (const assignment of assignments) {
    const subject = assignment.className || "Other";
    groups.set(subject, [...(groups.get(subject) ?? []), assignment]);
  }

  return [...groups.entries()]
    .map(([subject, items]) => ({
      subject,
      items: items
        .slice()
        .sort(
          (left, right) =>
            assignmentMappedTimestamp(right) - assignmentMappedTimestamp(left) ||
            right.title.localeCompare(left.title),
        ),
    }))
    .sort((left, right) => left.subject.localeCompare(right.subject));
}

function assignmentToDetail(assignment: Assignment): DetailWorkspaceItem {
  return {
    id: `assignment-${assignment.url}`,
    kind: assignment.source === "discussion" ? "Discussion assignment" : "Assignment",
    title: assignment.title,
    detail: assignment.description,
    url: assignment.url,
    source: assignment.className,
    mappedAt: assignment.mappedAt,
    attachments: assignment.attachments,
    facts: [
      { label: "Due", value: assignment.dueText || "Not provided by teacher" },
      { label: "Status", value: assignment.status || "Unknown" },
      { label: "Unit", value: assignment.unit || "Not listed" },
    ],
  };
}

function classContentToDetail(
  content: ClassContentItem,
  source: string,
  kind: string,
): DetailWorkspaceItem {
  return {
    id: `class-content-${content.url}`,
    kind,
    title: content.title,
    detail: content.detail,
    url: content.url,
    source,
    mappedAt: content.mappedAt,
    attachments: content.attachments ?? [],
    facts: content.dateText ? [{ label: "Date", value: content.dateText }] : undefined,
  };
}

interface ParentAlert extends DetailWorkspaceItem {
  kind: "School update" | "Assessment" | "Assessment update";
}

function notificationToDetail(notice: NotificationItem): DetailWorkspaceItem {
  return {
    id: `notification-${notice.url}-${notice.title}`,
    kind: "Notification",
    title: notice.title,
    detail: notice.detail,
    url: notice.url,
    source: [notice.origin, notice.sender].filter(Boolean).join(" · "),
    createdAt: notice.createdAt,
    mappedAt: notice.mappedAt,
    attachments: notice.attachments ?? [],
  };
}

const PARENT_ALERT_PATTERN =
  /\b(?:assessment|exam|holiday|mock|postpon|reschedul|school closed|syllabus)\b/i;

function alertTimestamp(alert: ParentAlert) {
  const parsed = new Date(alert.createdAt || alert.mappedAt || "");
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function uniqueAttachments(items: Attachment[]) {
  return [...new Map(items.map((item) => [item.url, item])).values()];
}

function deriveParentAlerts(snapshot: ClassroomSnapshot): ParentAlert[] {
  const alerts: ParentAlert[] = [];

  for (const notice of snapshot.notifications) {
    if (!PARENT_ALERT_PATTERN.test(`${notice.title} ${notice.detail}`)) continue;
    alerts.push({
      id: `notification-${notice.url}`,
      kind: /holiday|closed|bandh|postpon|reschedul/i.test(
        `${notice.title} ${notice.detail}`,
      )
        ? "School update"
        : "Assessment",
      title: notice.title,
      detail: notice.detail,
      url: notice.url,
      source: [notice.origin, notice.sender].filter(Boolean).join(" · "),
      createdAt: notice.createdAt,
      mappedAt: notice.mappedAt,
      attachments: notice.attachments ?? [],
    });
  }

  for (const assignment of snapshot.assignments) {
    if (
      !PARENT_ALERT_PATTERN.test(
        `${assignment.title} ${assignment.description} ${assignment.unit}`,
      )
    ) {
      continue;
    }
    alerts.push({
      id: `assignment-${assignment.url}`,
      kind: "Assessment",
      title: assignment.title.trim(),
      detail: assignment.description,
      url: assignment.url,
      source: assignment.className,
      mappedAt: assignment.mappedAt,
      attachments: assignment.attachments,
    });
  }

  const holiday = alerts.find(
    (alert) =>
      /holiday on 24th july/i.test(alert.title) &&
      /monday.*27.*9\s*-\s*10\s*am/i.test(alert.detail),
  );
  const schedule = alerts.find((alert) =>
    /MYP-1 SA-1 Syllabus and schedule/i.test(alert.title),
  );
  const mathsMock = snapshot.assignments.find(
    (assignment) =>
      /mathematics/i.test(assignment.className) &&
      /mock.*SA-?1/i.test(assignment.title),
  );
  const mathsPractice = snapshot.assignments.find(
    (assignment) =>
      /mathematics/i.test(assignment.className) &&
      /SA-?1.*practice|practice.*SA-?1/i.test(assignment.title),
  );

  if (holiday && schedule && mathsMock) {
    alerts.push({
      id: "maths-sa1-rescheduled-2026-07-24",
      kind: "Assessment update",
      title: "Mathematics SA-1 is now Monday, 27 July",
      detail:
        "School is closed on Friday, 24 July. The published MYP Year 1 SA-1 schedule lists Mathematics for 24 July, and the school has moved Friday's MYP 1-3 assessment to Monday, 27 July from 9:00-10:00 AM. The schedule, mock paper, and practice sheet are attached here.",
      url: holiday.url,
      source: "MYP Year 1 · Mathematics",
      createdAt: holiday.createdAt,
      mappedAt: holiday.mappedAt,
      attachments: uniqueAttachments([
        ...schedule.attachments,
        ...mathsMock.attachments,
        ...(mathsPractice?.attachments ?? []),
      ]),
    });
  }

  const byTitle = new Map<string, ParentAlert>();
  for (const alert of alerts.sort(
    (left, right) => alertTimestamp(right) - alertTimestamp(left),
  )) {
    const key = alert.title.toLowerCase().replace(/\s+/g, " ").trim();
    if (!byTitle.has(key)) byTitle.set(key, alert);
  }

  return [...byTitle.values()].slice(0, 12);
}

function ParentAlertsPanel({
  alerts,
  limit,
  compact = false,
}: {
  alerts: ParentAlert[];
  limit?: number;
  compact?: boolean;
}) {
  const openDetail = useDetailWorkspace();
  const visibleAlerts = typeof limit === "number" ? alerts.slice(0, limit) : alerts;

  return (
    <section
      className={`parent-alerts ${compact ? "compact-alerts" : ""}`}
      aria-labelledby="parent-alerts-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Parent Alerts</p>
          <h2 id="parent-alerts-title">School updates and assessments</h2>
        </div>
        <span>{alerts.length} important items</span>
      </div>
      {alerts.length ? (
        <div className="parent-alert-list">
          {visibleAlerts.map((alert) => {
            const isLong = alert.detail.length > 220;
            return (
              <article
                className={`parent-alert-card ${
                  alert.kind === "Assessment update" ? "featured" : ""
                }`}
                key={alert.id}
              >
                <div className="parent-alert-topline">
                  <strong>{alert.kind}</strong>
                  {alert.createdAt ? (
                    <time dateTime={alert.createdAt}>
                      Posted {formatDate(alert.createdAt)}
                    </time>
                  ) : (
                    <MappedTimestamp value={alert.mappedAt} />
                  )}
                </div>
                <h3>{alert.title}</h3>
                {alert.source ? <span className="parent-alert-source">{alert.source}</span> : null}
                {alert.detail ? (
                  <p className={isLong ? "truncated-copy" : ""}>{alert.detail}</p>
                ) : null}
                {alert.attachments.length ? (
                  <div className="attachment-row">
                    {alert.attachments.map((attachment) => (
                      <AttachmentButton key={attachment.url} file={attachment} />
                    ))}
                  </div>
                ) : null}
                <div className="parent-alert-actions">
                  {isLong ? (
                    <button type="button" onClick={() => openDetail(alert)}>View details</button>
                  ) : null}
                  <a href={alert.url} target="_blank" rel="noreferrer">Open source</a>
                  <SavedItemActions
                    item={detailToPersonalization(alert)}
                    compact
                  />
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="empty-state">
          No school-wide or assessment alerts were captured in the latest sync.
        </p>
      )}
    </section>
  );
}

function ClassContentList({
  items = [],
  empty,
  source,
  kind,
}: {
  items?: ClassContentItem[];
  empty: string;
  source: string;
  kind: string;
}) {
  const openDetail = useDetailWorkspace();
  if (!items.length) return <p className="empty-state">{empty}</p>;

  return (
    <ul className="class-detail-list">
      {items.map((content) => (
        <li key={content.url}>
          <div className="class-item-heading">
            <a href={content.url} target="_blank" rel="noreferrer">
              {content.title}
            </a>
            {content.dateText ? <span>{content.dateText}</span> : null}
          </div>
          <MappedTimestamp value={content.mappedAt} />
          {content.detail ? <p className="truncated-copy">{content.detail}</p> : null}
          <ImageGallery images={content.images} />
          {content.attachments?.length ? (
            <div className="attachment-row compact-attachments">
              {content.attachments.map((attachment) => (
                <AttachmentButton key={attachment.url} file={attachment} />
              ))}
            </div>
          ) : null}
          {content.detail ? (
            <div className="row-actions">
              <button
                type="button"
                onClick={() => openDetail(classContentToDetail(content, source, kind))}
              >
                View details
              </button>
              <SavedItemActions
                item={detailToPersonalization(
                  classContentToDetail(content, source, kind),
                )}
                compact
              />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ImageGallery({ images = [] }: { images?: Attachment[] }) {
  const openFile = useFileWorkspace();
  if (!images.length) return null;

  return (
    <div className="homework-image-gallery" aria-label="Homework images">
      {images.map((item) => (
        <button key={item.url} type="button" onClick={() => openFile(item)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.url} alt={item.name || "Discussion homework"} loading="lazy" />
          <span>{item.name || "Open full image"}</span>
          <MappedTimestamp value={item.mappedAt} />
        </button>
      ))}
    </div>
  );
}

function ClassLearningPanel({
  item,
  assignments,
  section,
}: {
  item: ClassroomClass;
  assignments: Assignment[];
  section: ClassSection;
}) {
  const units = item.units ?? [];
  const calendar = item.calendar ?? [];
  const files = item.files ?? [];

  return (
    <article className="class-card">
      <div className="class-card-heading">
        <div>
          <h3>{item.name}</h3>
          <p>{item.latestActivity || "No recent activity captured."}</p>
          <MappedTimestamp value={item.mappedAt} />
        </div>
        <a href={item.url} target="_blank" rel="noreferrer">
          View class
        </a>
      </div>

      <div className="class-detail">
        {section === "stream" ? (
          <ClassContentList
            items={item.stream}
            empty="No recent class stream entries were captured."
            source={item.name}
            kind="Class stream"
          />
        ) : null}

        {section === "discussions" ? (
          <ClassContentList
            items={item.discussions}
            empty="No discussions were listed for this class."
            source={item.name}
            kind="Discussion"
          />
        ) : null}

        {section === "tasks" ? (
          <div className="task-unit-grid">
            <section>
              <h4>Tasks</h4>
              {assignments.length ? (
                <ul className="class-detail-list compact-list">
                  {assignments.map((assignment) => (
                    <li key={assignment.url}>
                      <a href={assignment.url} target="_blank" rel="noreferrer">
                        {assignment.title}
                      </a>
                      <span>{assignment.dueText || "Due date not listed"}</span>
                      <MappedTimestamp value={assignment.mappedAt} />
                      <SavedItemActions
                        compact
                        item={detailToPersonalization(
                          assignmentToDetail(assignment),
                        )}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">No current tasks were captured.</p>
              )}
            </section>
            <section>
              <h4>Units</h4>
              {units.length ? (
                <ul className="class-detail-list compact-list">
                  {units.map((unit) => (
                    <li key={unit.url}>
                      <a href={unit.url} target="_blank" rel="noreferrer">
                        {unit.title}
                      </a>
                      <p>{unit.detail}</p>
                      <MappedTimestamp value={unit.mappedAt} />
                      <SavedItemActions
                        compact
                        item={{
                          id: `class-unit-${unit.url}`,
                          category: "Class unit",
                          title: unit.title,
                          summary: unit.detail,
                          source: item.name,
                          sourceUrl: unit.url,
                          createdAt: unit.mappedAt,
                          attachments: [],
                        }}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">No units were listed.</p>
              )}
            </section>
          </div>
        ) : null}

        {section === "calendar" ? (
          calendar.length ? (
            <ul className="class-detail-list compact-list">
              {calendar.map((entry) => (
                <li key={`${entry.url}-${entry.title}`}>
                  <a href={entry.url} target="_blank" rel="noreferrer">
                    {entry.title}
                  </a>
                  <span>{entry.dateText}</span>
                  <MappedTimestamp value={entry.mappedAt} />
                  <SavedItemActions
                    compact
                    item={{
                      id: `calendar-${entry.url}-${entry.title}`,
                      category: "Calendar",
                      title: entry.title,
                      summary: entry.dateText,
                      source: item.name,
                      sourceUrl: entry.url,
                      createdAt: entry.mappedAt,
                      attachments: [],
                    }}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">No class calendar entries were listed.</p>
          )
        ) : null}

        {section === "files" ? (
          files.length ? (
            <div className="file-list">
              {files.map((file) => (
                <AttachmentButton key={file.url} file={file} />
              ))}
            </div>
          ) : (
            <p className="empty-state">No files were listed for this class.</p>
          )
        ) : null}
      </div>
    </article>
  );
}

type JournalWorkspaceItem =
  | { kind: "project"; project: WeeklyJournalHomeProject; weekKey: string }
  | {
      kind: "unit";
      subject: string;
      unit: WeeklyJournalUnit;
      weekKey: string;
    };

function journalToPersonalization(item: JournalWorkspaceItem): PersonalizationItem {
  if (item.kind === "project") {
    return {
      id: `journal-project-${item.weekKey}-${item.project.title}`,
      category: "Weekly journal project",
      title: item.project.title,
      summary: item.project.purpose,
      source: `${item.weekKey} · ${item.project.subjectLinks.join(" · ")}`,
      attachments: [],
    };
  }
  return {
    id: `journal-unit-${item.weekKey}-${item.subject}-${item.unit.name}`,
    category: "Weekly journal",
    title: item.unit.name,
    summary: item.unit.summary,
    source: `${item.weekKey} · ${item.subject}`,
    attachments: [],
  };
}

function JournalDetailWorkspace({
  item,
  onClose,
}: {
  item: JournalWorkspaceItem | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!item) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("detail-workspace-open");
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("detail-workspace-open");
    };
  }, [item, onClose]);

  if (!item) return null;
  const title = item.kind === "project" ? item.project.title : item.unit.name;
  const label = item.kind === "project" ? "Home project" : item.subject;

  return (
    <div className="detail-workspace-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="detail-workspace journal-detail-workspace"
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">{label}</p>
            <h2 id="journal-detail-title">{title}</h2>
          </div>
          <button className="workspace-close" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        {item.kind === "project" ? (
          <>
            <div className="detail-workspace-meta">
              <span>{item.project.estimatedTime}</span>
              <span>{item.project.subjectLinks.join(" · ")}</span>
            </div>
            <div className="detail-workspace-body journal-detail-body">
              <p>{item.project.purpose}</p>
              <section>
                <h3>What you need</h3>
                <p>{item.project.materials.join(" · ")}</p>
              </section>
              <section>
                <h3>Student steps</h3>
                <ol>{item.project.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              </section>
              <section className="parent-role-callout">
                <h3>Your role</h3>
                <p>{item.project.parentRole}</p>
              </section>
              <section>
                <h3>What good learning looks like</h3>
                <ul>{item.project.lookFor.map((entry) => <li key={entry}>{entry}</li>)}</ul>
              </section>
              <section>
                <h3>Reflect together</h3>
                <ul>
                  {item.project.reflectionQuestions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        ) : (
          <>
            <div className="detail-workspace-meta">
              <span>{item.subject}</span>
            </div>
            <div className="detail-workspace-body journal-detail-body">
              <p>{item.unit.summary}</p>
              {item.unit.learningGoals?.length ? (
                <section>
                  <h3>What the student is learning</h3>
                  <ul>{item.unit.learningGoals.map((goal) => <li key={goal}>{goal}</li>)}</ul>
                </section>
              ) : null}
              {item.unit.evidenceToListenFor?.length ? (
                <section className="learning-evidence-callout">
                  <h3>What understanding sounds like</h3>
                  <ul>
                    {item.unit.evidenceToListenFor.map((entry) => <li key={entry}>{entry}</li>)}
                  </ul>
                </section>
              ) : null}
              {item.unit.parentGuidance?.length ? (
                <section>
                  <h3>How a parent can guide</h3>
                  <ul>
                    {item.unit.parentGuidance.map((entry) => <li key={entry}>{entry}</li>)}
                  </ul>
                </section>
              ) : null}
              {item.unit.commonMisconceptions?.length ? (
                <section>
                  <h3>Misconceptions to probe</h3>
                  <ul>
                    {item.unit.commonMisconceptions.map((entry) => <li key={entry}>{entry}</li>)}
                  </ul>
                </section>
              ) : null}
              {item.unit.activities.length ? (
                <section>
                  <h3>ManageBac evidence used</h3>
                  <ul>{item.unit.activities.map((activity) => <li key={activity}>{activity}</li>)}</ul>
                </section>
              ) : null}
              <section>
                <h3>Questions for parents to ask</h3>
                <ol>{item.unit.questions.map((question) => <li key={question}>{question}</li>)}</ol>
              </section>
              {item.unit.homeExtension ? (
                <section className="unit-home-extension">
                  <h3>Try this at home</h3>
                  <p>{item.unit.homeExtension}</p>
                </section>
              ) : null}
              {item.unit.videos.length ? (
                <section>
                  <h3>Related videos</h3>
                  <div className="journal-video-links">
                    {item.unit.videos.map((video) => (
                      <a href={video.url} target="_blank" rel="noreferrer" key={video.url}>
                        {video.title}
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </>
        )}

        <footer>
          <SavedItemActions item={journalToPersonalization(item)} />
          <button type="button" onClick={onClose}>Done</button>
        </footer>
      </section>
    </div>
  );
}

function WeeklyJournalPanel({
  journal,
  journals,
  selectedWeek,
  onSelectWeek,
}: {
  journal: WeeklyJournal | null;
  journals: WeeklyJournalIndexItem[];
  selectedWeek: string;
  onSelectWeek: (week: string) => void;
}) {
  const [activeJournalDetail, setActiveJournalDetail] =
    useState<JournalWorkspaceItem | null>(null);
  const unitCount = journal?.subjects.reduce(
    (total, subject) => total + subject.units.length,
    0,
  ) ?? 0;
  const questionCount = journal?.subjects.reduce(
    (total, subject) =>
      total + subject.units.reduce((sum, unit) => sum + unit.questions.length, 0),
    0,
  ) ?? 0;
  const strengths = journal?.strengths ?? journal?.highlights ?? [];
  const growthAreas = journal?.growthAreas ?? journal?.attentionItems ?? [];

  return (
    <section className="weekly-journal" aria-labelledby="weekly-journal-title">
      <div className="section-heading journal-heading">
        <div>
          <p className="eyebrow">Weekly Journal</p>
          <h2 id="weekly-journal-title">Parent learning review</h2>
        </div>
        {journals.length ? (
          <label className="journal-week-picker">
            <span>Saved week</span>
            <select value={selectedWeek} onChange={(event) => onSelectWeek(event.target.value)}>
              {journals.map((item) => (
                <option value={item.weekKey} key={item.weekKey}>
                  {item.weekStart} to {item.weekEnd}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {journal ? (
        <>
          <article className="journal-overview">
            <div className="journal-overview-copy">
              <span>{journal.weekStart} to {journal.weekEnd}</span>
              <h3>This week, in plain language</h3>
              <p>{journal.overallSummary}</p>
              <p className="journal-parent-note">
                {journal.parentOverview ?? "Use the prompts below to check independent understanding and agree on one next step."}
              </p>
            </div>
            <div className="journal-at-a-glance" aria-label="Journal scope">
              <div><strong>{journal.subjects.length}</strong><span>subjects connected</span></div>
              <div><strong>{unitCount}</strong><span>learning focuses</span></div>
              <div><strong>{questionCount}</strong><span>mentoring prompts</span></div>
            </div>
          </article>

          <div className="journal-insight-grid">
            <section className="journal-insight-card strength-card">
              <p className="eyebrow">Build confidence</p>
              <h3>What learning to notice</h3>
              <p>Look for explanations, decisions, and connections—not only completed pages.</p>
              <ul>{strengths.slice(0, 5).map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
            <section className="journal-insight-card support-card">
              <p className="eyebrow">Support gently</p>
              <h3>Where mentoring will help</h3>
              <p>Keep the next step small, visible, and owned by the student.</p>
              <ul>{growthAreas.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          </div>

          {journal.mentoringPlan ? (
            <section className="mentor-guide">
              <header>
                <p className="eyebrow">A better parent conversation</p>
                <h3>A 10-minute mentoring guide</h3>
                <p>Pick two prompts. Listen first, then coach the thinking rather than giving the answer.</p>
              </header>
              <div className="mentor-guide-grid">
                <section>
                  <h4>Conversation starters</h4>
                  <ol>{journal.mentoringPlan.conversationStarters.map((item) => <li key={item}>{item}</li>)}</ol>
                </section>
                <section>
                  <h4>How to respond</h4>
                  <ul>{journal.mentoringPlan.coachingTips.map((item) => <li key={item}>{item}</li>)}</ul>
                </section>
              </div>
              <div className="mentor-routine">
                {journal.mentoringPlan.weeklyRoutine.map((item) => (
                  <div key={item.label}>
                    <strong>{item.label}</strong>
                    <span>{item.action}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {journal.homeProjects?.length ? (
            <section className="home-projects">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Learn by making</p>
                  <h2>Recommended projects at home</h2>
                  <p>Choose one—not all three. Let the student plan, make decisions, test, and reflect.</p>
                </div>
              </div>
              <div className="home-project-grid">
                {journal.homeProjects.map((project, index) => (
                  <article className="home-project-card" key={project.title}>
                    <div className="home-project-summary">
                      <div>
                        <div className="project-number">Project {index + 1}</div>
                        <h3>{project.title}</h3>
                        <p>{project.purpose}</p>
                      </div>
                      <div className="project-meta">
                        <span>{project.estimatedTime}</span>
                        {project.subjectLinks.map((subject) => <span key={subject}>{subject}</span>)}
                      </div>
                    </div>
                    <button
                      className="row-view-button"
                      type="button"
                      onClick={() =>
                        setActiveJournalDetail({
                          kind: "project",
                          project,
                          weekKey: journal.weekKey,
                        })
                      }
                    >
                      View project
                    </button>
                    <SavedItemActions
                      compact
                      item={journalToPersonalization({
                        kind: "project",
                        project,
                        weekKey: journal.weekKey,
                      })}
                    />
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <div className="journal-section-intro">
            <p className="eyebrow">Subject-by-subject</p>
            <h2>What was learned and how to guide it</h2>
            <p>Open a unit for the learning goals, evidence to listen for, likely misconceptions, questions, and a small home extension.</p>
          </div>

          <div className="journal-subjects">
            {journal.subjects.map((subject) => (
              <article className="journal-subject" key={subject.subject}>
                <header>
                  <h3>{subject.subject}</h3>
                  <p>{subject.summary}</p>
                  {subject.parentTakeaway ? (
                    <div className="parent-takeaway"><strong>Listen for</strong><span>{subject.parentTakeaway}</span></div>
                  ) : null}
                </header>
                <div className="journal-units">
                  {subject.units.map((unit) => (
                    <div
                      className="journal-unit-row"
                      key={`${subject.subject}-${unit.name}`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setActiveJournalDetail({
                            kind: "unit",
                            subject: subject.subject,
                            unit,
                            weekKey: journal.weekKey,
                          })
                        }
                      >
                        <span>{unit.name}</span>
                        <strong>View details</strong>
                      </button>
                      <SavedItemActions
                        compact
                        item={journalToPersonalization({
                          kind: "unit",
                          subject: subject.subject,
                          unit,
                          weekKey: journal.weekKey,
                        })}
                      />
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <p className="empty-state journal-empty">
          The first weekly journal will be recorded Friday at 5:00 PM IST.
        </p>
      )}
      <JournalDetailWorkspace
        item={activeJournalDetail}
        onClose={() => setActiveJournalDetail(null)}
      />
    </section>
  );
}

async function filesToUploads(files: File[]) {
  const uploads: PersonalizationUpload[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    uploads.push({
      name: file.name,
      contentType: file.type || "application/octet-stream",
      contentBase64: btoa(binary),
    });
  }
  return uploads;
}

function NoteEditor({
  item,
  existing,
  standalone,
  isSaving,
  onClose,
  onSave,
}: {
  item: PersonalizationItem | null;
  existing?: ItemNote;
  standalone: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (value: { title: string; text: string; files: File[] }) => void;
}) {
  const [title, setTitle] = useState(
    standalone ? "" : item?.title ?? "",
  );
  const [text, setText] = useState(existing?.text ?? "");
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    if (!item && !standalone) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("detail-workspace-open");
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("detail-workspace-open");
    };
  }, [isSaving, item, onClose, standalone]);

  if (!item && !standalone) return null;

  return (
    <div className="detail-workspace-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="detail-workspace note-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-editor-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">{standalone ? "My Notes" : "Item note"}</p>
            <h2 id="note-editor-title">
              {standalone ? "Add a note" : item?.title}
            </h2>
          </div>
          <button
            className="workspace-close"
            type="button"
            onClick={onClose}
            disabled={isSaving}
          >
            Close
          </button>
        </header>
        <form
          className="note-editor-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSave({ title, text, files });
          }}
        >
          {standalone ? (
            <label>
              <span>Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                placeholder="What is this note about?"
              />
            </label>
          ) : null}
          <label>
            <span>Note</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={20000}
              rows={9}
              placeholder="Add context, a reminder, or a follow-up question"
            />
          </label>
          <label className="note-upload">
            <span>Files and images</span>
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,image/png,image/jpeg,image/gif,image/webp"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
            <small>Up to 8 files, 5 MB each</small>
          </label>
          {existing?.attachments.length ? (
            <div className="note-existing-files">
              <span>Already attached</span>
              {existing.attachments.map((attachment) => (
                <AttachmentButton key={attachment.url} file={attachment} />
              ))}
            </div>
          ) : null}
          {files.length ? (
            <ul className="selected-files">
              {files.map((file) => (
                <li key={`${file.name}-${file.size}`}>
                  <span>{file.name}</span>
                  <small>{Math.ceil(file.size / 1024)} KB</small>
                </li>
              ))}
            </ul>
          ) : null}
          <footer>
            <button type="button" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save note"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function SavedWorkspace() {
  const {
    createNote,
    deleteNote,
    document,
    editNote,
    error,
    isSaving,
    toggleFavorite,
  } = usePersonalization();
  const openDetail = useDetailWorkspace();
  const itemNotes = new Map(
    document.itemNotes.map((note) => [note.item.id, note]),
  );
  const savedItems = new Map<string, PersonalizationItem>();
  for (const favorite of document.favorites) {
    savedItems.set(favorite.item.id, favorite.item);
  }
  for (const note of document.itemNotes) {
    savedItems.set(note.item.id, note.item);
  }

  return (
    <section className="saved-workspace" aria-labelledby="saved-workspace-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Parent workspace</p>
          <h2 id="saved-workspace-title">Favorites, annotations, and My Notes</h2>
        </div>
        <span>{savedItems.size + document.notes.length} saved items</span>
      </div>
      {error ? <p className="personalization-error">{error}</p> : null}
      <div className="saved-columns">
        <section className="saved-panel" aria-labelledby="favorites-notes-title">
          <div className="saved-panel-heading">
            <div>
              <p className="eyebrow">School items</p>
              <h3 id="favorites-notes-title">Favorites & notes</h3>
            </div>
            <strong>{savedItems.size}</strong>
          </div>
          {savedItems.size ? (
            <div className="saved-list">
              {[...savedItems.values()].map((item) => {
                const note = itemNotes.get(item.id);
                return (
                  <article className="saved-row" key={item.id}>
                    <div className="saved-row-heading">
                      <span>{item.category}</span>
                      <time>{item.createdAt ? formatDate(item.createdAt) : item.source}</time>
                    </div>
                    <h4>{item.title}</h4>
                    {item.summary ? <p className="truncated-copy">{item.summary}</p> : null}
                    {note?.text ? (
                      <blockquote>
                        <strong>My note</strong>
                        <span>{note.text}</span>
                      </blockquote>
                    ) : null}
                    {note?.attachments.length ? (
                      <div className="attachment-row compact-attachments">
                        {note.attachments.map((attachment) => (
                          <AttachmentButton key={attachment.url} file={attachment} />
                        ))}
                      </div>
                    ) : null}
                    <div className="row-actions">
                      <button
                        type="button"
                        onClick={() => openDetail(personalizationToDetail(item))}
                      >
                        View details
                      </button>
                      <button type="button" onClick={() => editNote(item)}>
                        {note ? "Edit note" : "Add note"}
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => toggleFavorite(item)}
                      >
                        {document.favorites.some(
                          (favorite) => favorite.item.id === item.id,
                        )
                          ? "Remove favorite"
                          : "Add favorite"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="empty-state">
              Favorite an alert, assignment, classroom item, or journal entry to keep it here.
            </p>
          )}
        </section>

        <section className="saved-panel" aria-labelledby="my-notes-title">
          <div className="saved-panel-heading">
            <div>
              <p className="eyebrow">Parent-created</p>
              <h3 id="my-notes-title">My Notes</h3>
            </div>
            <button type="button" onClick={createNote}>New note</button>
          </div>
          {document.notes.length ? (
            <div className="saved-list">
              {document.notes.map((note) => (
                <article className="saved-row my-note-row" key={note.id}>
                  <div className="saved-row-heading">
                    <span>My Notes</span>
                    <time>{formatDate(note.updatedAt)}</time>
                  </div>
                  <h4>{note.title}</h4>
                  {note.text ? <p>{note.text}</p> : null}
                  {note.attachments.length ? (
                    <div className="attachment-row compact-attachments">
                      {note.attachments.map((attachment) => (
                        <AttachmentButton key={attachment.url} file={attachment} />
                      ))}
                    </div>
                  ) : null}
                  <div className="row-actions">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => deleteNote(note.id)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">
              Add a private working note with text, documents, or images.
            </p>
          )}
        </section>
      </div>
    </section>
  );
}

export default function Home() {
  const [snapshot, setSnapshot] = useState<ClassroomSnapshot>(emptySnapshot);
  const [students, setStudents] = useState<StudentSummary[]>(defaultStudents);
  const [selectedStudent, setSelectedStudent] = useState("advika");
  const [historyCount, setHistoryCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [view, setView] = useState<DashboardView>("overview");
  const [classSection, setClassSection] = useState<ClassSection>("stream");
  const [activeFile, setActiveFile] = useState<Attachment | null>(null);
  const [activeDetail, setActiveDetail] = useState<DetailWorkspaceItem | null>(null);
  const [weeklyJournal, setWeeklyJournal] = useState<WeeklyJournal | null>(null);
  const [journalIndex, setJournalIndex] = useState<WeeklyJournalIndexItem[]>([]);
  const [selectedJournalWeek, setSelectedJournalWeek] = useState("");
  const [personalization, setPersonalization] =
    useState<PersonalizationDocument>(() => emptyPersonalization("advika"));
  const [personalizationSaving, setPersonalizationSaving] = useState(false);
  const [personalizationError, setPersonalizationError] = useState("");
  const [noteTarget, setNoteTarget] = useState<PersonalizationItem | null>(null);
  const [newNoteOpen, setNewNoteOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/classroom?student=${encodeURIComponent(selectedStudent)}`, {
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) {
          setSnapshot(data.snapshot ?? emptySnapshot);
          if (data.students?.length) setStudents(data.students);
          setHistoryCount(data.historyCount ?? 0);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSnapshot({
            ...emptySnapshot,
            studentName:
              selectedStudent === "adrika" ? "Adrika Lakshmi" : "Advika Lakshmi",
            status: "error",
            error: "The dashboard could not load the latest classroom snapshot.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedStudent]);

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams({ student: selectedStudent });
    if (selectedJournalWeek) query.set("week", selectedJournalWeek);
    fetch(`/api/weekly-journal?${query}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        if (cancelled) return;
        setWeeklyJournal(data.journal ?? null);
        setJournalIndex(data.journals ?? []);
        if (!selectedJournalWeek && data.journal?.weekKey) {
          setSelectedJournalWeek(data.journal.weekKey);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWeeklyJournal(null);
          setJournalIndex([]);
        }
      });
    return () => { cancelled = true; };
  }, [selectedStudent, selectedJournalWeek]);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/personalization?student=${encodeURIComponent(selectedStudent)}`,
      { cache: "no-store" },
    )
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled && data.document) setPersonalization(data.document);
      })
      .catch(() => {
        if (!cancelled) {
          setPersonalizationError(
            "Favorites and notes could not be loaded right now.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedStudent]);

  async function mutatePersonalization(mutation: PersonalizationMutation) {
    setPersonalizationSaving(true);
    setPersonalizationError("");
    try {
      const response = await fetch(
        `/api/personalization?student=${encodeURIComponent(selectedStudent)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(mutation),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "The change could not be saved.");
      }
      setPersonalization(data.document);
      return true;
    } catch (error) {
      setPersonalizationError(
        error instanceof Error ? error.message : "The change could not be saved.",
      );
      return false;
    } finally {
      setPersonalizationSaving(false);
    }
  }

  const subjectOptions = useMemo(
    () => {
      const assignmentCounts = new Map<string, number>();
      for (const assignment of snapshot.assignments) {
        const subject = assignment.className || "Other";
        assignmentCounts.set(subject, (assignmentCounts.get(subject) ?? 0) + 1);
      }

      const subjects = new Set([
        ...snapshot.classes.map((item) => item.name),
        ...assignmentCounts.keys(),
      ]);

      return [...subjects]
        .map((subject) => ({
          subject,
          count: assignmentCounts.get(subject) ?? 0,
        }))
        .sort((left, right) => left.subject.localeCompare(right.subject));
    },
    [snapshot.assignments, snapshot.classes],
  );

  const filteredAssignments = useMemo(() => {
    const term = query.trim().toLowerCase();
    return snapshot.assignments.filter((assignment) => {
      if (selectedSubject !== "all" && assignment.className !== selectedSubject) {
        return false;
      }
      if (!term) return true;
      return [
        assignment.title,
        assignment.className,
        assignment.description,
        assignment.unit,
        assignment.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [query, selectedSubject, snapshot.assignments]);

  const assignmentGroups = useMemo(
    () => groupAssignmentsBySubject(filteredAssignments),
    [filteredAssignments],
  );

  const filteredClasses = useMemo(
    () =>
      selectedSubject === "all"
        ? snapshot.classes
        : snapshot.classes.filter((item) => item.name === selectedSubject),
    [selectedSubject, snapshot.classes],
  );

  const parentAlerts = useMemo(() => deriveParentAlerts(snapshot), [snapshot]);

  const urgentCount = snapshot.assignments.filter((assignment) =>
    /not submitted|overdue|pending/i.test(`${assignment.status} ${assignment.dueText}`),
  ).length;

  const attachmentCount =
    snapshot.assignments.reduce(
      (sum, assignment) => sum + assignment.attachments.length,
      0,
    ) +
    snapshot.notifications.reduce(
      (sum, notification) => sum + (notification.attachments?.length ?? 0),
      0,
    ) +
    snapshot.classes.reduce(
      (sum, item) =>
        sum +
        (item.files?.length ?? 0) +
        (item.stream ?? []).reduce(
          (streamSum, entry) => streamSum + (entry.attachments?.length ?? 0),
          0,
        ) +
        (item.discussions ?? []).reduce(
          (discussionSum, entry) =>
            discussionSum + (entry.attachments?.length ?? 0),
          0,
        ),
      0,
    );

  const recentAssignments = snapshot.assignments
    .slice()
    .sort(
      (left, right) =>
        assignmentMappedTimestamp(right) - assignmentMappedTimestamp(left),
    )
    .slice(0, 6);

  const showSubjectFilter = view === "assignments" || view === "classes";
  const noteForTarget = noteTarget
    ? personalization.itemNotes.find(
        (note) => note.item.id === noteTarget.id,
      )
    : undefined;
  const personalizationContext = {
    document: personalization,
    isSaving: personalizationSaving,
    error: personalizationError,
    toggleFavorite: (item: PersonalizationItem) => {
      const favorite = personalization.favorites.some(
        (entry) => entry.item.id === item.id,
      );
      void mutatePersonalization({
        action: "set_favorite",
        item,
        favorite: !favorite,
      });
    },
    editNote: (item: PersonalizationItem) => {
      setActiveDetail(null);
      setActiveFile(null);
      setNewNoteOpen(false);
      setNoteTarget(item);
    },
    createNote: () => {
      setNoteTarget(null);
      setNewNoteOpen(true);
    },
    deleteNote: (noteId: string) => {
      void mutatePersonalization({ action: "delete_note", noteId });
    },
  };

  return (
    <PersonalizationContext.Provider value={personalizationContext}>
      <FileWorkspaceContext.Provider value={setActiveFile}>
      <DetailWorkspaceContext.Provider value={setActiveDetail}>
      <div className="enterprise-app">
        <header className="app-header">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">G</span>
            <div>
              <strong>Schoolwork</strong>
              <span>The Gaudium School</span>
            </div>
          </div>

          <div className="header-status" aria-live="polite">
            <span className={`sync-dot ${snapshot.status}`} />
            <div>
              <strong>{isLoading ? "Loading classroom data" : "ManageBac synced"}</strong>
              <span>{formatDate(snapshot.syncedAt)} · {historyCount} snapshots</span>
            </div>
          </div>

          <label className="student-select">
            <span id="student-switcher-title">Choose a classroom</span>
            <select
              aria-labelledby="student-switcher-title"
              value={selectedStudent}
              onChange={(event) => {
                const student = event.target.value;
                setIsLoading(true);
                setSelectedStudent(student);
                setSelectedSubject("all");
                setQuery("");
                setSelectedJournalWeek("");
                setPersonalization(emptyPersonalization(student));
                setPersonalizationError("");
              }}
            >
              {students.map((student) => (
                <option value={student.key} key={student.key}>
                  {student.name} · {student.status === "ok" ? "Synced" : student.status}
                </option>
              ))}
            </select>
          </label>
        </header>

        <div className="app-body">
          <aside className="app-sidebar" aria-label="Dashboard navigation">
            <nav className="primary-nav">
              {dashboardViews.map((item) => (
                <button
                  className={view === item.id ? "active" : ""}
                  key={item.id}
                  type="button"
                  aria-current={view === item.id ? "page" : undefined}
                  onClick={() => setView(item.id)}
                >
                  <span>{item.label}</span>
                  {item.id === "alerts" && parentAlerts.length ? (
                    <strong>{parentAlerts.length}</strong>
                  ) : null}
                </button>
              ))}
            </nav>

            {showSubjectFilter ? (
              <section
                className="sidebar-filter nested-submenu"
                aria-labelledby="subject-picker-title"
              >
                <div>
                  <p className="eyebrow">Subject choice</p>
                  <h2 id="subject-picker-title">Choose a subject</h2>
                </div>
                <div className="subject-options" role="group" aria-label="Subjects">
                  <button
                    className={selectedSubject === "all" ? "active" : ""}
                    type="button"
                    aria-pressed={selectedSubject === "all"}
                    onClick={() => setSelectedSubject("all")}
                  >
                    <span>All subjects</span>
                    <strong aria-label={`${snapshot.assignments.length} assignments`}>
                      {snapshot.assignments.length}
                    </strong>
                  </button>
                  {subjectOptions.map((option) => (
                    <button
                      className={selectedSubject === option.subject ? "active" : ""}
                      key={option.subject}
                      type="button"
                      aria-pressed={selectedSubject === option.subject}
                      onClick={() => setSelectedSubject(option.subject)}
                    >
                      <span>{option.subject}</span>
                      <strong aria-label={`${option.count} assignments`}>
                        {option.count}
                      </strong>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="sidebar-context">
              <span>Active student</span>
              <strong>{snapshot.studentName}</strong>
              <a href={snapshot.sourceUrl} target="_blank" rel="noreferrer">
                Open ManageBac
              </a>
            </section>
          </aside>

          <main className="app-workspace">
            <header className="workspace-heading">
              <div>
                <p className="eyebrow">{snapshot.studentName}</p>
                <h1 id="dashboard-title">Classroom workspace</h1>
              </div>
              <span className="workspace-date">Updated {formatDate(snapshot.syncedAt)}</span>
            </header>

            {showSubjectFilter ? (
              <label className="mobile-subject-filter">
                <span>Subject</span>
                <select
                  value={selectedSubject}
                  onChange={(event) => setSelectedSubject(event.target.value)}
                >
                  <option value="all">All subjects ({snapshot.assignments.length})</option>
                  {subjectOptions.map((option) => (
                    <option value={option.subject} key={option.subject}>
                      {option.subject} ({option.count})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {snapshot.error ? <p className="alert">{snapshot.error}</p> : null}

            {view === "overview" ? (
              <>
                <section className="summary-grid" aria-label="Classroom summary">
                  <button type="button" onClick={() => setView("assignments")}>
                    <span>Assignments</span>
                    <strong>{snapshot.assignments.length}</strong>
                    <small>{urgentCount} need attention</small>
                  </button>
                  <button type="button" onClick={() => setView("alerts")}>
                    <span>Parent alerts</span>
                    <strong>{parentAlerts.length}</strong>
                    <small>School and assessments</small>
                  </button>
                  <button type="button" onClick={() => setView("classes")}>
                    <span>Classes</span>
                    <strong>{snapshot.classes.length}</strong>
                    <small>Consolidated subjects</small>
                  </button>
                  <button type="button" onClick={() => setView("assignments")}>
                    <span>Attachments</span>
                    <strong>{attachmentCount}</strong>
                    <small>Files ready to review</small>
                  </button>
                </section>

                <div className="overview-grid">
                  <div className="overview-primary">
                    <ParentAlertsPanel
                      alerts={parentAlerts}
                      compact
                      limit={3}
                    />
                    {parentAlerts.length > 3 ? (
                      <button className="text-action" type="button" onClick={() => setView("alerts")}>
                        View all {parentAlerts.length} alerts
                      </button>
                    ) : null}
                  </div>

                  <section className="work-queue" aria-labelledby="recent-work-title">
                    <div className="section-heading">
                      <div>
                        <p className="eyebrow">Recent additions</p>
                        <h2 id="recent-work-title">Latest classroom work</h2>
                      </div>
                      <button type="button" onClick={() => setView("assignments")}>View all</button>
                    </div>
                    {recentAssignments.length ? (
                      <ul>
                        {recentAssignments.map((assignment) => (
                          <li key={assignment.url}>
                            <div>
                              <strong>{assignment.title}</strong>
                              <span>{assignment.className}</span>
                            </div>
                            <MappedTimestamp value={assignment.mappedAt} />
                            <span className="queue-status">
                              {assignment.source === "discussion"
                                ? "Discussion"
                                : assignment.dueText || "No due date"}
                            </span>
                            <SavedItemActions
                              compact
                              item={detailToPersonalization(
                                assignmentToDetail(assignment),
                              )}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="empty-state">No classroom work was captured.</p>
                    )}
                  </section>
                </div>

                <section className="overview-notices" aria-labelledby="latest-notices-title">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Latest notices</p>
                      <h2 id="latest-notices-title">What changed recently</h2>
                    </div>
                    <button type="button" onClick={() => setView("alerts")}>Open notice centre</button>
                  </div>
                  <div className="notice-strip">
                    {snapshot.notifications.slice(0, 4).map((notice) => (
                      <article key={`${notice.title}-${notice.url}`}>
                        <strong>{notice.title}</strong>
                        <span>{notice.detail}</span>
                        {notice.createdAt ? <time dateTime={notice.createdAt}>{formatDate(notice.createdAt)}</time> : null}
                        <div className="row-actions">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveDetail(notificationToDetail(notice))
                            }
                          >
                            View details
                          </button>
                          <SavedItemActions
                            compact
                            item={detailToPersonalization(
                              notificationToDetail(notice),
                            )}
                          />
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </>
            ) : null}

            {view === "alerts" ? (
              <>
                <ParentAlertsPanel alerts={parentAlerts} />
                <section className="lower-grid" aria-label="Notifications and calendar">
                  <article className="notice-panel">
                    <div className="section-heading compact">
                      <div>
                        <p className="eyebrow">Notifications</p>
                        <h2>Needs awareness</h2>
                      </div>
                    </div>
                    {snapshot.notifications.length ? (
                      <ul>
                        {snapshot.notifications.map((notice) => {
                          const isLong = notice.detail.length > 180;
                          return (
                            <li key={`${notice.title}-${notice.url}`}>
                              <article className="notice-card">
                                <strong>{notice.title}</strong>
                                <span className={isLong ? "truncated-copy" : ""}>
                                  {notice.detail}
                                </span>
                                <div className="notice-card-meta">
                                  {notice.createdAt ? (
                                    <time dateTime={notice.createdAt}>
                                      Posted {formatDate(notice.createdAt)}
                                    </time>
                                  ) : null}
                                  <MappedTimestamp value={notice.mappedAt} />
                                </div>
                                <div className="notice-card-actions">
                                  {isLong ? (
                                    <button
                                      type="button"
                                      onClick={() => setActiveDetail(notificationToDetail(notice))}
                                    >
                                      View details
                                    </button>
                                  ) : null}
                                  {notice.url && /^https?:/i.test(notice.url) ? (
                                    <a href={notice.url} target="_blank" rel="noreferrer">
                                      Open source
                                    </a>
                                  ) : null}
                                  <SavedItemActions
                                    compact
                                    item={detailToPersonalization(
                                      notificationToDetail(notice),
                                    )}
                                  />
                                </div>
                              </article>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="empty-state">No notification details were captured.</p>
                    )}
                  </article>

                  <article className="notice-panel">
                    <div className="section-heading compact">
                      <div>
                        <p className="eyebrow">Calendar</p>
                        <h2>Upcoming markers</h2>
                      </div>
                    </div>
                    {snapshot.calendar.length ? (
                      <ul>
                        {snapshot.calendar.map((item) => (
                          <li key={`${item.title}-${item.dateText}`}>
                            <strong>{item.title}</strong>
                            <span>{item.dateText}</span>
                            <MappedTimestamp value={item.mappedAt} />
                            {item.url ? (
                              <a href={item.url} target="_blank" rel="noreferrer">Open</a>
                            ) : null}
                            <SavedItemActions
                              compact
                              item={{
                                id: `calendar-${item.url}-${item.title}`,
                                category: "Calendar",
                                title: item.title,
                                summary: item.dateText,
                                source: snapshot.studentName,
                                sourceUrl: item.url,
                                createdAt: item.mappedAt,
                                attachments: [],
                              }}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="empty-state">Calendar events will appear after sync.</p>
                    )}
                  </article>
                </section>
              </>
            ) : null}

            {view === "assignments" ? (
        <section className="content-section" aria-labelledby="assignments-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Home Assignments</p>
              <h2 id="assignments-title">Due dates, instructions, and attachments</h2>
            </div>
            <label className="search-box">
              <span>Search</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Task, unit, status"
              />
            </label>
          </div>

          <div className="subject-list">
            {assignmentGroups.length ? (
              assignmentGroups.map((group) => (
                <section className="subject-group" key={group.subject}>
                  <div className="subject-heading">
                    <h3>{group.subject}</h3>
                    <span>{group.items.length} assignments - newest added first</span>
                  </div>
                  <div className="assignment-list">
                    {group.items.map((assignment) => (
                      <article
                        className={`assignment-card ${
                          assignment.source === "discussion"
                            ? "discussion-assignment"
                            : ""
                        }`}
                        key={assignment.url}
                      >
                        <div className="assignment-topline">
                          <MappedTimestamp value={assignment.mappedAt} />
                          <strong>
                            {assignment.source === "discussion"
                              ? "From discussion"
                            : urgency(assignment.dueText, assignment.status)}
                          </strong>
                        </div>
                        <h3>{assignment.title}</h3>
                        <dl>
                          <div>
                            <dt>Due</dt>
                            <dd>{assignment.dueText || "Not provided by teacher"}</dd>
                          </div>
                          <div>
                            <dt>Status</dt>
                            <dd>{assignment.status || "Unknown"}</dd>
                          </div>
                          <div>
                            <dt>Unit</dt>
                            <dd>{assignment.unit || "Not listed"}</dd>
                          </div>
                        </dl>
                        {assignment.description ? <p>{assignment.description}</p> : null}
                        <ImageGallery images={assignment.images} />
                        <div className="attachment-row">
                          {assignment.attachments.length ? (
                            assignment.attachments.map((attachment) => (
                              <AttachmentButton key={attachment.url} file={attachment} />
                            ))
                          ) : (
                            <span>No attachment included</span>
                          )}
                        </div>
                        <div className="row-actions">
                          <button
                            type="button"
                            onClick={() => setActiveDetail(assignmentToDetail(assignment))}
                          >
                            View details
                          </button>
                          <a href={assignment.url} target="_blank" rel="noreferrer">
                            Open source
                          </a>
                          <SavedItemActions
                            compact
                            item={detailToPersonalization(
                              assignmentToDetail(assignment),
                            )}
                          />
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <p className="empty-state">
                {selectedSubject === "all"
                  ? "No assignments match this search."
                  : `No assignments for ${selectedSubject} match the latest sync and search.`}
              </p>
            )}
          </div>
        </section>
            ) : null}

            {view === "classes" ? (
        <section className="content-section" aria-labelledby="classes-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Classroom Learnings</p>
              <h2 id="classes-title">Consolidated class details</h2>
            </div>
          </div>

          <div className="class-section-tabs" role="tablist" aria-label="Class sections">
            {classSections.map((section) => (
              <button
                className={classSection === section.id ? "active" : ""}
                key={section.id}
                onClick={() => setClassSection(section.id)}
                role="tab"
                type="button"
                aria-selected={classSection === section.id}
              >
                {section.label}
              </button>
            ))}
          </div>

          <div className="class-grid">
            {filteredClasses.length ? (
              filteredClasses.map((item) => (
                <ClassLearningPanel
                  assignments={snapshot.assignments.filter(
                    (assignment) => assignment.className === item.name,
                  )}
                  item={item}
                  key={item.url}
                  section={classSection}
                />
              ))
            ) : (
              <p className="empty-state">No classroom learning was captured.</p>
            )}
          </div>
        </section>
            ) : null}

            {view === "journal" ? (
        <WeeklyJournalPanel
          journal={weeklyJournal}
          journals={journalIndex}
          selectedWeek={selectedJournalWeek}
          onSelectWeek={setSelectedJournalWeek}
        />
            ) : null}

            {view === "saved" ? <SavedWorkspace /> : null}
          </main>
        </div>

        <nav className="mobile-nav" aria-label="Mobile dashboard navigation">
          {dashboardViews.map((item) => (
            <button
              className={view === item.id ? "active" : ""}
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
            >
              {item.shortLabel}
            </button>
          ))}
        </nav>
      </div>
      <DetailWorkspace
        item={activeDetail}
        key={`detail-${activeDetail?.id ?? "closed"}`}
        onClose={() => setActiveDetail(null)}
        onOpenFile={(file) => {
          setActiveDetail(null);
          setActiveFile(file);
        }}
      />
      <FileWorkspace
        file={activeFile}
        key={`file-${activeFile?.url ?? "closed"}`}
        onClose={() => setActiveFile(null)}
      />
      <NoteEditor
        key={
          newNoteOpen
            ? `new-note-${selectedStudent}`
            : `item-note-${noteTarget?.id ?? "closed"}`
        }
        item={noteTarget}
        existing={noteForTarget}
        standalone={newNoteOpen}
        isSaving={personalizationSaving}
        onClose={() => {
          if (!personalizationSaving) {
            setNoteTarget(null);
            setNewNoteOpen(false);
          }
        }}
        onSave={async ({ title, text, files }) => {
          try {
            const uploads = await filesToUploads(files);
            const saved = noteTarget
              ? await mutatePersonalization({
                  action: "save_item_note",
                  item: noteTarget,
                  text,
                  uploads,
                })
              : await mutatePersonalization({
                  action: "create_note",
                  title,
                  text,
                  uploads,
                });
            if (saved) {
              setNoteTarget(null);
              setNewNoteOpen(false);
              setView("saved");
            }
          } catch (error) {
            setPersonalizationError(
              error instanceof Error
                ? error.message
                : "The files could not be prepared.",
            );
          }
        }}
      />
      </DetailWorkspaceContext.Provider>
      </FileWorkspaceContext.Provider>
    </PersonalizationContext.Provider>
  );
}
