// Màn Nội dung (Bài viết và trình soạn) cho core giả. Hình dạng theo `openapi.json`
// (`satisfies` kiểu của SDK).
import { randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ModuleInfo } from "@autoxide/sdk";
import { json, problem, type Schemas, send, text } from "./mock-http.ts";
import { resetStructure, structureRoutes } from "./mock-structure.ts";

// Khối của màn Nội dung: bài viết và trang, phiên bản (ETag / If-Match), đăng, gỡ, lưu trữ,
// gửi duyệt, lịch, phiên bản cũ, danh mục, tác giả, bản dịch, kiểm SEO, link xem trước. AI tắt
// (`GET /api/v1/ai/status` báo `enabled: false`), như core chưa cấu hình AI; `POST /__ai`
// (`{"enabled": true}`) bật để thử "Hỏi bằng lời" của màn Đơn hàng.
// `POST /__content/bump` (`{"id"}`) sửa một bài như có người khác sửa, để thử xung đột 412.

type MockEntry = Schemas["EntryResponse"] & { version: number };

export const CONTENT_MODULE: ModuleInfo = {
  name: "content",
  internal: false,
  position: 3,
  permissions: [
    { name: "content.read", description: "Read drafts." },
    { name: "content.write", description: "Write drafts." },
    { name: "content.publish", description: "Publish." },
  ],
  events: [],
  subscriptions: [],
  jobs: [],
  schedules: [],
  tools: [],
  deprecations: [],
  languages: ["vi"],
  migrations: [{ name: "m0001_create_entries", applied: true }],
};

const SEED_AUTHORS: Schemas["AuthorResponse"][] = [
  {
    id: "01a1dd85-f609-701b-9e7f-d6e1e13e56d9",
    user_id: null,
    display_name: "Minh Anh",
    slug: "minh-anh",
    bio: "",
    avatar_media_id: null,
    website_url: "",
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  },
];

const SEED_TERMS: Schemas["TermResponse"][] = [
  {
    id: "01a1dd85-f5c7-77d6-b517-807884ba3e01",
    taxonomy: "category",
    parent_id: null,
    names: [
      {
        locale: "vi",
        name: "Chọn mua",
        slug: "chon-mua",
        description: "",
        meta_title: "",
        meta_description: "",
      },
    ],
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  },
];

let CONTENT_AUTHORS: Schemas["AuthorResponse"][] = [];
let CONTENT_TERMS: Schemas["TermResponse"][] = [];
let contentEntries: MockEntry[] = [];
let contentRevisions: Schemas["RevisionResponse"][] = [];
let contentSchedules: Schemas["ScheduleResponse"][] = [];
const previewTokens = new Map<string, string>();
let contentClock = Date.parse("2026-11-15T00:00:00Z");

/** Mỗi lần ghi một thời điểm mới (tăng 1 giây), để thứ tự "mới sửa trước" ổn định. */
function contentNow(): string {
  contentClock += 1000;
  return new Date(contentClock).toISOString();
}

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function newEntry(fields: Partial<MockEntry> & { title: string }): MockEntry {
  const id = randomUUID();
  const now = contentNow();
  return {
    id,
    kind: "post",
    locale: "vi",
    translation_group_id: id,
    parent_id: null,
    status: "draft",
    has_unpublished_changes: false,
    slug: slugify(fields.title),
    excerpt: "",
    body: { type: "doc", content: [] },
    body_schema_version: 1,
    word_count: 0,
    reading_time_minutes: 0,
    featured_media_id: null,
    featured_media_alt: "",
    meta_title: "",
    meta_description: "",
    og_media_id: null,
    canonical_url: "",
    noindex: false,
    ai_generated: false,
    review_requested_at: null,
    review_requested_by: null,
    translated_from_revision_id: null,
    translation_outdated: false,
    created_by: null,
    created_via: "session",
    created_at: now,
    updated_at: now,
    term_ids: [],
    author_ids: [],
    version: 1,
    ...fields,
  };
}

