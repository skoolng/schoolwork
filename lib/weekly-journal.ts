import type {
  ClassroomSnapshot,
  WeeklyJournal,
  WeeklyJournalHomeProject,
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
  return [
    ...new Set(
      values
        .map((value) =>
          value
            .replace(/&amp;#39;|&#39;|&apos;/gi, "'")
            .replace(/&amp;|&/gi, "&")
            .replace(/\s+/g, " ")
            .trim(),
        )
        .filter(Boolean),
    ),
  ];
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
    `Teach me the most important idea from “${unit}” without looking at your notes.`,
    `Use “${activity}” to show how you applied that idea, not only what you completed.`,
    `What mistake might someone make in this topic, and how would you correct it?`,
    `Where could you use this learning outside school? Give a specific example.`,
  ];
  if (/math/i.test(subject)) {
    base[1] = `Create and solve a new problem based on “${activity}”. Show every step and explain why each step is valid.`;
  } else if (/science/i.test(subject)) {
    base[1] = `For “${activity}”, give a testable question, hypothesis, variables, fair-test controls, and the evidence you would collect.`;
  } else if (/french/i.test(subject)) {
    base[1] = `Without reading, introduce yourself or a family member in French using complete sentences from “${unit}”.`;
  } else if (/english/i.test(subject)) {
    base[1] = `Read a short section from “${activity}” and point out one deliberate writing choice and its effect on the reader.`;
  } else if (/individuals|societies/i.test(subject)) {
    base[1] = `Connect “${activity}” to a real community issue. Explain who is affected, why it matters, and one responsible action.`;
  } else if (/design/i.test(subject)) {
    base[1] = `Demonstrate the sequence or design behind “${activity}”, then explain how you would test and improve it for a user.`;
  }
  return base;
}

interface LearningProfile {
  goals: string[];
  evidence: string[];
  misconceptions: string[];
  guidance: string[];
  extension: string;
}

