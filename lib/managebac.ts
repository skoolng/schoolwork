import { parse } from "node-html-parser";
import type {
  Assignment,
  Attachment,
  CalendarItem,
  ClassroomClass,
  ClassroomSnapshot,
  NotificationItem,
} from "./types";

const DEFAULT_BASE_URL = "https://thegaudium.managebac.com";
const TASK_LINK_PATTERN = /\/student\/classes\/\d+\/core_tasks\/\d+/;
const CLASS_LINK_PATTERN = /\/student\/classes\/\d+$/;
const MONTH_DAY = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}\b/i;
const CLASS_SECTION_PATTERN = /\/student\/classes\/\d+\/(?:class_stream|units|calendar|discussions|files)\/?$/;
const DISCUSSION_LINK_PATTERN = /\/student\/classes\/\d+\/discussions\/\d+/;
const DISCUSSION_INDEX_PATTERN = /\/student\/classes\/\d+\/discussions\/?$/;
const UNIT_LINK_PATTERN = /\/student\/classes\/\d+\/units\/\d+\/presentations/;
const ASSET_PATTERN = /\/attachments\/|\/files\/|\/download(?:s)?\/|\.(?:pdf|docx?|xlsx?|pptx?|mp3|mp4|m4a|wav|jpe?g|png)(?:\?|$)/i;
const DISCUSSION_ASSIGNMENT_PATTERN = /\b(?:home\s*(?:assignment|learning|task|work)|assignment|assessment|complete|create|deadline|draw|exercise|find|finish|learn|listen|memorise|notebook|practice|practise|prepare|question\s*answers?|reading\s*comprehension|revise|solve|submit|task|test|watch|worksheet|write)\b/i;
const IMAGE_ASSIGNMENT_PATTERN = /\b(?:exercise|fraction|home\s*work|problem|practice|practise|question|revision|task|test|worksheet)\b/i;
const NON_ASSIGNMENT_IMAGE_PATTERN = /\b(?:announcement|celebration|competition|event|parliament|poster|register|registration|schedule|time\s*table|timetable)\b/i;
const IMAGE_NAME_PATTERN = /\.(?:avif|gif|jpe?g|png|webp)(?:\?|$)/i;
const MAX_DISCUSSION_PAGES = 50;

interface Credentials {
  baseUrl: string;
  login: string;
  password: string;
}

interface PageResult {
  url: string;
  status: number;
  text: string;
}

interface LinkResult {
  url: string;
  text: string;
}

interface ClassScrapeResult {
  classroom: ClassroomClass;
  taskLinks: LinkResult[];
}

export interface ArchivedAsset {
  path: string;
  content: Uint8Array;
  contentType: string;
  sourceUrl: string;
}

export interface ArchivedClassroomSnapshot {
  snapshot: ClassroomSnapshot;
  assets: ArchivedAsset[];
}

class ManageBacSession {
  private cookies = new Map<string, string>();

  constructor(private baseUrl: string) {}

  private cookieHeader(url: string) {
    const host = new URL(url).hostname;
    return [...this.cookies]
      .filter(([key]) => {
        const [domain] = key.split("|");
        return host === domain || host.endsWith(`.${domain}`);
      })
      .map(([key, value]) => `${key.split("|")[1]}=${value}`)
      .join("; ");
  }

  private remember(url: string, response: Response) {
    const host = new URL(url).hostname;
    const getSetCookie = (
      response.headers as Headers & { getSetCookie?: () => string[] }
    ).getSetCookie;
    const setCookie = getSetCookie
      ? getSetCookie.call(response.headers)
      : response.headers.get("set-cookie")
        ? [response.headers.get("set-cookie") as string]
        : [];

    for (const cookie of setCookie) {
      const pair = cookie.split(";")[0];
      const [name, ...rest] = pair.split("=");
      const domain =
        cookie.match(/domain=([^;]+)/i)?.[1]?.replace(/^\./, "") ?? host;
      this.cookies.set(`${domain}|${name}`, rest.join("="));
    }
  }

