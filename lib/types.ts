export interface Attachment {
  name: string;
  url: string;
  sourceUrl?: string;
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

export interface WeeklyJournalVideo {
  title: string;
  url: string;
}

export interface WeeklyJournalUnit {
  name: string;
  summary: string;
  activities: string[];
  learningGoals: string[];
  evidenceToListenFor: string[];
  commonMisconceptions: string[];
  parentGuidance: string[];
  homeExtension: string;
  questions: string[];
  videos: WeeklyJournalVideo[];
}

export interface WeeklyJournalSubject {
  subject: string;
  summary: string;
  parentTakeaway: string;
  units: WeeklyJournalUnit[];
}

export interface WeeklyJournalHomeProject {
  title: string;
  purpose: string;
  estimatedTime: string;
  materials: string[];
  steps: string[];
  parentRole: string;
  lookFor: string[];
  reflectionQuestions: string[];
  subjectLinks: string[];
}

export interface WeeklyJournalMentoringPlan {
  conversationStarters: string[];
  coachingTips: string[];
  weeklyRoutine: Array<{ label: string; action: string }>;
}

export interface WeeklyJournal {
  studentKey: string;
  studentName: string;
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  overallSummary: string;
  parentOverview: string;
  strengths: string[];
  growthAreas: string[];
  mentoringPlan: WeeklyJournalMentoringPlan;
  homeProjects: WeeklyJournalHomeProject[];
  highlights: string[];
  attentionItems: string[];
  subjects: WeeklyJournalSubject[];
}

export interface WeeklyJournalIndexItem {
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
}
