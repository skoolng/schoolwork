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
  StudentSummary,
} from "../lib/types";

const FileWorkspaceContext = createContext<
  ((file: Attachment) => void) | null
>(null);

function useFileWorkspace() {
  const openFile = useContext(FileWorkspaceContext);
  if (!openFile) throw new Error("File workspace is unavailable.");
  return openFile;
}

type ClassSection = "stream" | "tasks" | "discussions" | "calendar" | "files";

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

function AttachmentButton({ file }: { file: Attachment }) {
  const openFile = useFileWorkspace();
  return (
    <button className="attachment-button" type="button" onClick={() => openFile(file)}>
      <span aria-hidden="true">{fileKind(file)}</span>
      {file.name || hostOnly(file.url)}
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
    setRotation(0);
    setZoom(1);
  }, [file?.url]);

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

function assignmentDueTimestamp(assignment: Assignment) {
  const dueText = assignment.dueText || "";
  const monthDay = dueText.match(/\b[A-Z][a-z]{2,8}\s+\d{1,2}\b/)?.[0];
  const time = dueText.match(/\b\d{1,2}:\d{2}\s+(?:AM|PM)\b/i)?.[0] ?? "11:59 PM";
  if (!monthDay) return 0;

  const parsed = new Date(`${monthDay} ${new Date().getFullYear()} ${time}`);
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
            assignmentDueTimestamp(right) - assignmentDueTimestamp(left) ||
            right.title.localeCompare(left.title),
        ),
    }))
    .sort((left, right) => left.subject.localeCompare(right.subject));
}