  private async request(url: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    const cookie = this.cookieHeader(url);
    if (cookie) headers.set("cookie", cookie);

    const response = await fetch(url, {
      ...init,
      headers,
      redirect: "manual",
    });
    this.remember(url, response);
    return response;
  }

  async fetchFollowing(url: string, init: RequestInit = {}): Promise<PageResult> {
    let current = url;
    let response = await this.request(current, init);

    for (
      let index = 0;
      index < 10 && [301, 302, 303, 307, 308].includes(response.status);
      index += 1
    ) {
      const location = response.headers.get("location");
      if (!location) break;
      current = new URL(location, current).toString();
      response = await this.request(current, { method: "GET" });
    }

    return {
      url: current,
      status: response.status,
      text: await response.text(),
    };
  }

  async downloadFollowing(url: string) {
    let current = url;
    let response = await this.request(current);

    for (
      let index = 0;
      index < 10 && [301, 302, 303, 307, 308].includes(response.status);
      index += 1
    ) {
      const location = response.headers.get("location");
      if (!location) break;
      current = new URL(location, current).toString();
      response = await this.request(current, { method: "GET" });
    }

    if (!response.ok) {
      throw new Error(`Asset download failed with ${response.status}: ${url}`);
    }

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    if (/text\/html/i.test(contentType)) {
      throw new Error(`Asset download returned HTML instead of a file: ${url}`);
    }

    return {
      content: new Uint8Array(await response.arrayBuffer()),
      contentType,
    };
  }

