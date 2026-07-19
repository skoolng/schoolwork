export interface Attachment {
  name: string;
  url: string;
}

export interface Assignment {
  title: string;
  className: string;
  dueText: string;
  status: string;
  unit: string;
  description: string;
  url: string;
  attachments: Attachment[];
  images?: Attachment[];
  source?: "task" | "discussion";
}

export interface ClassContentItem {
  title: string;
  detail: string;
  dateText: string;
  url: string;
  attachments: Attachment[];
  images?: Attachment[];
}

export interface ClassUnit {
  title: string;
  detail: string;
  url: string;
}

export interface ClassroomClass {
  name: string;
  url: string;
  latestActivity: string;
  stream: ClassContentItem[];
  discussions: ClassContentItem[];
  units: ClassUnit[];
  calendar: CalendarItem[];
  files: Attachment[];
}

export interface NotificationItem {
  title: string;
  detail: string;
  url: string;
}

export interface CalendarItem {
  title: string;
  dateText: string;
  url: string;
}

export interface ClassroomSnapshot {
  studentName: string;
  syncedAt: string;
  sourceUrl: string;
  status: "ok" | "pending" | "error";
  error: string;
  notifications: NotificationItem[];
  classes: ClassroomClass[];
  assignments: Assignment[];
  calendar: CalendarItem[];
}

export interface StudentSummary {
  key: string;
  name: string;
  syncedAt: string;
  status: "ok" | "pending" | "error";
}
