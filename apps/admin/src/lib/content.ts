// Phần thuần (không gọi mạng) của màn Nội dung: bộ lọc danh sách, quyền, và chuẩn hoá thân bài
// về đúng danh sách node mà core nhận (docs/CONTENT.md của core). Dùng được cả ở máy chủ lẫn
// trình duyệt, nên không import gì của phía máy chủ.
import type { components, Problem } from "@autoxide/sdk";

type Schemas = components["schemas"];
export type Entry = Schemas["EntryResponse"];
export type EntryStatus = Schemas["Status"];
export type EntryKind = Schemas["Kind"];
export type BodyNode = Schemas["BodyNode"];
export type BodyMark = Schemas["BodyMark"];
export type Author = Schemas["AuthorResponse"];
export type Term = Schemas["TermResponse"];
export type Revision = Schemas["RevisionResponse"];
export type Schedule = Schemas["ScheduleResponse"];
export type SeoFinding = Schemas["SeoFinding"];
export type SeoSuggestion = Schemas["SeoSuggestion"];
export type TranslationRequest = Schemas["TranslationRequestResponse"];

/**
 * Ngôn ngữ của nội dung khi không đọc được cấu hình của core: giá trị mặc định của
 * `AUTOXIDE_CONTENT_LOCALES`. Danh sách thật lấy từ `contentLocales()` (máy chủ) hay
 * `useContentLocales()` (form trong phân hệ Nội dung).
 */
export const FALLBACK_CONTENT_LOCALES = ["en", "vi"] as const;

/** Mã ngôn ngữ BCP 47 dạng ngắn (`vi`, `en`, `pt-BR`). Core kiểm ngôn ngữ có được mở hay không. */
export const LOCALE_CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

/**
 * Đầu đường dẫn của bài viết, dạng `/blog/`, từ cấu hình của core (`content.post_path_prefix` của
 * `GET /kernel/client-config`). Không có (core cũ) thì giá trị mặc định của core.
 */
export function postPathPrefix(value: string | null | undefined): string {
  const trimmed = (value ?? "blog").trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
}

/** Số bài mỗi trang của danh sách. */
export const PAGE_SIZE = 25;

/**
 * Tab của danh sách. Bốn tab đầu là `status` của bài; `review` là bài đang chờ duyệt
 * (`review_requested=true`, mọi trạng thái); `scheduled` là "Sắp đăng": lịch đăng / gỡ đang chờ
 * của mọi bài (`GET /content/schedules?status=scheduled`), không phải bảng bài.
 */
export const STATUS_TABS = [
  "all",
  "draft",
  "published",
  "review",
  "scheduled",
  "archived",
] as const;
export type StatusTab = (typeof STATUS_TABS)[number];

const KINDS: readonly EntryKind[] = ["post", "page"];

export interface ListFilters {
  status: StatusTab;
  kind?: EntryKind;
  locale?: string;
  q?: string;
  /** Chỉ bài người xem tạo (`created_by=me`). */
  mine?: boolean;
  /** Chỉ bài mang nhãn AI (`ai_generated=true`). */
  ai?: boolean;
  /** Chỉ bài chưa có bản dịch sang ngôn ngữ này (`missing_locale`). */
  missing?: string;
  /** Chỉ bài có danh mục / thẻ này (`term_id`), mở từ số bài của màn "Trang và cấu trúc". */
  term?: string;
  /** Chỉ bài của hồ sơ tác giả này (`author_id`). */
  author?: string;
  cursor?: string;
  /** Website đang chọn (phần dữ liệu mẫu, W-006); không gửi cho core. */
  site?: string;
}

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  const text = (Array.isArray(value) ? value[0] : value)?.trim();
  return text ? text : undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isLocale(value: string | undefined): value is string {
  return value !== undefined && LOCALE_CODE.test(value);
}