  async login(login: string, password: string) {
    const loginPage = await this.fetchFollowing(`${this.baseUrl}/login`);
    const token =
      loginPage.text.match(/name="authenticity_token" value="([^"]+)/)?.[1] ??
      loginPage.text.match(/name="csrf-token" content="([^"]+)/)?.[1];

    if (!token) {
      throw new Error("ManageBac login token was not found.");
    }

    const body = new URLSearchParams({
      authenticity_token: token,
      login,
      password,
      remember_me: "0",
      commit: "Sign in",
    });

    const result = await this.fetchFollowing(`${this.baseUrl}/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: this.baseUrl,
        referer: `${this.baseUrl}/login`,
      },
      body,
    });

    if (!/\/student\/home/.test(result.url) && !/My Workspace/i.test(result.text)) {
      throw new Error("ManageBac login did not reach the student workspace.");
    }

    return result;
  }
}

export function readManageBacCredentials(env: Record<string, string | undefined>): Credentials {
  const login = env.MANAGEBAC_LOGIN?.trim();
  const password = env.MANAGEBAC_PASSWORD?.trim();
  const baseUrl = env.MANAGEBAC_BASE_URL?.trim() || DEFAULT_BASE_URL;

  if (!login || !password) {
    throw new Error("MANAGEBAC_LOGIN and MANAGEBAC_PASSWORD are required.");
  }

  return { baseUrl, login, password };
}

export async function scrapeManageBac(credentials: Credentials): Promise<ClassroomSnapshot> {
  const session = new ManageBacSession(credentials.baseUrl);
  const home = await session.login(credentials.login, credentials.password);
  const homeLinks = extractLinks(home.text, home.url);
  const classLinks = dedupeLinks(
    homeLinks.filter((link) => CLASS_LINK_PATTERN.test(new URL(link.url).pathname)),
  ).slice(0, 16);

  const [upcomingTasks, overdueTasks, notificationsPage, calendarPage] =
    await Promise.all([
      session.fetchFollowing(`${credentials.baseUrl}/student/tasks_and_deadlines?view=upcoming`),
      session.fetchFollowing(`${credentials.baseUrl}/student/tasks_and_deadlines?view=overdue`),
      session.fetchFollowing(`${credentials.baseUrl}/student/notifications`),
      session.fetchFollowing(`${credentials.baseUrl}/student/calendar`),
    ]);

  const globalTaskLinks = dedupeLinks([
    ...extractLinks(upcomingTasks.text, upcomingTasks.url),
    ...extractLinks(overdueTasks.text, overdueTasks.url),
  ])
    .filter((link) => TASK_LINK_PATTERN.test(new URL(link.url).pathname))
    .filter((link) => !/submit coursework/i.test(link.text))
    .slice(0, 40);

  const classResults = await mapWithConcurrency(classLinks, 3, (link) =>
    scrapeClass(session, link),
  );
  const taskLinks = dedupeLinks([
    ...globalTaskLinks,
    ...classResults.flatMap((result) => result.taskLinks),
  ]).slice(0, 60);
  const assignments = await mapWithConcurrency(taskLinks, 5, async (link) =>
    parseAssignment(link, await session.fetchFollowing(link.url)),
  );
  const discussionAssignments = classResults.flatMap((result) =>
    result.classroom.discussions
      .filter(isDiscussionAssignment)
      .map((discussion) => discussionToAssignment(result.classroom.name, discussion)),
  );

  return {
    studentName: extractStudentName(home.text) || "Advika Lakshmi",
    syncedAt: new Date().toISOString(),
    sourceUrl: `${credentials.baseUrl}/student/home`,
    status: "ok",
    error: "",
    notifications: parseNotifications(notificationsPage),
    classes: classResults.map((result) => result.classroom),
    assignments: dedupeAssignments([...assignments, ...discussionAssignments]),
    calendar: parseCalendar(calendarPage),
  };
}

export async function scrapeManageBacWithAssets(
  credentials: Credentials,
  studentKey: string,
): Promise<ArchivedClassroomSnapshot> {
  const session = new ManageBacSession(credentials.baseUrl);
  const home = await session.login(credentials.login, credentials.password);
  const snapshot = await scrapeAuthenticatedManageBac(credentials, session, home);
  const attachments = collectAttachments(snapshot);
  const uniqueAttachments = attachments.filter(
    (attachment, index, items) =>
      isDownloadableAttachment(attachment) &&
      items.findIndex((candidate) => candidate.url === attachment.url) === index,
  );
  const archivedByUrl = new Map<
    string,
    { archivedUrl: string; asset: ArchivedAsset }
  >();

  await mapWithConcurrency(uniqueAttachments, 3, async (attachment) => {
    const sourceUrl = attachment.url;
    const downloaded = await session.downloadFollowing(sourceUrl);
    const hash = await shortHash(sourceUrl);
    const filename = safeFilename(attachment.name, downloaded.contentType);
    const path = `data/classroom/${studentKey}/assets/${hash}-${filename}`;
    const archivedUrl =
      `https://raw.githubusercontent.com/skoolng/schoolwork/main/${path}`;
    archivedByUrl.set(sourceUrl, {
      archivedUrl,
      asset: {
        path,
        content: downloaded.content,
        contentType: downloaded.contentType,
        sourceUrl,
      },
    });
  });

  for (const attachment of attachments) {
    const archived = archivedByUrl.get(attachment.url);
    if (!archived) continue;
    attachment.sourceUrl = attachment.url;
    attachment.url = archived.archivedUrl;
  }

  return {
    snapshot,
    assets: [...archivedByUrl.values()].map(({ asset }) => asset),
  };
}