function ClassContentList({
  items = [],
  empty,
}: {
  items?: ClassContentItem[];
  empty: string;
}) {
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
          {content.detail ? <p>{content.detail}</p> : null}
          <ImageGallery images={content.images} />
          {content.attachments?.length ? (
            <div className="attachment-row compact-attachments">
              {content.attachments.map((attachment) => (
                <AttachmentButton key={attachment.url} file={attachment} />
              ))}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ImageGallery({ images = [] }: { images?: { name: string; url: string }[] }) {
  const openFile = useFileWorkspace();
  if (!images.length) return null;

  return (
    <div className="homework-image-gallery" aria-label="Homework images">
      {images.map((item) => (
        <button key={item.url} type="button" onClick={() => openFile(item)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.url} alt={item.name || "Discussion homework"} loading="lazy" />
          <span>{item.name || "Open full image"}</span>
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
          />
        ) : null}

        {section === "discussions" ? (
          <ClassContentList
            items={item.discussions}
            empty="No discussions were listed for this class."
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

export default function Home() {
  const [snapshot, setSnapshot] = useState<ClassroomSnapshot>(emptySnapshot);
  const [students, setStudents] = useState<StudentSummary[]>(defaultStudents);
  const [selectedStudent, setSelectedStudent] = useState("advika");
  const [historyCount, setHistoryCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [view, setView] = useState<"all" | "assignments" | "classes">("all");
  const [classSection, setClassSection] = useState<ClassSection>("stream");
  const [activeFile, setActiveFile] = useState<Attachment | null>(null);

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

  const urgentCount = snapshot.assignments.filter((assignment) =>
    /not submitted|overdue|pending/i.test(`${assignment.status} ${assignment.dueText}`),
  ).length;

  const attachmentCount =
    snapshot.assignments.reduce(
      (sum, assignment) => sum + assignment.attachments.length,
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

  return (
    <FileWorkspaceContext.Provider value={setActiveFile}>
    <main className="classroom-shell">
      <section className="hero-panel" aria-labelledby="dashboard-title">
        <div>
          <p className="eyebrow">The Gaudium School</p>
          <h1 id="dashboard-title">
            {snapshot.studentName.split(/\s+/)[0] || "Student"} Classroom
          </h1>
          <p className="hero-copy">
            A private, lasting record of classroom learnings, home assignments,
            attachments, due dates, and ManageBac notifications.
          </p>
        </div>
        <div className="sync-card" aria-live="polite">
          <span className={`sync-dot ${snapshot.status}`} />
          <div>
            <strong>{isLoading ? "Loading classroom data" : "Latest sync"}</strong>
            <span>{formatDate(snapshot.syncedAt)}</span>
            <span>{historyCount} saved snapshots</span>
          </div>
        </div>
      </section>

      <section className="student-switcher" aria-labelledby="student-switcher-title">
        <div>
          <p className="eyebrow">Student</p>
          <h2 id="student-switcher-title">Choose a classroom</h2>
        </div>
        <div className="student-options" role="group" aria-label="Students">
          {students.map((student) => (
            <button
              className={selectedStudent === student.key ? "active" : ""}
              key={student.key}
              type="button"
              aria-pressed={selectedStudent === student.key}
              onClick={() => {
                setIsLoading(true);
                setSelectedStudent(student.key);
                setSelectedSubject("all");
                setQuery("");
              }}
            >
              <span>{student.name}</span>
              <small>{student.status === "ok" ? "Synced" : student.status}</small>
            </button>
          ))}
        </div>
      </section>

      {snapshot.error ? <p className="alert">{snapshot.error}</p> : null}

      <section className="summary-grid" aria-label="Classroom summary">
        <article>
          <span>Assignments</span>
          <strong>{snapshot.assignments.length}</strong>
          <p>{urgentCount} need attention</p>
        </article>
        <article>
          <span>Classes</span>
          <strong>{snapshot.classes.length}</strong>
          <p>Recent stream activity included</p>
        </article>
        <article>
          <span>Attachments</span>
          <strong>{attachmentCount}</strong>
          <p>Linked from ManageBac</p>
        </article>
        <article>
          <span>Notifications</span>
          <strong>{snapshot.notifications.length}</strong>
          <p>Items to review</p>
        </article>
      </section>

      <section className="toolbar" aria-label="Dashboard controls">
        <div className="segmented" role="tablist" aria-label="View">
          {(["all", "assignments", "classes"] as const).map((item) => (
            <button
              key={item}
              className={view === item ? "active" : ""}
              onClick={() => setView(item)}
              type="button"
            >
              {item === "all" ? "Overview" : item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
        <label className="search-box">
          <span>Search</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Subject, task, unit, status"
          />
        </label>
      </section>

      <section className="subject-picker" aria-labelledby="subject-picker-title">
        <div className="subject-picker-intro">
          <p className="eyebrow">Subject Choice</p>
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
              <strong aria-label={`${option.count} assignments`}>{option.count}</strong>
            </button>
          ))}
        </div>
      </section>

      {(view === "all" || view === "assignments") && (
        <section className="content-section" aria-labelledby="assignments-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Home Assignments</p>
              <h2 id="assignments-title">Due dates, instructions, and attachments</h2>
            </div>
            <a href={snapshot.sourceUrl} target="_blank" rel="noreferrer">
              Open ManageBac
            </a>
          </div>

          <div className="subject-list">
            {assignmentGroups.length ? (
              assignmentGroups.map((group) => (
                <section className="subject-group" key={group.subject}>
                  <div className="subject-heading">
                    <h3>{group.subject}</h3>
                    <span>{group.items.length} assignments - latest due first</span>
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
                          <span>{assignment.dueText || "Due date not listed"}</span>
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
                            <dd>{assignment.dueText || "Not listed"}</dd>
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
      )}

      {(view === "all" || view === "classes") && (
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
      )}

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
              {snapshot.notifications.map((notice) => (
                <li key={`${notice.title}-${notice.url}`}>
                  <strong>{notice.title}</strong>
                  <span>{notice.detail}</span>
                  {notice.url ? (
                    <a href={notice.url} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  ) : null}
                </li>
              ))}
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
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">Calendar events will appear after sync.</p>
          )}
        </article>
      </section>
    </main>
    <FileWorkspace file={activeFile} onClose={() => setActiveFile(null)} />
    </FileWorkspaceContext.Provider>
  );
}