function learningProfile(subject: string, unit: string, activities: string[]): LearningProfile {
  const text = `${subject} ${unit} ${activities.join(" ")}`.toLowerCase();

  if (/english/.test(text) && /myth|legend|story|show.*tell|writing/.test(text)) {
    return {
      goals: [
        "Build an engaging narrative opening with a clear character, setting, and problem.",
        "Reveal character through actions, dialogue, thoughts, and reactions instead of direct labels.",
        "Use myths and legends to explore how beliefs and values shape a story.",
      ],
      evidence: [
        "The student can point to a sentence and explain how it creates mood or reveals character.",
        "The story has a purposeful sequence rather than a list of unrelated events.",
      ],
      misconceptions: [
        "Adding more adjectives automatically makes writing vivid.",
        "A myth is only fantasy; strong myths also communicate a culture's values or fears.",
      ],
      guidance: [
        "Ask for one sensory detail at a time: what could the character see, hear, or feel?",
        "Let the student revise one paragraph aloud instead of correcting the whole piece for them.",
      ],
      extension: "Turn a familiar family or community story into a 6-panel modern myth, showing the hero's traits through choices.",
    };
  }

  if (/design|pictoblox|program|interactive/.test(text)) {
    return {
      goals: [
        "Understand sprites, events, motion, looks, sound, control, sensing, and operator blocks.",
        "Arrange instructions in a logical sequence to create an interactive response.",
        "Research user needs and define success criteria before building a solution.",
      ],
      evidence: [
        "The student can predict what a block sequence will do before running it.",
        "The student can explain a bug, change one block, and test whether the change solved it.",
      ],
      misconceptions: [
        "A program is correct if it runs once; good design must work reliably for different users.",
        "Research is separate from designing; research should directly shape features and success criteria.",
      ],
      guidance: [
        "Ask the student to sketch the algorithm in plain language before opening PictoBlox.",
        "When something fails, ask 'What did you expect? What happened? Which block controls that?'",
      ],
      extension: "Build a three-question interactive safety quiz in PictoBlox with feedback for correct and incorrect answers.",
    };
  }

  if (/science/.test(text)) {
    return {
      goals: [
        "Frame a testable research question and an evidence-based hypothesis.",
        "Identify independent, dependent, and controlled variables for a fair investigation.",
        "Present data clearly, interpret patterns, draw a supported conclusion, and suggest improvements.",
      ],
      evidence: [
        "The student explains what is changed, what is measured, and what must stay the same.",
        "A conclusion refers to actual data rather than simply saying the hypothesis was correct.",
      ],
      misconceptions: [
        "A hypothesis is a guess with no reason; it should make a justified prediction.",
        "One successful result proves a claim; repeated measurements and method quality affect confidence.",
      ],
      guidance: [
        "Use everyday scenarios and ask the student to identify variables before discussing answers.",
        "Praise a well-explained limitation or improvement, not only a 'correct' result.",
      ],
      extension: "Run a fair home investigation comparing how quickly ice melts in two locations; record repeated measurements and graph the results.",
    };
  }

  if (/mathematics|math/.test(text)) {
    const fractionFocus = /fraction|decimal|percentage|profit|loss/.test(text);
    return {
      goals: fractionFocus
        ? [
            "Move flexibly between fractions, decimals, and percentages.",
            "Use common denominators and simplify answers accurately.",
            "Apply proportional reasoning to practical situations such as discounts, profit, and loss.",
          ]
        : [
            "Recognize number properties, factors, multiples, and patterns.",
            "Represent mathematical thinking with models, symbols, and ordered steps.",
            "Check whether an answer is reasonable using estimation or an alternative strategy.",
          ],
      evidence: [
        "The student explains why a method works instead of only reciting a rule.",
        "The student checks the answer and can represent it in a second way.",
      ],
      misconceptions: [
        fractionFocus
          ? "Adding denominators when adding fractions; equivalent fractions require a common-sized whole."
          : "Treating a memorized procedure as proof without checking its meaning.",
        "A calculator result is automatically reasonable; estimation should be used as a check.",
      ],
      guidance: [
        "Ask 'How do you know?' and 'Can you show it another way?' before confirming an answer.",
        "Use prices, recipes, or sports statistics so the mathematics has a visible purpose.",
      ],
      extension: "Plan a ₹1,000 family snack budget with two discounts, compare offers, and justify the best choice using fractions or percentages.",
    };
  }

  if (/individuals|societies|global citizen|map|settlement/.test(text)) {
    return {
      goals: [
        "Explain how rights, responsibilities, interdependence, and informed action shape global citizenship.",
        "Consider an issue from more than one stakeholder's perspective.",
        "Use evidence to propose a realistic action at local and global scales.",
      ],
      evidence: [
        "The student names who is affected and distinguishes an opinion from supporting evidence.",
        "A proposed action is specific, feasible, and linked to the cause of the problem.",
      ],
      misconceptions: [
        "Global citizenship only means helping people in other countries.",
        "A large problem has no meaningful local action; small actions matter when they are targeted and sustained.",
      ],
      guidance: [
        "Ask whose voice may be missing and what evidence would change the student's view.",
        "Compare one household action with one policy or community action; discuss the value of both.",
      ],
      extension: "Complete a three-day household plastic audit, graph the categories, and write a short action proposal to reduce the largest source.",
    };
  }

  if (/french/.test(text)) {
    return {
      goals: [
        "Introduce self, family, and friends using accurate core vocabulary.",
        "Build complete sentences with appropriate pronouns, verbs, and simple descriptions.",
        "Listen and respond without relying entirely on written prompts.",
      ],
      evidence: [
        "The student can speak for 30–60 seconds with understandable pronunciation.",
        "The student adapts a sentence to describe a different person rather than memorizing one script.",
      ],
      misconceptions: [
        "Translating every English word in the same order produces natural French.",
        "Reading accurately is the same as speaking independently.",
      ],
      guidance: [
        "Practise in short daily bursts and respond to meaning before correcting pronunciation.",
        "Use family photos and ask one follow-up question at a time.",
      ],
      extension: "Create a labelled family gallery and record a one-minute French audio tour introducing three people.",
    };
  }

  if (/visual art|warli|art element|identity/.test(text)) {
    return {
      goals: [
        "Use line, shape, colour, pattern, and composition deliberately to communicate identity.",
        "Investigate the origin, materials, symbols, purpose, and cultural significance of an art form.",
        "Distinguish respectful inspiration from copying cultural imagery without context.",
      ],
      evidence: [
        "The student explains why a visual choice supports the intended meaning.",
        "Research includes cultural context and sources, not only copied images.",
      ],
      misconceptions: [
        "Art analysis is just describing what is visible.",
        "Traditional art is decorative only; it can record community, ritual, history, and daily life.",
      ],
      guidance: [
        "Ask what the artist wanted the viewer to notice first and how the composition achieves that.",
        "Encourage experimentation with two thumbnail sketches before the final piece.",
      ],
      extension: "Design a respectful Warli-inspired scene of a present-day family routine, with a short note explaining the symbols and context.",
    };
  }

  if (/physical|health|fitness/.test(text)) {
    return {
      goals: [
        "Differentiate health-related and skill-related components of fitness.",
        "Connect a training activity to the component it develops.",
        "Plan exercise safely using warm-up, technique, recovery, and gradual progression.",
      ],
      evidence: [
        "The student matches an activity to a fitness component and explains the connection.",
        "The student proposes a safe, measurable way to improve over time.",
      ],
      misconceptions: [
        "Fitness only means endurance or appearance.",
        "More intensity is always better; recovery and correct technique are part of progress.",
      ],
      guidance: [
        "Focus discussion on energy, technique, consistency, and wellbeing rather than body shape.",
        "Let the student design a short routine and explain the purpose of each movement.",
      ],
      extension: "Design and lead a 15-minute family circuit covering three fitness components, then record effort and one improvement.",
    };
  }

  if (/guitar|vocal|music|scale|percussion/.test(text)) {
    return {
      goals: [
        "Recognize and perform steady beat, rhythm patterns, scales, and expressive musical elements.",
        "Plan, rehearse, perform, and reflect on a short musical idea.",
        "Use tempo, dynamics, and articulation to communicate mood.",
      ],
      evidence: [
        "The student keeps a steady pulse and can restart after an error.",
        "The student names one musical choice and explains its effect on the listener.",
      ],
      misconceptions: [
        "Playing every note correctly is the only measure of a successful performance.",
        "Faster practice produces faster improvement; slow, accurate repetition is often more effective.",
      ],
      guidance: [
        "Ask for a short performance twice and let the student choose one improvement between attempts.",
        "Record the performance so reflection is based on evidence rather than memory.",
      ],
      extension: "Create and record a 30-second body-percussion or guitar pattern with a clear beginning, variation, and ending.",
    };
  }

  return {
    goals: [
      `Explain the central ideas and vocabulary connected to “${unit}”.`,
      "Apply the learning to a new example and justify the choices made.",
      "Reflect on feedback, challenges, and a sensible next step.",
    ],
    evidence: [
      "The student explains the idea in their own words and gives a relevant example.",
      "The student can identify what they would improve in a second attempt.",
    ],
    misconceptions: ["Completing the activity is the same as understanding the underlying idea."],
    guidance: [
      "Ask the student to teach the idea before offering explanations.",
      "Request one example, one non-example, and one real-world connection.",
    ],
    extension: `Create a one-page explainer for “${unit}” with an example, a diagram, and a reflection.`,
  };
}