function keepRevision(entry: MockEntry, reason: string) {
  contentRevisions.unshift({
    id: randomUUID(),
    entry_id: entry.id,
    reason,
    created_by: null,
    created_at: contentNow(),
    // `openapi.json` mô tả `snapshot` là object tự do (kiểu sinh ra không ghi được trường nào),
    // nên ép kiểu.
    snapshot: {
      title: entry.title,
      slug: entry.slug,
      excerpt: entry.excerpt,
      body: entry.body,
    } as unknown as Record<string, never>,
  });
}

/** AI có bật không (`GET /api/v1/ai/status`); mặc định tắt, `POST /__ai` bật để thử "Hỏi bằng lời". */
let aiEnabled = false;

export function setAiEnabled(on: boolean) {
  aiEnabled = on;
}

export function aiOn(): boolean {
  return aiEnabled;
}

export function resetContent() {
  aiEnabled = false;
  contentClock = Date.parse("2026-11-15T00:00:00Z");
  CONTENT_AUTHORS = structuredClone(SEED_AUTHORS);
  CONTENT_TERMS = structuredClone(SEED_TERMS);
  resetStructure();
  contentRevisions = [];
  contentSchedules = [];
  previewTokens.clear();
  contentEntries = [
    newEntry({
      title: "Vệ sinh thớt gỗ đúng cách",
      status: "published",
      excerpt: "Ba bước sau mỗi lần dùng.",
      author_ids: [CONTENT_AUTHORS[0]?.id ?? ""],
    }),
    newEntry({ title: "Bảo quản dao bếp", review_requested_at: "2026-11-14T08:00:00Z" }),
  ];
  for (const entry of contentEntries) keepRevision(entry, "initial");
}
resetContent();

function view(entry: MockEntry): Schemas["EntryResponse"] {
  const { version: _version, ...rest } = entry;
  return rest;
}

function sendEntry(response: ServerResponse, status: number, entry: MockEntry) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    ETag: `"${entry.version}"`,
    ...(status === 201 ? { Location: `/api/v1/content/entries/${entry.id}` } : {}),
  });
  response.end(JSON.stringify({ data: view(entry) }));
}

/** Như core: thiếu `If-Match` là 428, khác phiên bản là 412; `*` luôn khớp. */
function versionOk(request: IncomingMessage, response: ServerResponse, entry: MockEntry): boolean {
  const ifMatch = request.headers["if-match"];
  if (!ifMatch) {
    problem(response, 428, "precondition_required", "Send the ETag you read in If-Match.");
    return false;
  }
  if (ifMatch !== "*" && ifMatch !== `"${entry.version}"`) {
    problem(
      response,
      412,
      "precondition_failed",
      "The record changed since you read it (its `ETag` is different).",
    );
    return false;
  }
  return true;
}

function touch(entry: MockEntry) {
  entry.version += 1;
  entry.updated_at = contentNow();
}

/** Ô của bản nháp: kiểm như core những gì test cần (tiêu đề, slug trùng, link không an toàn). */
function applyFields(
  response: ServerResponse,
  entry: MockEntry,
  body: Record<string, unknown>,
  creating: boolean,
): boolean {
  const errors: Schemas["ProblemField"][] = [];
  if (body.title !== undefined || creating) {
    const title = text(body, "title").trim();
    if (title.length < 1 || title.length > 300) {
      errors.push({ field: "title", code: "length", detail: "must be 1 to 300 characters" });
    }
  }
  if (JSON.stringify(body.body ?? null).includes("javascript:")) {
    errors.push({
      field: "body.content[0].content[0].marks[0].attrs.href",
      code: "unsafe_link",
      detail: "must start with `http://`, `https://`, `mailto:` or `/`",
    });
  }
  if (errors.length > 0) {
    problem(response, 422, "validation_failed", "The request has invalid fields.", errors);
    return false;
  }
  const title = body.title === undefined ? entry.title : text(body, "title").trim();
  const slug =
    body.slug === undefined
      ? entry.slug
      : text(body, "slug").trim() === ""
        ? slugify(title)
        : text(body, "slug").trim();
  const taken = contentEntries.some(
    (other) =>
      other.id !== entry.id &&
      other.slug === slug &&
      other.kind === entry.kind &&
      other.locale === entry.locale,
  );
  if (taken) {
    problem(response, 409, "content.slug_taken", "Another entry has this slug.");
    return false;
  }
  entry.title = title;
  entry.slug = slug;
  for (const key of [
    "excerpt",
    "meta_title",
    "meta_description",
    "canonical_url",
    "featured_media_alt",
  ] as const) {
    if (typeof body[key] === "string") entry[key] = body[key];
  }
  for (const key of ["featured_media_id", "og_media_id"] as const) {
    if (key in body) entry[key] = (body[key] as string | null) ?? null;
  }
  if (typeof body.noindex === "boolean") entry.noindex = body.noindex;
  if (typeof body.ai_generated === "boolean") entry.ai_generated = body.ai_generated;
  if (body.body && typeof body.body === "object") {
    entry.body = body.body as Schemas["BodyNode"];
    const words = JSON.stringify(entry.body).match(/"text":"([^"]*)"/g) ?? [];
    entry.word_count = words.join(" ").split(/\s+/).length - words.length;
    entry.reading_time_minutes = entry.word_count > 0 ? 1 : 0;
  }
  if (entry.status === "published") entry.has_unpublished_changes = true;
  return true;
}