async function scrapeAuthenticatedManageBac(
  credentials: Credentials,
  session: ManageBacSession,
  home: PageResult,
): Promise<ClassroomSnapshot> {
  const homeLinks = extractLinks(home.text, home.url);
  const classLinks = dedupeLinks(
    homeLinks.filter((link) => CLASS_LINK_PATTERN.test(new URL(link.url).pathname)),
  ).slice(0, 16);

  const [upcomingTasks, overdueTasks, notificationsPage, calendarPage] =
    await Promise.all([
      session.fetchFollowing(`${credentials.baseUrl}/student/tasks_and_deadlines?view=upcoming`),
      session.fetchFollowing(`${credentials.baseUrl}/student/tasks_and_deadlines?view=overdue`),
      session.fetchFollowing(`${credentials.baseUrl}/student/notifications`),
      session.fetchFollowing(`${credentials.baseUrl}/student/calendar`),
    ]);

  const globalTaskLinks = dedupeLinks([
    ...extractLinks(upcomingTasks.text, upcomingTasks.url),
    ...extractLinks(overdueTasks.text, overdueTasks.url),
  ])
    .filter((link) => TASK_LINK_PATTERN.test(new URL(link.url).pathname))
    .filter((link) => !/submit coursework/i.test(link.text))
    .slice(0, 40);

  const classResults = await mapWithConcurrency(classLinks, 3, (link) =>
    scrapeClass(session, link),
  );
  const taskLinks = dedupeLinks([
    ...globalTaskLinks,
    ...classResults.flatMap((result) => result.taskLinks),
  ]).slice(0, 60);
  const assignments = await mapWithConcurrency(taskLinks, 5, async (link) =>
    parseAssignment(link, await session.fetchFollowing(link.url)),
  );
  const discussionAssignments = classResults.flatMap((result) =>
    result.classroom.discussions
      .filter(isDiscussionAssignment)
      .map((discussion) => discussionToAssignment(result.classroom.name, discussion)),
  );

  return {
    studentName: extractStudentName(home.text) || "Advika Lakshmi",
    syncedAt: new Date().toISOString(),
    sourceUrl: `${credentials.baseUrl}/student/home`,
    status: "ok",
    error: "",
    notifications: parseNotifications(notificationsPage),
    classes: classResults.map((result) => result.classroom),
    assignments: dedupeAssignments([...assignments, ...discussionAssignments]),
    calendar: parseCalendar(calendarPage),
  };
}

function collectAttachments(snapshot: ClassroomSnapshot) {
  const attachments: Attachment[] = [];
  for (const classroom of snapshot.classes) {
    attachments.push(...classroom.files);
    for (const item of [...classroom.stream, ...classroom.discussions]) {
      attachments.push(...item.attachments, ...(item.images ?? []));
    }
  }
  for (const assignment of snapshot.assignments) {
    attachments.push(...assignment.attachments, ...(assignment.images ?? []));
  }
  return attachments;
}