function homeProjectsFor(subjectNames: string[]): WeeklyJournalHomeProject[] {
  const names = subjectNames.join(" ").toLowerCase();
  const projects: WeeklyJournalHomeProject[] = [];

  if (/english/.test(names) && /design/.test(names)) {
    projects.push({
      title: "Interactive modern myth",
      purpose: "Combine narrative craft with computational thinking by turning a myth into a choice-based PictoBlox story.",
      estimatedTime: "2 sessions of 35 minutes",
      materials: ["Paper and pencil", "PictoBlox", "Optional voice recorder"],
      steps: [
        "Plan a hero, setting, problem, and two meaningful choices on paper.",
        "Storyboard three scenes and decide which event triggers each scene.",
        "Build the story with sprites, dialogue, motion, and at least one branch.",
        "Ask a family member to test it; record one problem and improve it.",
      ],
      parentRole: "Be the first user. Ask what each choice reveals about the character instead of suggesting the code or story solution.",
      lookFor: ["A clear story sequence", "Blocks used with purpose", "Improvement after user feedback"],
      reflectionQuestions: ["Which choice changes the story most?", "What did testing reveal that planning did not?"],
      subjectLinks: ["English", "Design"],
    });
  }

  if (/science/.test(names) && /math/.test(names)) {
    projects.push({
      title: "Kitchen-table fair test",
      purpose: "Practise scientific investigation and data reasoning with a safe experiment about melting ice.",
      estimatedTime: "45 minutes plus observation time",
      materials: ["Two equal ice cubes", "Two plates", "Timer", "Ruler or kitchen scale", "Notebook"],
      steps: [
        "Choose one factor to change, such as sunlight versus shade.",
        "Write a research question, hypothesis, variables, and fair-test controls.",
        "Measure at equal time intervals and repeat if practical.",
        "Make a graph, write a data-based conclusion, and identify one limitation.",
      ],
      parentRole: "Check safety and measurement consistency. Do not rescue an unexpected result—ask what it might mean.",
      lookFor: ["Only one planned variable changes", "A labelled data table or graph", "Conclusion refers to evidence"],
      reflectionQuestions: ["How fair was the comparison?", "What would make the evidence more reliable?"],
      subjectLinks: ["Sciences", "Mathematics"],
    });
  }

  if (/individuals|societies/.test(names)) {
    projects.push({
      title: "Three-day household plastic audit",
      purpose: "Turn global citizenship into informed local action using evidence rather than assumptions.",
      estimatedTime: "10 minutes daily for 3 days, then 30 minutes",
      materials: ["Collection sheet", "Pencil", "Optional spreadsheet", "Reusable containers for comparison"],
      steps: [
        "Define categories such as packaging, bottles, delivery items, and personal care.",
        "Count discarded plastic for three days without changing normal habits.",
        "Graph the categories and identify the largest source.",
        "Propose one realistic seven-day change and explain who must participate.",
      ],
      parentRole: "Help collect accurate data and discuss trade-offs such as cost, convenience, hygiene, and access.",
      lookFor: ["Consistent categories", "A claim supported by the audit", "A specific and feasible action"],
      reflectionQuestions: ["What surprised you?", "Which change would have the greatest realistic impact?"],
      subjectLinks: ["Individuals & Societies", "Mathematics"],
    });
  }

  if (/french/.test(names) || /visual art/.test(names)) {
    projects.push({
      title: "Family identity gallery",
      purpose: "Connect language, identity, and visual communication through a small family exhibition.",
      estimatedTime: "45–60 minutes",
      materials: ["Three family photos or drawings", "Paper", "Colour materials", "Phone recorder"],
      steps: [
        "Choose three people or family traditions to represent.",
        "Create a visual symbol, colour, or pattern for each choice.",
        "Add a short French introduction or identity caption for each.",
        "Record a one-minute gallery tour and revise one part after listening.",
      ],
      parentRole: "Share the story behind one family tradition and ask the student to decide how to represent it respectfully.",
      lookFor: ["Meaningful visual choices", "Complete language rather than isolated labels", "A clear link to identity"],
      reflectionQuestions: ["What does each symbol communicate?", "What became clearer after recording the explanation?"],
      subjectLinks: ["French", "Visual Arts"],
    });
  }

  return projects.slice(0, 3);
}