/** Đọc bộ lọc từ địa chỉ (`?status=draft&kind=page&q=…`); giá trị lạ thì bỏ qua. */
export function parseFilters(params: SearchParams): ListFilters {
  const status = one(params, "status");
  const kind = one(params, "kind");
  const locale = one(params, "locale");
  const missing = one(params, "missing");
  const q = one(params, "q")?.slice(0, 200);
  const cursor = one(params, "cursor");
  const site = one(params, "site");
  const filters: ListFilters = {
    status: STATUS_TABS.includes(status as StatusTab) ? (status as StatusTab) : "all",
  };
  if (KINDS.includes(kind as EntryKind)) filters.kind = kind as EntryKind;
  if (isLocale(locale)) filters.locale = locale;
  if (q) filters.q = q;
  if (one(params, "mine") === "1") filters.mine = true;
  if (one(params, "ai") === "1") filters.ai = true;
  if (isLocale(missing)) filters.missing = missing;
  const term = one(params, "term");
  if (term && UUID.test(term)) filters.term = term;
  const author = one(params, "author");
  if (author && UUID.test(author)) filters.author = author;
  if (cursor) filters.cursor = cursor;
  if (site && UUID.test(site)) filters.site = site;
  return filters;
}

/** Có bộ lọc nào ngoài tab (để hiện nút "Bỏ lọc" và câu "không có bài khớp"). */
export function hasFilters(filters: ListFilters): boolean {
  return Boolean(
    filters.kind ||
      filters.locale ||
      filters.q ||
      filters.mine ||
      filters.ai ||
      filters.missing ||
      filters.term ||
      filters.author,
  );
}

/**
 * Địa chỉ của danh sách với bộ lọc đã đổi. Đổi bộ lọc thì về trang đầu (con trỏ chỉ đúng với
 * đúng bộ lọc đã tạo ra nó), trừ khi `change` đưa con trỏ mới.
 */
export function filtersHref(filters: ListFilters, change: Partial<ListFilters> = {}): string {
  const next: ListFilters = { ...filters, ...change };
  if (!("cursor" in change)) delete next.cursor;
  const query = new URLSearchParams();
  if (next.status !== "all") query.set("status", next.status);
  if (next.kind) query.set("kind", next.kind);
  if (next.locale) query.set("locale", next.locale);
  if (next.q) query.set("q", next.q);
  if (next.mine) query.set("mine", "1");
  if (next.ai) query.set("ai", "1");
  if (next.missing) query.set("missing", next.missing);
  if (next.term) query.set("term", next.term);
  if (next.author) query.set("author", next.author);
  if (next.cursor) query.set("cursor", next.cursor);
  if (next.site) query.set("site", next.site);
  const text = query.toString();
  return text ? `/content?${text}` : "/content";
}

/** Tham số gửi `GET /api/v1/content/entries`: mới sửa gần nhất lên đầu. */
export function listQuery(filters: ListFilters) {
  const status = filters.status;
  return {
    limit: PAGE_SIZE,
    sort: "updated_at" as const,
    order: "desc" as const,
    ...(status === "draft" || status === "published" || status === "archived" ? { status } : {}),
    ...(status === "review" ? { review_requested: true } : {}),
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(filters.locale ? { locale: filters.locale } : {}),
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.mine ? { created_by: "me" } : {}),
    ...(filters.ai ? { ai_generated: true } : {}),
    ...(filters.missing ? { missing_locale: filters.missing } : {}),
    ...(filters.term ? { term_id: filters.term } : {}),
    ...(filters.author ? { author_id: filters.author } : {}),
    ...(filters.cursor ? { cursor: filters.cursor } : {}),
  };
}

/**
 * Lịch đăng đang chờ của trang "Sắp đăng", giờ chạy sớm nhất trước. Core trả theo thứ tự tạo
 * lịch, nên xếp lại trong trang đang xem; mỗi lịch kèm bài của nó (`null` khi không đọc được bài).
 */
export function upcomingRows(
  schedules: readonly Schedule[],
  entries: readonly Entry[],
): { schedule: Schedule; entry: Entry | null }[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return [...schedules]
    .filter((schedule) => schedule.status === "scheduled")
    .sort((a, b) => a.run_at.localeCompare(b.run_at))
    .map((schedule) => ({ schedule, entry: byId.get(schedule.entry_id) ?? null }));
}

/** Đường dẫn để hiện cho một bài: đường dẫn công khai đã lưu (`path`), chưa đăng thì `/slug`. */
export function entryPath(entry: Pick<Entry, "path" | "slug">): string {
  return entry.path || `/${entry.slug}`;
}

// ---------------------------------------------------------------- Quyền

export interface ContentAbilities {
  write: boolean;
  publish: boolean;
  /** Lưu trữ và hẹn giờ cần `content.publish` thật, không nhận `content.publish_own`. */
  publishAll: boolean;
}