function isDownloadableAttachment(attachment: Attachment) {
  const parsed = new URL(attachment.url);
  if (/\/files\/(?:category|folder)\//i.test(parsed.pathname)) return false;
  return (
    /\/attachments\//i.test(parsed.pathname) ||
    /\/downloads?\//i.test(parsed.pathname) ||
    /\.(?:avif|gif|jpe?g|png|webp|pdf|docx?|xlsx?|pptx?|mp3|mp4|m4a|wav)$/i.test(
      attachment.name,
    ) ||
    /\.(?:avif|gif|jpe?g|png|webp|pdf|docx?|xlsx?|pptx?|mp3|mp4|m4a|wav)(?:\?|$)/i.test(
      attachment.url,
    )
  );
}

async function shortHash(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .slice(0, 10)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeFilename(name: string, contentType: string) {
  const extensionByType: Record<string, string> = {
    "application/pdf": ".pdf",
    "image/gif": ".gif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
  };
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "attachment";
  const hasExtension = /\.[a-zA-Z0-9]{1,8}$/.test(cleaned);
  const contentTypeWithoutParameters = contentType.split(";")[0].toLowerCase();
  return hasExtension
    ? cleaned
    : `${cleaned}${extensionByType[contentTypeWithoutParameters] ?? ".bin"}`;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
  );
  return results;
}

function cleanHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&mdash;/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(value: string, max = 360) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}...` : clean;
}

function extractLinks(html: string, baseUrl: string): LinkResult[] {
  return [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      url: new URL(match[1], baseUrl).toString(),
      text: cleanHtml(match[2]),
    }))
    .filter((link) => link.text || !link.url.startsWith("javascript:"));
}

function dedupeLinks<T extends { url: string; text: string }>(links: T[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${link.url}|${link.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeAssignments(assignments: Assignment[]) {
  const byUrl = new Map<string, Assignment>();
  for (const assignment of assignments) byUrl.set(assignment.url, assignment);
  return [...byUrl.values()].sort((a, b) => a.className.localeCompare(b.className));
}

function extractStudentName(html: string) {
  return cleanHtml(html).match(/Accounts Portal\s+(.+?)\s+Manage Your Profile/i)?.[1];
}

async function scrapeClass(
  session: ManageBacSession,
  link: LinkResult,
): Promise<ClassScrapeResult> {
  const classUrl = link.url.replace(/\/$/, "");
  const [summaryPage, streamPage, unitsPage, calendarPage, discussionsPage, filesPage] =
    await Promise.all([
      session.fetchFollowing(classUrl),
      session.fetchFollowing(`${classUrl}/class_stream`),
      session.fetchFollowing(`${classUrl}/units`),
      session.fetchFollowing(`${classUrl}/calendar`),
      session.fetchFollowing(`${classUrl}/discussions`),
      session.fetchFollowing(`${classUrl}/files`),
    ]);
  const discussionPages = await fetchDiscussionPages(
    session,
    classUrl,
    discussionsPage,
  );
  const taskLinks = dedupeLinks(
    [streamPage, unitsPage, calendarPage, ...discussionPages, filesPage].flatMap(
      (page) => extractLinks(page.text, page.url),
    ),
  )
    .filter((item) => TASK_LINK_PATTERN.test(new URL(item.url).pathname))
    .filter((item) => !/submit coursework/i.test(item.text));

  return {
    classroom: parseClass(link, {
      summaryPage,
      streamPage,
      unitsPage,
      calendarPage,
      discussionPages,
      filesPage,
    }),
    taskLinks,
  };
}

function parseClass(
  link: LinkResult,
  pages: {
    summaryPage: PageResult;
    streamPage: PageResult;
    unitsPage: PageResult;
    calendarPage: PageResult;
    discussionPages: PageResult[];
    filesPage: PageResult;
  },
): ClassroomClass {
  const text = cleanHtml(pages.summaryPage.text);
  const name =
    pages.summaryPage.text
      .match(/<title>ManageBac \| ([^<]+)/i)?.[1]
      ?.replace(/^IB MYP\s+/i, "") ||
    link.text.replace(/^IB MYP\s+/i, "");
  const activity = text.match(/Latest Activity\s+(.+?)\s+Members\s+Guides/i)?.[1] ?? "";

  return {
    name,
    url: link.url,
    latestActivity: clip(activity, 300),
    stream: parseClassContent(pages.streamPage, "stream"),
    discussions: parseDiscussions(pages.discussionPages),
    units: parseUnits(pages.unitsPage),
    calendar: parseCalendar(pages.calendarPage),
    files: parseFiles(pages.filesPage),
  };
}

function parseClassContent(page: PageResult, kind: "stream" | "discussions") {
  const matches = [
    ...page.text.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi),
  ];
  const accepted = matches.filter((match) => {
    const url = new URL(match[1], page.url);
    const path = url.pathname;
    if (CLASS_SECTION_PATTERN.test(path)) return false;
    if (kind === "discussions") return DISCUSSION_LINK_PATTERN.test(path);
    return (
      TASK_LINK_PATTERN.test(path) ||
      DISCUSSION_LINK_PATTERN.test(path) ||
      UNIT_LINK_PATTERN.test(path) ||
      isAssetUrl(url.toString())
    );
  });

  const seen = new Set<string>();
  return accepted
    .map((match) => {
      const url = new URL(match[1], page.url).toString();
      const title = cleanHtml(match[2]) || attachmentName(url);
      const start = Math.max(0, (match.index ?? 0) - 500);
      const end = Math.min(page.text.length, (match.index ?? 0) + match[0].length + 1200);
      const contextHtml = page.text.slice(start, end);
      const context = cleanHtml(contextHtml);
      const dateText =
        context.match(/\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/i)?.[0] ??
        context.match(MONTH_DAY)?.[0] ??
        "";
      const attachments = parseAttachments(contextHtml, page.url).filter(
        (attachment) => attachment.url !== url,
      );

      return {
        title: clip(title, 140),
        detail: clip(context.replace(title, ""), 360),
        dateText,
        url,
        attachments,
        images: attachments.filter(isImageAttachment),
      };
    })
    .filter((item) => {
      if (!item.title || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .slice(0, 8);
}

function discussionPageNumber(url: string) {
  const parsed = new URL(url);
  if (!DISCUSSION_INDEX_PATTERN.test(parsed.pathname)) return 0;
  const page = Number.parseInt(parsed.searchParams.get("page") ?? "", 10);
  return Number.isFinite(page) && page > 1 ? page : 0;
}

function maxLinkedDiscussionPage(page: PageResult) {
  return extractLinks(page.text, page.url).reduce(
    (maximum, link) => Math.max(maximum, discussionPageNumber(link.url)),
    1,
  );
}

function discussionPageUrl(firstPageUrl: string, pageNumber: number) {
  const url = new URL(firstPageUrl);
  url.searchParams.set("page", String(pageNumber));
  return url.toString();
}

async function fetchDiscussionPages(
  session: ManageBacSession,
  classUrl: string,
  firstPage: PageResult,
) {
  const pages = [firstPage];
  let nextPage = 2;
  let linkedMaximum = maxLinkedDiscussionPage(firstPage);

  while (nextPage <= linkedMaximum && nextPage <= MAX_DISCUSSION_PAGES) {
    const batchEnd = Math.min(linkedMaximum, MAX_DISCUSSION_PAGES);
    const pageNumbers = Array.from(
      { length: batchEnd - nextPage + 1 },
      (_, index) => nextPage + index,
    );
    const fetched = await mapWithConcurrency(pageNumbers, 4, (pageNumber) =>
      session.fetchFollowing(
        discussionPageUrl(`${classUrl}/discussions`, pageNumber),
      ),
    );
    pages.push(...fetched);
    nextPage = batchEnd + 1;
    linkedMaximum = Math.max(
      linkedMaximum,
      ...fetched.map(maxLinkedDiscussionPage),
    );
  }

  return pages;
}

function parseDiscussionPage(page: PageResult) {
  const root = parse(page.text);
  root.querySelectorAll("script, style").forEach((node) => node.remove());

  return root
    .querySelectorAll(".discussion")
    .map((card) => {
      const titleLink = card
        .querySelectorAll("a")
        .find((node) => {
          const href = node.getAttribute("href");
          if (!href || /show_with_reply/.test(href)) return false;
          return DISCUSSION_LINK_PATTERN.test(new URL(href, page.url).pathname);
        });
      if (!titleLink) return null;

      const url = new URL(titleLink.getAttribute("href") ?? "", page.url).toString();
      const title = clip(titleLink.textContent, 140);
      const body = card.querySelector(".body");
      const attachmentUrls = new Set<string>();
      const attachments = (body?.querySelectorAll("a") ?? [])
        .map((node) => {
          const href = node.getAttribute("href");
          if (!href) return null;
          const attachmentUrl = new URL(href, page.url).toString();
          if (!isAssetUrl(attachmentUrl) || attachmentUrls.has(attachmentUrl)) {
            return null;
          }
          attachmentUrls.add(attachmentUrl);
          return {
            name: clip(
              node.getAttribute("data-name") ||
                node.querySelector(".fr-inner")?.textContent ||
                node.textContent.replace(
                  /\d+(?:\.\d+)?\s*(?:KB|MB|GB)\b.*$/i,
                  "",
                ) ||
                attachmentName(attachmentUrl),
              140,
            ),
            url: attachmentUrl,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      const imageUrls = new Set<string>();
      const inlineImages = (body?.querySelectorAll("img") ?? [])
        .map((node, index) => {
          const src = node.getAttribute("src");
          if (!src || /^(?:data|blob):/i.test(src)) return null;
          const imageUrl = new URL(src, page.url).toString();
          if (imageUrls.has(imageUrl)) return null;
          imageUrls.add(imageUrl);
          return {
            name: clip(
              node.getAttribute("alt") ||
                node.getAttribute("data-name") ||
                `Discussion image ${index + 1}`,
              140,
            ),
            url: imageUrl,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      const images = [...attachments.filter(isImageAttachment), ...inlineImages].filter(
        (image, index, items) =>
          items.findIndex((candidate) => candidate.url === image.url) === index,
      );
      let detail = body?.textContent.replace(/\s+/g, " ").trim() ?? "";
      if (detail.startsWith(title)) detail = detail.slice(title.length).trim();
      for (const attachment of attachments) {
        detail = detail.replace(attachment.name, " ");
      }
      detail = detail
        .replace(/\b\d+(?:\.\d+)?\s*(?:KB|MB|GB)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      const posted = card.textContent
        .replace(/\s+/g, " ")
        .match(
          /Posted on\s+((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s+(?:AM|PM))/i,
        )?.[1];

      return {
        title,
        detail: clip(detail, 520),
        dateText: posted ?? "",
        url,
        attachments,
        images,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item?.title));
}

function parseDiscussions(pages: PageResult[]) {
  const seen = new Set<string>();
  return pages.flatMap(parseDiscussionPage).filter((discussion) => {
    if (seen.has(discussion.url)) return false;
    seen.add(discussion.url);
    return true;
  });
}

function isDiscussionAssignment(item: ClassroomClass["discussions"][number]) {
  const text = `${item.title} ${item.detail} ${item.attachments
    .map((attachment) => attachment.name)
    .join(" ")}`.replace(/[_\W]+/g, " ");
  return (
    DISCUSSION_ASSIGNMENT_PATTERN.test(text) ||
    ((item.images?.length ?? 0) > 0 &&
      IMAGE_ASSIGNMENT_PATTERN.test(text) &&
      !NON_ASSIGNMENT_IMAGE_PATTERN.test(text))
  );
}

function discussionToAssignment(
  className: string,
  discussion: ClassroomClass["discussions"][number],
): Assignment {
  const dueText = `${discussion.title} ${discussion.detail}`.match(
    /\b(?:due(?:\s+date)?|complete by|submit by)\s*:?\s*((?:\d{1,2}[./-]){2}\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s+\d{4})?)/i,
  )?.[1];

  return {
    title: discussion.title,
    className,
    dueText: dueText ?? "",
    status: "Shared in Discussion",
    unit: "Class discussion",
    description: discussion.detail,
    url: discussion.url,
    attachments: discussion.attachments,
    images: discussion.images ?? [],
    source: "discussion",
  };
}

function parseUnits(page: PageResult) {
  const seen = new Set<string>();
  return extractLinks(page.text, page.url)
    .filter((link) => UNIT_LINK_PATTERN.test(new URL(link.url).pathname))
    .filter((link) => {
      if (!link.text || seen.has(link.url)) return false;
      seen.add(link.url);
      return true;
    })
    .slice(0, 8)
    .map((link) => ({
      title: clip(link.text, 140),
      detail: "Open the unit planner for learning goals, lessons, and tasks.",
      url: link.url,
    }));
}

function isAssetUrl(url: string) {
  const parsed = new URL(url);
  return ASSET_PATTERN.test(`${parsed.pathname}${parsed.search}`);
}

function attachmentName(url: string) {
  const pathname = new URL(url).pathname;
  return decodeURIComponent(pathname.split("/").filter(Boolean).pop() ?? "File");
}

function isImageAttachment(attachment: Attachment) {
  return IMAGE_NAME_PATTERN.test(attachment.name) || IMAGE_NAME_PATTERN.test(attachment.url);
}

function parseAttachments(html: string, baseUrl: string): Attachment[] {
  const seen = new Set<string>();
  return extractLinks(html, baseUrl)
    .filter((link) => isAssetUrl(link.url))
    .filter((link) => {
      if (seen.has(link.url)) return false;
      seen.add(link.url);
      return true;
    })
    .slice(0, 8)
    .map((link) => ({
      name: clip(
        (link.text || attachmentName(link.url))
          .replace(/\d+(?:\.\d+)?\s*(?:KB|MB|GB)\b.*$/i, "")
          .trim(),
        140,
      ),
      url: link.url,
    }));
}

function parseFiles(page: PageResult) {
  return parseAttachments(page.text, page.url).slice(0, 12);
}

function parseAssignment(link: { url: string; text: string }, page: PageResult): Assignment {
  const text = cleanHtml(page.text);
  const title = page.text.match(/<title>ManageBac \| ([^<]+)/i)?.[1] || link.text;
  const className =
    text.match(/Classes\s+IB MYP\s+(.+?)\s+Tasks & Units/i)?.[1] ??
    text.match(/Classes\s+(.+?)\s+Tasks & Units/i)?.[1] ??
    "";
  const taskIndex = Math.max(0, text.indexOf(title));
  const taskText = text.slice(taskIndex, taskIndex + 2200);
  const dateText = taskText.match(MONTH_DAY)?.[0] ?? "";
  const dueTime =
    taskText.match(
      /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+at\s+\d{1,2}:\d{2}\s+(?:AM|PM)/i,
    )?.[0] ?? "";
  const status =
    taskText.match(/\b(?:Not Submitted|Submitted|Pending|N\/A|Late|Overdue)\b/i)?.[0] ?? "";
  const unit =
    taskText.match(/(?:Not Submitted|Submitted|Pending|N\/A)\s+(.+?)\s+Starts\s+/i)?.[1] ??
    "";
  const description =
    taskText.match(/Description\s+(.+?)(?:\s+Assessment|\s+Guidance|\s+Submit Coursework|\s+Members|\s+Files\s+More|$)/i)?.[1] ??
    "";
  const attachments = parseAttachments(page.text, page.url);

  return {
    title,
    className: className.replace(/^IB MYP\s+/i, ""),
    dueText: [dateText, dueTime].filter(Boolean).join(" - "),
    status,
    unit: clip(unit, 120),
    description: clip(description, 420),
    url: link.url,
    attachments,
    images: attachments.filter(isImageAttachment),
    source: "task",
  };
}

function parseNotifications(page: PageResult): NotificationItem[] {
  const text = cleanHtml(page.text);
  const body =
    text.match(/Notifications\s+(.+?)\s+(?:Members Guides|Chat Bot Sidebar items|Privacy Preferences)/i)?.[1] ??
    "";
  const count = text.match(/Notifications\s+(\d+\s+of\s+\d+)/i)?.[1] ?? "";
  const links = extractLinks(page.text, page.url)
    .filter((link) => /^https?:/i.test(link.url))
    .filter(
      (link) =>
        !/logout|preferences|profile|classes|calendar|tasks_and_deadlines/i.test(
          link.url,
        ),
    )
    .filter(
      (link) =>
        !/^(?:skip to|the gaudium school|here|classes|groups|files & resources|guides)$/i.test(
          link.text.trim(),
        ),
    );

  const items: NotificationItem[] = links.slice(0, 8).map((link) => ({
    title: link.text || "ManageBac notification",
    detail: "Open in ManageBac for full context.",
    url: link.url,
  }));

  if (count) {
    items.unshift({
      title: `${count} notifications shown by ManageBac`,
      detail: clip(body || "Review the ManageBac notifications inbox.", 220),
      url: page.url,
    });
  }

  return items.slice(0, 10);
}

function parseCalendar(page: PageResult): CalendarItem[] {
  return extractLinks(page.text, page.url)
    .filter((link) => TASK_LINK_PATTERN.test(new URL(link.url).pathname))
    .slice(0, 12)
    .map((link) => ({
      title: link.text.replace(/^\d{1,2}:\d{2}\s+(?:AM|PM)\s+/i, ""),
      dateText: link.text.match(/^\d{1,2}:\d{2}\s+(?:AM|PM)/i)?.[0] ?? "Upcoming",
      url: link.url,
    }));
}