/** `GET /api/v1/content/public/preview?token=`: không cần đăng nhập. */
export function contentPreview(response: ServerResponse, url: URL) {
  const id = previewTokens.get(url.searchParams.get("token") ?? "");
  const entry = contentEntries.find((e) => e.id === id);
  if (!entry) {
    return problem(response, 404, "content.preview_token_invalid", "The link is not valid.");
  }
  const { created_by, created_via, review_requested_at, review_requested_by, ...rest } =
    view(entry);
  void [created_by, created_via, review_requested_at, review_requested_by];
  return send(response, 200, { data: rest satisfies Schemas["PreviewEntryResponse"] });
}

export async function contentRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  route: string,
): Promise<void> {
  const body = request.method === "GET" || request.method === "DELETE" ? {} : await json(request);
  const P = "/api/v1/content";
  if (route === "GET /api/v1/ai/status") {
    return send(response, 200, {
      data: {
        enabled: aiEnabled,
        provider: aiEnabled ? "mock" : "",
        model: aiEnabled ? "mock-model" : "",
        images: false,
        embeddings_enabled: false,
        embedding_model: "",
        embedding_dimensions: 0,
        tokens_today: 0,
        daily_token_limit: 0,
      } satisfies Schemas["AiStatus"],
    });
  }
  if (route === `GET ${P}/authors`) {
    return send(response, 200, {
      data: CONTENT_AUTHORS,
      pagination: { limit: 50, next_cursor: null },
    } satisfies Schemas["Page_AuthorResponse"]);
  }
  if (route === `GET ${P}/terms`) {
    return send(response, 200, {
      data: CONTENT_TERMS,
      pagination: { limit: 50, next_cursor: null },
    } satisfies Schemas["Page_TermResponse"]);
  }
  if (route === `GET ${P}/entries`) {
    const q = url.searchParams;
    const fold = (value: string) => slugify(value).replace(/-/g, " ");
    const matches = contentEntries
      .filter((e) => !q.get("status") || e.status === q.get("status"))
      .filter((e) => !q.get("kind") || e.kind === q.get("kind"))
      .filter((e) => !q.get("locale") || e.locale === q.get("locale"))
      .filter(
        (e) =>
          !q.get("translation_group_id") ||
          e.translation_group_id === q.get("translation_group_id"),
      )
      .filter(
        (e) => !q.get("q") || fold(`${e.title} ${e.excerpt}`).includes(fold(q.get("q") ?? "")),
      )
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const limit = Number(q.get("limit") ?? 50);
    const start = Number(q.get("cursor") ?? 0);
    const page = matches.slice(start, start + limit);
    const next = start + limit < matches.length ? String(start + limit) : null;
    return send(response, 200, {
      data: page.map(view),
      pagination: { limit, next_cursor: next },
    } satisfies Schemas["Page_EntryResponse"]);
  }
  if (route === `POST ${P}/entries`) {
    const kind = body.kind === "page" ? "page" : "post";
    const entry = newEntry({ title: "", kind, locale: text(body, "locale") || "en" });
    if (!applyFields(response, entry, body, true)) return;
    entry.has_unpublished_changes = false;
    contentEntries.push(entry);
    keepRevision(entry, "initial");
    return sendEntry(response, 201, entry);
  }
  if (
    await structureRoutes(request, response, url, route, body, {
      entries: () => contentEntries,
      terms: () => CONTENT_TERMS,
      authors: () => CONTENT_AUTHORS,
      revisions: () => contentRevisions,
      now: contentNow,
      sendEntry: (status, entry) => sendEntry(response, status, entry as MockEntry),
      versionOk: (entry) => versionOk(request, response, entry as MockEntry),
    })
  ) {
    return;
  }
  const schedule = url.pathname.match(/^\/api\/v1\/content\/schedules\/([^/]+)$/);
  if (schedule && request.method === "DELETE") {
    const found = contentSchedules.find((s) => s.id === schedule[1]);
    if (!found) return problem(response, 404, "content.schedule_not_found", "No schedule.");
    found.status = "canceled";
    return send(response, 200, { data: found });
  }
  const match = url.pathname.match(/^\/api\/v1\/content\/entries\/([^/]+)(\/.*)?$/);
  const entry = contentEntries.find((e) => e.id === match?.[1]);
  if (!match || !entry) {
    return problem(response, 404, "content.not_found", "No entry has this id.");
  }
  const tail = `${request.method} ${match[2] ?? ""}`;
  switch (tail) {
    case "GET ":
      return sendEntry(response, 200, entry);
    case "PATCH ": {
      if (!versionOk(request, response, entry)) return;
      if (!applyFields(response, entry, body, false)) return;
      touch(entry);
      return sendEntry(response, 200, entry);
    }
    case "POST /publish": {
      if (!versionOk(request, response, entry)) return;
      entry.status = "published";
      entry.has_unpublished_changes = false;
      entry.review_requested_at = null;
      touch(entry);
      keepRevision(entry, "published");
      return sendEntry(response, 200, entry);
    }
    case "POST /unpublish":
    case "POST /archive": {
      if (!versionOk(request, response, entry)) return;
      if (tail === "POST /unpublish" && entry.status !== "published") {
        return problem(response, 409, "content.not_published", "It is not published.");
      }
      entry.status = tail === "POST /archive" ? "archived" : "draft";
      entry.has_unpublished_changes = false;
      touch(entry);
      keepRevision(entry, "unpublished");
      return sendEntry(response, 200, entry);
    }
    case "POST /request-review":
    case "DELETE /request-review": {
      if (!versionOk(request, response, entry)) return;
      entry.review_requested_at = request.method === "POST" ? contentNow() : null;
      touch(entry);
      return sendEntry(response, 200, entry);
    }
    case "GET /revisions":
      return send(response, 200, {
        data: contentRevisions
          .filter((r) => r.entry_id === entry.id)
          .map(({ snapshot: _snapshot, ...rest }) => rest),
        pagination: { limit: 30, next_cursor: null },
      } satisfies Schemas["Page_RevisionResponse"]);
    case "GET /schedules":
      return send(response, 200, {
        data: contentSchedules.filter((s) => s.entry_id === entry.id),
      } satisfies Schemas["Data_Vec_ScheduleResponse"]);
    case "POST /schedules": {
      if (!versionOk(request, response, entry)) return;
      const runAt = text(body, "run_at");
      if (!(Date.parse(runAt) > Date.now())) {
        return problem(response, 422, "validation_failed", "The request has invalid fields.", [
          { field: "run_at", code: "schedule_in_past", detail: "must be in the future" },
        ]);
      }
      const created = {
        id: randomUUID(),
        entry_id: entry.id,
        action: body.action === "unpublish" ? "unpublish" : "publish",
        revision_id: null,
        run_at: runAt,
        status: "scheduled",
        error_code: null,
        created_by: null,
        created_at: contentNow(),
        updated_at: contentNow(),
      } satisfies Schemas["ScheduleResponse"];
      contentSchedules.unshift(created);
      return send(response, 201, { data: created });
    }
    case "GET /seo-check": {
      const findings: Schemas["SeoFinding"][] = [];
      if (!entry.meta_title) {
        findings.push({
          code: "seo.meta_title_missing",
          level: "warning",
          field: "meta_title",
          message: "no title for search engines: the title is used",
        });
      }
      if (!entry.excerpt) {
        findings.push({
          code: "seo.excerpt_missing",
          level: "warning",
          field: "excerpt",
          message: "no summary",
        });
      }
      return send(response, 200, { data: { findings } satisfies Schemas["SeoReport"] });
    }
    case "POST /seo-suggestions":
    case "POST /translate":
      return problem(response, 503, "ai.disabled", "AI features are off on this server.");
    case "GET /translation-requests":
      return send(response, 200, {
        data: [],
        pagination: { limit: 10, next_cursor: null },
      } satisfies Schemas["Page_TranslationRequestResponse"]);
    case "POST /preview-token": {
      const token = randomBytes(16).toString("base64url");
      previewTokens.set(token, entry.id);
      return send(response, 200, {
        data: {
          token,
          expires_at: new Date(Date.now() + 600_000).toISOString(),
        } satisfies Schemas["PreviewToken"],
      });
    }
    case "PUT /terms":
      entry.term_ids = Array.isArray(body.term_ids) ? body.term_ids.map(String) : [];
      return send(response, 200, { data: { term_ids: entry.term_ids } });
    case "PUT /authors":
      entry.author_ids = Array.isArray(body.author_ids) ? body.author_ids.map(String) : [];
      return send(response, 200, { data: { author_ids: entry.author_ids } });
    case "POST /translations": {
      const locale = text(body, "locale");
      if (
        contentEntries.some(
          (e) => e.translation_group_id === entry.translation_group_id && e.locale === locale,
        )
      ) {
        return problem(response, 409, "content.translation_exists", "A translation exists.");
      }
      const translation = newEntry({
        title: text(body, "title") || entry.title,
        locale,
        kind: entry.kind,
        translation_group_id: entry.translation_group_id,
        body: entry.body,
      });
      contentEntries.push(translation);
      keepRevision(translation, "initial");
      return sendEntry(response, 201, translation);
    }
  }
  const restore = (match[2] ?? "").match(/^\/revisions\/([^/]+)\/restore$/);
  if (restore && request.method === "POST") {
    if (!versionOk(request, response, entry)) return;
    const revision = contentRevisions.find((r) => r.id === restore[1] && r.entry_id === entry.id);
    if (!revision) return problem(response, 404, "content.revision_not_found", "No revision.");
    const snapshot = (revision.snapshot ?? {}) as Partial<MockEntry>;
    Object.assign(entry, {
      title: snapshot.title ?? entry.title,
      slug: snapshot.slug ?? entry.slug,
      excerpt: snapshot.excerpt ?? entry.excerpt,
      body: snapshot.body ?? entry.body,
    });
    if (entry.status === "published") entry.has_unpublished_changes = true;
    touch(entry);
    keepRevision(entry, "restored");
    return sendEntry(response, 200, entry);
  }
  return problem(response, 404, "not_found", "No such route in the mock core.");
}

/** `POST /__content/bump`: sửa một bài như có người khác vừa sửa (thử xung đột 412). */
export async function contentBump(request: IncomingMessage, response: ServerResponse) {
  const body = await json(request);
  const entry = contentEntries.find((e) => e.id === text(body, "id"));
  if (!entry) return problem(response, 404, "content.not_found", "No entry has this id.");
  entry.excerpt = "Changed elsewhere.";
  touch(entry);
  return send(response, 200, { data: view(entry) });
}

/**
 * `POST /__content/pages`: thêm hai trang (Về chúng tôi, Chính sách đổi trả) để thử cây trang và
 * chuyển trang cha. Không có trong dữ liệu ban đầu để danh sách bài của `content.spec.ts` giữ nguyên.
 */
export function seedPages(response: ServerResponse) {
  for (const [title, slug] of [
    ["Về chúng tôi", "ve-chung-toi"],
    ["Chính sách đổi trả", "chinh-sach-doi-tra"],
  ] as const) {
    const page = newEntry({ title, kind: "page" });
    page.slug = slug;
    contentEntries.push(page);
    keepRevision(page, "initial");
  }
  return send(response, 204);
}