function subjectLabel(value: string) {
  return value
    .replace(/\s*\(MYP Year 1\).*$/i, "")
    .replace(/\s+MYP 1.*$/i, "")
    .replace(/^Individuals and Societies$/i, "Individuals & Societies")
    .trim();
}

function unitLabel(value: string) {
  return value
    .replace(/^.*?(?:Not Submitted|Submitted|Pending|Overdue)\s+/i, "")
    .replace(/^class discussion\s*/i, "")
    .trim();
}

function meaningfulActivity(value: string) {
  return !/^(?:homework|home task|doubts? clarification|time table|revision task)$/i.test(
    value.trim(),
  );
}

export function buildWeeklyJournal(
  studentKey: string,
  snapshot: ClassroomSnapshot,
): WeeklyJournal {
  const { weekStart, weekEnd, weekKey } = weekWindow();
  const classroomGroups = new Map<string, typeof snapshot.classes>();
  for (const classroom of snapshot.classes) {
    const label = subjectLabel(classroom.name);
    classroomGroups.set(label, [...(classroomGroups.get(label) ?? []), classroom]);
  }

  const subjects = [...classroomGroups.entries()].map(([label, classrooms]) => {
    const classNames = new Set(classrooms.map((classroom) => classroom.name));
    const assignments = snapshot.assignments.filter((assignment) =>
      classNames.has(assignment.className),
    );
    const discussions = classrooms
      .flatMap((classroom) => classroom.discussions)
      .filter((discussion) => meaningfulActivity(discussion.title));
    const assignmentUnits = unique(
      assignments
        .map((assignment) => unitLabel(assignment.unit))
        .filter((unit) => unit && !/class discussion|not listed/i.test(unit)),
    );
    const listedUnits = unique(
      classrooms.flatMap((classroom) => classroom.units.map((unit) => unitLabel(unit.title))),
    );
    const discussionTopics = unique(discussions.map((discussion) => discussion.title));
    const unitNames = unique(
      assignmentUnits.length
        ? [...assignmentUnits, ...listedUnits.slice(0, 1)]
        : [...discussionTopics.slice(0, 2), ...listedUnits.slice(0, 1)],
    ).slice(0, 3);
    const fallbackUnits = unitNames.length ? unitNames : ["Current classroom learning"];
    const units = fallbackUnits.map((unit) => {
      const unitAssignments = assignments.filter(
        (assignment) => unitLabel(assignment.unit) === unit,
      );
      const activities = unique([
        ...unitAssignments.map((assignment) => assignment.title),
        ...discussions.map((discussion) => discussion.title),
      ]).slice(0, 4);
      const profile = learningProfile(label, unit, activities);
      return {
        name: unit,
        summary: `The learning focus was to ${profile.goals
          .slice(0, 2)
          .map((goal) =>
            (goal.charAt(0).toLowerCase() + goal.slice(1)).replace(/[.!?]+$/, ""),
          )
          .join(" and to ")}.`,
        activities,
        learningGoals: profile.goals,
        evidenceToListenFor: profile.evidence,
        commonMisconceptions: profile.misconceptions,
        parentGuidance: profile.guidance,
        homeExtension: profile.extension,
        questions: questionsFor(label, unit, activities),
        videos: videosFor(label, unit),
      };
    });
    const goals = unique(units.flatMap((unit) => unit.learningGoals)).slice(0, 3);
    const evidence = unique(units.flatMap((unit) => unit.evidenceToListenFor));
    const activityNames = unique(units.flatMap((unit) => unit.activities)).slice(0, 2);
    return {
      subject: label,
      summary: `This week connected ${fallbackUnits.join(", ")}. ${goals.join(" ")}${
        activityNames.length ? ` Classroom evidence included ${activityNames.join(" and ")}.` : ""
      }`,
      parentTakeaway:
        evidence[0] ??
        `Ask ${snapshot.studentName.split(" ")[0]} to explain one idea from ${label} and apply it to a new example.`,
      units,
    };
  });

  const attentionBySubject = new Map<string, number>();
  for (const assignment of snapshot.assignments.filter((item) =>
    /not submitted|overdue|pending|late/i.test(`${item.status} ${item.dueText}`),
  )) {
    const label = subjectLabel(assignment.className);
    attentionBySubject.set(label, (attentionBySubject.get(label) ?? 0) + 1);
  }
  const attentionItems = [...attentionBySubject.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(
      ([subject, count]) =>
        `${subject}: choose the most urgent of ${count} pending item${count === 1 ? "" : "s"}, agree on a 20-minute start, and check that submission is complete.`,
    );
  const strengths = subjects.slice(0, 5).map(
    (subject) => `${subject.subject}: ${subject.units[0]?.learningGoals[0] ?? subject.summary}`,
  );
  const highlights = strengths;
  const growthAreas = attentionItems.length
    ? attentionItems
    : [
        "Strengthen retrieval: explain one topic daily without notes before checking accuracy.",
        "Strengthen transfer: connect one school idea to a home, community, or real-world situation.",
      ];
  const firstName = snapshot.studentName.split(" ")[0] || "your child";
  const focusUnits = unique(subjects.flatMap((subject) => subject.units.map((unit) => unit.name)));
  const homeProjects = homeProjectsFor(subjects.map((subject) => subject.subject));

  return {
    studentKey,
    studentName: snapshot.studentName,
    weekKey,
    weekStart,
    weekEnd,
    generatedAt: new Date().toISOString(),
    overallSummary: `${firstName}'s learning this week moved across ${subjects.length} subjects, with a strong emphasis on explaining ideas, applying them in a new situation, and reflecting on how work could improve. The most useful parent role is to ask for evidence and reasoning—not to reteach every lesson or supply the answer.`,
    parentOverview: `ManageBac shows the learning opportunities and work recorded for the week; it does not by itself prove mastery. Use this guide to listen for what ${firstName} can explain independently, notice where prompts are needed, and agree on one small next step. A confident explanation, a relevant example, and the ability to correct a mistake are stronger signs of understanding than task completion alone.`,
    strengths,
    growthAreas,
    mentoringPlan: {
      conversationStarters: [
        `What is one idea from ${focusUnits[0] ?? "this week"} that you understand differently now?`,
        `Show me a piece of work you are proud of. What decision did you make, and why?`,
        `Choose one difficult moment from this week. What strategy did you try before asking for help?`,
        `Which school idea could help us solve a problem at home or in our community?`,
      ],
      coachingTips: [
        "Begin with 'Teach me' and wait at least ten seconds; retrieval is more useful than rapid prompting.",
        "Ask for an example, a non-example, or evidence before deciding whether the idea is understood.",
        "Praise the strategy—planning, checking, revising, or persisting—rather than speed or talent.",
        "If the student is stuck, reduce the task to the first visible step and let them choose the next action.",
      ],
      weeklyRoutine: [
        { label: "Plan · 10 min", action: "Choose one pending task and one learning goal; write the first action for each." },
        { label: "Explain · 10 min", action: "The student teaches one unit without notes; the parent asks one evidence question." },
        { label: "Create · 30–45 min", action: `Complete one recommended home project with ${firstName} making the decisions.` },
        { label: "Reflect · 10 min", action: "Name one success, one correction, and one specific goal for the next week." },
      ],
    },
    homeProjects,
    highlights,
    attentionItems,
    subjects,
  };
}