/**
 * Nút nào nên hiện cho người này. Chỉ để không bày ra nút chắc chắn bị từ chối; core vẫn kiểm
 * quyền ở từng lời gọi (vd `_own` chỉ áp cho bài chính họ tạo).
 */
export function abilities(viewer: {
  all_permissions: boolean;
  permissions: readonly string[];
}): ContentAbilities {
  const has = (permission: string) =>
    viewer.all_permissions || viewer.permissions.includes(permission);
  return {
    write: has("content.write") || has("content.write_own"),
    publish: has("content.publish") || has("content.publish_own"),
    publishAll: has("content.publish"),
  };
}

export interface AiState {
  enabled: boolean;
  /** Vì sao tắt: `off` (máy chủ chưa bật AI) hay `forbidden` (thiếu `ai.view`). */
  reason?: "off" | "forbidden";
}

// ---------------------------------------------------------------- Thân bài

export const EMPTY_BODY: BodyNode = { type: "doc", content: [] };

/** Ký tự điều khiển hay `\` (trình duyệt đọc `\` như `/`): core từ chối link có chúng. */
function isUnsafeChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return char === "\\" || code < 0x20 || code === 0x7f;
}

/** Link core nhận: `http(s)://`, `mailto:` hoặc đường dẫn trong site (`/…`, không `//`). */
export function isSafeHref(href: string): boolean {
  const lower = href.trim().toLowerCase();
  if (href.length > 2048 || [...href].some(isUnsafeChar)) return false;
  return (
    lower.startsWith("https://") ||
    lower.startsWith("http://") ||
    lower.startsWith("mailto:") ||
    (lower.startsWith("/") && !lower.startsWith("//"))
  );
}

/** Thuộc tính core nhận cho từng loại node; node không có trong bảng thì không có thuộc tính. */
const NODE_ATTRS: Readonly<Record<string, readonly string[]>> = {
  doc: [],
  paragraph: [],
  heading: ["level"],
  bulletList: [],
  orderedList: ["start"],
  listItem: [],
  blockquote: [],
  codeBlock: ["language"],
  horizontalRule: [],
  hardBreak: [],
  image: ["mediaId", "alt", "caption"],
  embed: ["url"],
  table: [],
  tableRow: [],
  tableHeader: ["colspan", "rowspan", "colwidth"],
  tableCell: ["colspan", "rowspan", "colwidth"],
  text: [],
};

const SIMPLE_MARKS = new Set(["bold", "italic", "underline", "strike", "code"]);

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function marksOf(value: unknown): BodyMark[] {
  if (!Array.isArray(value)) return [];
  const marks: BodyMark[] = [];
  for (const mark of value) {
    if (!isObject(mark) || typeof mark.type !== "string") continue;
    if (SIMPLE_MARKS.has(mark.type)) {
      marks.push({ type: mark.type });
    } else if (mark.type === "link") {
      const href = isObject(mark.attrs) ? mark.attrs.href : undefined;
      // Link không an toàn thì bỏ mark, giữ chữ (core sẽ từ chối cả bài nếu giữ lại).
      if (typeof href === "string" && isSafeHref(href)) {
        marks.push({ type: "link", attrs: { href } });
      }
    }
  }
  return marks;
}

