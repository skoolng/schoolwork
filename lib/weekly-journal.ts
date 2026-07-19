import type {
  Assignment,
  ClassroomSnapshot,
  WeeklyJournal,
  WeeklyJournalVideo,
} from "./types";

const videoCatalog: Array<{
  match: RegExp;
  videos: WeeklyJournalVideo[];
}> = [
  {
    match: /science/i,
    videos: [
      {
        title: "Scientific Method for Kids — Learn Bright",
        url: "https://www.youtube.com/watch?v=qQBZbinoOrI",
      },
    ],
  },
  {
    match: /mathematics|math/i,
    videos: [
      {
        title: "Math Antics — Factoring",
        url: "https://www.youtube.com/watch?v=0NvLtTwnUHs",
      },
      {
        title: "Math Antics — Fractions and Decimals",
        url: "https://www.youtube.com/watch?v=Mst8iZjIpFE",
      },
    ],
  },
  {
    match: /french/i,
    videos: [
      {
        title: "Family Words in French — Learn French With Alexa",
        url: "https://www.youtube.com/watch?v=L5-3kpXaEi4",
      },
    ],
  },
  {
    match: /individuals|societies|global citizen|map/i,
    videos: [
      {
        title: "What Is Global Citizenship for Kids?",
        url: "https://www.youtube.com/watch?v=1fugHkJzDao",
      },
      {
        title: "Maps for Kids — Learn Bright",
        url: "https://www.youtube.com/watch?v=UZaTK7B0doE",
      },
    ],
  },
  {
    match: /english/i,
    videos: [
      {
        title: "Persuasive Writing for Kids — Episode 1",
        url: "https://www.youtube.com/watch?v=hD9arWXIddM",
      },
    ],
  },
  {
    match: /visual art/i,
    videos: [
      {
        title: "The Elements of Art — Scratch Garden",
        url: "https://www.youtube.com/watch?v=IkvH7HaqCYk",
      },
    ],
  },
  {
    match: /physical|health|fitness/i,
    videos: [
      {
        title: "The Five Components of Fitness",
        url: "https://www.youtube.com/watch?v=NhpJiU9EUJA",
      },
    ],
  },
  {
    match: /guitar|vocal|music/i,
    videos: [
      {
        title: "Music Scales Explained in 6 Minutes",
        url: "https://www.youtube.com/watch?v=PG_u4NDJtwU",
      },
    ],
  },
  {
    match: /design|digital|cyber|pictoblox/i,
    videos: [
      {
        title: "Online Privacy for Kids",
        url: "https://www.youtube.com/watch?v=yiKeLOKc1tw",
      },
      {
        title: "Getting Started with PictoBlox — STEMpedia",
        url: "https://www.youtube.com/watch?v=wB7ONAcT55I",
      },
    ],
  },
];

function indiaDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function isoDateInIndia(date: Date) {
  const parts = indiaDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function weekWindow(now = new Date()) {
  const parts = indiaDateParts(now);
  const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    parts.weekday,
  );
  const localNoon = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00+05:30`);
  const monday = new Date(localNoon);
  monday.setUTCDate(monday.getUTCDate() - ((dayIndex + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const weekStart = isoDateInIndia(monday);
  const weekEnd = isoDateInIndia(sunday);
  return { weekStart, weekEnd, weekKey: `${weekStart}_${weekEnd}` };
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function videosFor(subject: string, unit: string) {
  const text = `${subject} ${unit}`;
  return videoCatalog
    .filter((entry) => entry.match.test(text))
    .flatMap((entry) => entry.videos)
    .filter(
      (video, index, videos) =>
        videos.findIndex((candidate) => candidate.url === video.url) === index,
    )
    .slice(0, 2);
}

function questionsFor(subject: string, unit: string, activities: string[]) {
  const activity = activities[0] ?? unit;
  const base = [
    `Explain “${unit}” in your own words and give one example.`,
    `Using “${activity}”, describe the main idea or skill you practised.`,
    `What part of this unit was most challenging, and how would you solve it now?`,
  ];
  if (/math/i.test(subject)) {
    base[1] = `Create and solve a new example based on “${activity}”, showing every step.`;
  } else if (/science/i.test(subject)) {
    base[1] = `For “${activity}”, state a testable question, hypothesis, variables, and expected evidence.`;
  } else if (/french/i.test(subject)) {
    base[1] = `Answer in French: introduce yourself or a family member using vocabulary from “${unit}”.`;
  } else if (/english/i.test(subject)) {
    base[1] = `Use evidence from “${activity}” to explain or persuade a parent in three clear sentences.`;
  } else if (/individuals|societies/i.test(subject)) {
    base[1] = `Connect “${activity}” to a real place or current community and explain cause and effect.`;
  } else if (/design/i.test(subject)) {
    base[1] = `Describe the design steps and success criteria you would use for “${activity}”.`;
  }
  return base;
}

function assignmentSummary(assignments: Assignment[]) {
  const titles = unique(assignments.map((item) => item.title)).slice(0, 4);
  return titles.length
    ? `Learning evidence included ${titles.join("; ")}.`
    : "The unit remained active in the classroom plan; ask the student to explain the current focus.";
}

export function buildWeeklyJournal(
  studentKey: string,
  snapshot: ClassroomSnapshot,
): WeeklyJournal {
  const { weekStart, weekEnd, weekKey } = weekWindow();
  const subjects = snapshot.classes.map((classroom) => {
    const assignments = snapshot.assignments.filter(
      (assignment) => assignment.className === classroom.name,
    );
    const discussions = classroom.discussions.slice(0, 5);
    const unitNames = unique([
      ...assignments.map((assignment) => assignment.unit).filter(
        (unit) => unit && !/class discussion|not listed/i.test(unit),
      ),
      ...classroom.units.slice(0, 2).map((unit) => unit.title),
    ]).slice(0, 3);
    const fallbackUnit = unitNames.length ? unitNames : ["Current classroom learning"];
    const units = fallbackUnit.map((unit) => {
      const unitAssignments = assignments.filter(
        (assignment) => assignment.unit === unit,
      );
      const activities = unique([
        ...unitAssignments.map((assignment) => assignment.title),
        ...discussions.map((discussion) => discussion.title),
      ]).slice(0, 5);
      const evidence = unitAssignments.length ? unitAssignments : assignments.slice(0, 4);
      return {
        name: unit,
        summary: assignmentSummary(evidence),
        activities,
        questions: questionsFor(classroom.name, unit, activities),
        videos: videosFor(classroom.name, unit),
      };
    });
    return {
      subject: classroom.name,
      summary: `${assignments.length} tracked assignment${assignments.length === 1 ? "" : "s"} and ${discussions.length} recent discussion item${discussions.length === 1 ? "" : "s"} informed this subject summary.`,
      units,
    };
  });

  const attentionItems = unique(
    snapshot.assignments
      .filter((assignment) =>
        /not submitted|overdue|pending|late/i.test(
          `${assignment.status} ${assignment.dueText}`,
        ),
      )
      .map(
        (assignment) =>
          `${assignment.className}: ${assignment.title}${assignment.dueText ? ` (${assignment.dueText})` : ""}`,
      ),
  ).slice(0, 10);
  const highlights = unique(
    snapshot.assignments
      .filter((assignment) => !/not submitted|overdue|late/i.test(assignment.status))
      .map((assignment) => `${assignment.className}: ${assignment.title}`),
  ).slice(0, 10);

  return {
    studentKey,
    studentName: snapshot.studentName,
    weekKey,
    weekStart,
    weekEnd,
    generatedAt: new Date().toISOString(),
    overallSummary: `${snapshot.studentName} had learning recorded across ${subjects.length} subjects, with ${snapshot.assignments.length} assignments and ${snapshot.classes.reduce((sum, classroom) => sum + classroom.discussions.length, 0)} classroom discussion items available for review. Use the unit question sets below to check recall, explanation, application, and reflection.`,
    highlights,
    attentionItems,
    subjects,
  };
}