function attrsOf(type: string, value: unknown): Json | undefined {
  const allowed = NODE_ATTRS[type] ?? [];
  if (!isObject(value) || allowed.length === 0) return undefined;
  const attrs: Json = {};
  for (const key of allowed) {
    const item = value[key];
    if (item === undefined || item === null) continue;
    attrs[key] = item;
  }
  if (type === "heading") {
    const level = Number(attrs.level);
    attrs.level = Number.isInteger(level) ? Math.min(4, Math.max(2, level)) : 2;
  }
  if (type === "orderedList") {
    const start = Number(attrs.start);
    if (!Number.isInteger(start) || start < 1) delete attrs.start;
  }
  if (type === "codeBlock" && typeof attrs.language === "string") {
    if (!/^[A-Za-z0-9+#\-_.]{1,32}$/.test(attrs.language)) delete attrs.language;
  }
  if (type === "image") {
    for (const key of ["alt", "caption"]) {
      if (attrs[key] === "") delete attrs[key];
    }
  }
  return Object.keys(attrs).length > 0 ? attrs : undefined;
}

function nodeOf(value: unknown, plain: boolean): BodyNode | null {
  if (!isObject(value) || typeof value.type !== "string" || !(value.type in NODE_ATTRS)) {
    return null;
  }
  const type = value.type;
  if (type === "text") {
    if (typeof value.text !== "string" || value.text === "") return null;
    const node: BodyNode = { type, text: value.text };
    const marks = plain ? [] : marksOf(value.marks);
    if (marks.length > 0) node.marks = marks;
    return node;
  }
  const node: BodyNode = { type };
  const attrs = attrsOf(type, value.attrs);
  if (attrs) node.attrs = attrs;
  if (type === "heading" && !attrs) node.attrs = { level: 2 };
  if (
    Array.isArray(value.content) &&
    !["hardBreak", "horizontalRule", "image", "embed"].includes(type)
  ) {
    const children = value.content
      .map((child) => nodeOf(child, type === "codeBlock"))
      .filter((child): child is BodyNode => child !== null);
    if (children.length > 0) node.content = children;
  }
  return node;
}

/**
 * Đưa JSON của trình soạn (Tiptap) về đúng hình dạng core nhận: bỏ thuộc tính core không cho
 * (link của Tiptap có `target`, `rel`, `class`), bỏ node lạ và chữ rỗng, đưa tiêu đề về mức
 * 2–4. Core vẫn kiểm lại từng node; hàm này chỉ để bài viết bình thường không bị từ chối.
 */
export function toCoreBody(doc: unknown): BodyNode {
  const root = nodeOf(doc, false);
  if (root?.type !== "doc") return { type: "doc", content: [] };
  // Tiptap luôn giữ một đoạn trống ở cuối để đặt con trỏ; không lưu nó.
  const content = [...(root.content ?? [])];
  while (content.length > 0 && isEmptyParagraph(content[content.length - 1])) content.pop();
  return { type: "doc", content };
}

function isEmptyParagraph(node: BodyNode | undefined): boolean {
  return node?.type === "paragraph" && (node.content ?? []).length === 0;
}

/** Thân bài không có chữ, ảnh hay khối nào. */
export function isEmptyBody(doc: BodyNode): boolean {
  return (doc.content ?? []).every(isEmptyParagraph);
}

/** `datetime-local` (giờ của máy người xem) → RFC 3339 UTC cho core; rỗng / sai thì `null`. */
export function localToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// ---------------------------------------------------------------- Lỗi

export interface EntryErrors {
  /** Lỗi theo ô (`title`, `slug`, `excerpt`, `meta_title`…). */
  fields: Record<string, string>;
  /** Lỗi trong thân bài, kèm vị trí (`body.content[2].attrs.href`). */
  body: { field: string; detail: string }[];
  /** Câu báo chung (đã theo ngôn ngữ của core). */
  message?: string;
  code: string;
}

/** Ô của biểu mẫu soạn bài, tên như của core. */
export const ENTRY_FIELDS = [
  "title",
  "slug",
  "excerpt",
  "meta_title",
  "meta_description",
  "canonical_url",
  "featured_media_id",
  "featured_media_alt",
  "og_media_id",
] as const;

/** Tách Problem của core thành lỗi dưới ô, lỗi của thân bài và câu báo chung. */
export function entryErrors(problem: Problem): EntryErrors {
  const result: EntryErrors = { fields: {}, body: [], code: problem.code };
  let unmatched = false;
  for (const entry of problem.errors ?? []) {
    if (entry.field === "body" || entry.field.startsWith("body.")) {
      result.body.push({ field: entry.field, detail: entry.detail });
    } else if ((ENTRY_FIELDS as readonly string[]).includes(entry.field)) {
      result.fields[entry.field] ??= entry.detail;
    } else {
      unmatched = true;
    }
  }
  if (problem.code === "content.slug_taken") {
    result.fields.slug ??= problem.detail;
  }
  if (unmatched || (Object.keys(result.fields).length === 0 && result.body.length === 0)) {
    result.message = problem.detail;
  }
  return result;
}

/**
 * Bỏ các khoá có giá trị `undefined`: core coi thiếu ô là "giữ nguyên", và kiểu sinh từ
 * `openapi.json` không nhận `undefined` (`exactOptionalPropertyTypes`).
 */
export function defined<T extends object>(value: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}
