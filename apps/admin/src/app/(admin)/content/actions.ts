"use server";

// Server Action của màn Nội dung. Mọi lời gọi core chạy ở máy chủ với token lấy từ cookie
// `httpOnly`; trình duyệt chỉ nhận bài viết và phiên bản của nó (ETag), không có token.
//
// Phiên bản: core trả `ETag` khi đọc hay ghi một bài, và đòi lại nó trong `If-Match` ở mọi lệnh
// đổi bài (sửa, đăng, gỡ, lưu trữ, hẹn giờ, khôi phục). Người khác sửa trước thì core trả 412:
// giao diện báo và không ghi đè. Danh mục, thẻ, tác giả và lịch không đổi phiên bản của bài.
import type { AutoxideClient, Problem } from "@autoxide/sdk";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type Outcome, send } from "@/lib/action";
import {
  type Author,
  CONTENT_LOCALES,
  defined,
  type Entry,
  type SeoSuggestion,
  type Term,
  type TranslationRequest,
  toCoreBody,
} from "@/lib/content";

export type EntryOutcome =
  | { ok: true; entry: Entry; version: string }
  | { ok: false; problem: Problem };

type Failure = { ok: false; problem: Problem };

/**
 * Lệnh hai bước (lưu rồi đăng / hẹn giờ / xem trước) mà bước hai hỏng: bản nháp đã lưu, nên
 * trả kèm bài và phiên bản mới để trình soạn không gửi phiên bản cũ ở lần sau.
 */
export type StepFailure = Failure & { saved?: { entry: Entry; version: string } };

function afterSave(failure: Failure, saved: { entry: Entry | null; version: string }): StepFailure {
  return saved.entry
    ? { ...failure, saved: { entry: saved.entry, version: saved.version } }
    : failure;
}

type Result<T> = { data?: T; error?: unknown; response: Response };

const id = z.uuid();
const version = z.string().min(1).max(200);
const locale = z.enum(CONTENT_LOCALES);

/** Ô của bản nháp gửi kèm mỗi lần lưu. Core kiểm từng ô; ở đây chỉ kiểm hình dạng. */
const Fields = z.object({
  title: z.string().max(1000),
  slug: z.string().max(400),
  excerpt: z.string().max(4000),
  body: z.unknown(),
  meta_title: z.string().max(1000),
  meta_description: z.string().max(4000),
  canonical_url: z.string().max(4000),
  noindex: z.boolean(),
  featured_media_id: z.uuid().nullable().optional(),
  featured_media_alt: z.string().max(4000).optional(),
  og_media_id: z.uuid().nullable().optional(),
  ai_generated: z.boolean().optional(),
});
export type EntryFields = z.input<typeof Fields>;

/** Đầu vào không đúng hình dạng (chỉ xảy ra khi có người gọi Server Action bằng tay). */
function invalid(): Failure {
  return {
    ok: false,
    problem: {
      type: "about:blank",
      title: "Bad Request",
      status: 400,
      code: "invalid_request",
      detail: "The request is not valid.",
    },
  };
}

function body<T extends z.output<typeof Fields>>(fields: T) {
  // `ai_generated` chỉ gửi khi có giá trị (core coi thiếu là "giữ nguyên").
  const { ai_generated, ...rest } = fields;
  return {
    ...defined(rest),
    body: toCoreBody(fields.body),
    ...(ai_generated === undefined ? {} : { ai_generated }),
  };
}

/** Gọi một endpoint trả về một bài, giữ lại `ETag` của câu trả lời. */
async function withVersion(
  call: (client: AutoxideClient) => Promise<Result<{ data: Entry }>>,
): Promise<EntryOutcome> {
  let etag = "";
  const result = await send(async (client) => {
    const answer = await call(client);
    etag = answer.response.headers.get("etag") ?? "";
    return answer;
  });
  if (!result.ok) return result;
  return { ok: true, entry: result.data.data, version: etag };
}

function patch(entryId: string, ifMatch: string, fields: z.output<typeof Fields>) {
  return withVersion((client) =>
    client.PATCH("/api/v1/content/entries/{id}", {
      params: { path: { id: entryId }, header: { "If-Match": ifMatch } },
      body: body(fields),
    }),
  );
}

/**
 * Lưu bản nháp trước (khi `fields` có), rồi làm `then` với phiên bản mới. Đăng, hẹn giờ và xem
 * trước dùng bản đã lưu, nên chữ đang gõ dở phải vào core trước.
 */
async function savedFirst(
  entryId: string,
  ifMatch: string,
  fields: unknown,
): Promise<EntryOutcome | { ok: true; entry: null; version: string }> {
  if (fields === null || fields === undefined) return { ok: true, entry: null, version: ifMatch };
  const parsed = Fields.safeParse(fields);
  if (!parsed.success) return invalid();
  return patch(entryId, ifMatch, parsed.data);
}

// ---------------------------------------------------------------- Tạo và sửa

const Create = Fields.extend({
  kind: z.enum(["post", "page"]),
  locale,
  parent_id: z.uuid().nullable().optional(),
});
export type CreateInput = z.input<typeof Create>;

/** Tạo bản nháp rồi mở trình soạn của nó. Lỗi thì trả về để form hiện dưới đúng ô. */
export async function createEntry(input: CreateInput): Promise<Failure> {
  const parsed = Create.safeParse(input);
  if (!parsed.success) return invalid();
  const { parent_id, ...rest } = parsed.data;
  const result = await send((client) =>
    client.POST("/api/v1/content/entries", {
      body: { ...body(rest), ...(parent_id ? { parent_id } : {}) },
    }),
  );
  if (!result.ok) return result;
  redirect(`/content/${result.data.data.id}`);
}

/** Lưu bản nháp (`PATCH`, cần `If-Match`). Bài đang đăng vẫn hiện bản đã đăng tới khi đăng lại. */
export async function saveEntry(
  entryId: string,
  ifMatch: string,
  fields: EntryFields,
): Promise<EntryOutcome> {
  const parsed = Fields.safeParse(fields);
  if (!id.safeParse(entryId).success || !version.safeParse(ifMatch).success || !parsed.success) {
    return invalid();
  }
  const result = await patch(entryId, ifMatch, parsed.data);
  if (result.ok) refresh();
  return result;
}

// ---------------------------------------------------------------- Trạng thái

/** Đăng: lưu chữ đang sửa (nếu có) rồi chép bản nháp thành bản công khai. */
export async function publishEntry(
  entryId: string,
  ifMatch: string,
  fields: EntryFields | null,
  aiReviewed: boolean,
): Promise<EntryOutcome | StepFailure> {
  if (!id.safeParse(entryId).success || !version.safeParse(ifMatch).success) return invalid();
  const saved = await savedFirst(entryId, ifMatch, fields);
  if (!saved.ok) return saved;
  const result = await withVersion((client) =>
    client.POST("/api/v1/content/entries/{id}/publish", {
      params: { path: { id: entryId }, header: { "If-Match": saved.version } },
      body: aiReviewed ? { ai_reviewed: true } : {},
    }),
  );
  if (result.ok || saved.entry) refresh();
  return result.ok ? result : afterSave(result, saved);
}

type StateChange = "unpublish" | "archive" | "request-review" | "withdraw-review";

/** Gỡ đăng, lưu trữ, gửi duyệt, rút yêu cầu duyệt: cùng một hình dạng (`If-Match`, trả bài). */
export async function changeState(
  entryId: string,
  ifMatch: string,
  change: StateChange,
): Promise<EntryOutcome> {
  if (!id.safeParse(entryId).success || !version.safeParse(ifMatch).success) return invalid();
  const params = { path: { id: entryId }, header: { "If-Match": ifMatch } };
  const result = await withVersion((client) => {
    switch (change) {
      case "unpublish":
        return client.POST("/api/v1/content/entries/{id}/unpublish", { params });
      case "archive":
        return client.POST("/api/v1/content/entries/{id}/archive", { params });
      case "request-review":
        return client.POST("/api/v1/content/entries/{id}/request-review", { params });
      case "withdraw-review":
        return client.DELETE("/api/v1/content/entries/{id}/request-review", { params });
    }
  });
  if (result.ok) refresh();
  return result;
}

const ScheduleInput = z.object({
  action: z.enum(["publish", "unpublish"]),
  run_at: z.iso.datetime({ offset: true }),
  // Người đặt lịch xác nhận đã duyệt phần do AI tạo; core ghi người duyệt là người đặt lịch và
  // từ chối dấu này khi gọi bằng API key (`content.ai_review_requires_human`).
  ai_reviewed: z.boolean().optional(),
});

/**
 * Hẹn giờ đăng hay gỡ. Lịch đăng ghim bản nháp lúc đặt lịch, nên lưu chữ đang sửa trước. Trả
 * bài và phiên bản sau khi lưu (lịch không đổi phiên bản của bài).
 */
export async function scheduleEntry(
  entryId: string,
  ifMatch: string,
  fields: EntryFields | null,
  input: z.input<typeof ScheduleInput>,
): Promise<{ ok: true; entry: Entry | null; version: string } | StepFailure> {
  const parsed = ScheduleInput.safeParse(input);
  if (!id.safeParse(entryId).success || !version.safeParse(ifMatch).success || !parsed.success) {
    return invalid();
  }
  const saved = await savedFirst(entryId, ifMatch, fields);
  if (!saved.ok) return saved;
  const result = await send((client) =>
    client.POST("/api/v1/content/entries/{id}/schedules", {
      params: { path: { id: entryId }, header: { "If-Match": saved.version } },
      body: defined({ ...parsed.data, ai_reviewed: parsed.data.ai_reviewed || undefined }),
    }),
  );
  refresh();
  if (!result.ok) return afterSave(result, saved);
  return { ok: true, entry: saved.entry, version: saved.version };
}

/** Huỷ một lịch còn chờ. */
export async function cancelSchedule(scheduleId: string): Promise<Outcome<unknown>> {
  if (!id.safeParse(scheduleId).success) return invalid();
  const result = await send((client) =>
    client.DELETE("/api/v1/content/schedules/{id}", {
      params: { path: { id: scheduleId } },
    }),
  );
  if (result.ok) refresh();
  return result;
}

// ---------------------------------------------------------------- Danh mục, thẻ, tác giả

const Ids = z.array(z.uuid()).max(50);

/** Đặt danh mục và thẻ (có hiệu lực ngay, cả với bản đã đăng). */
export async function setTerms(entryId: string, termIds: string[]): Promise<Outcome<string[]>> {
  const parsed = Ids.safeParse(termIds);
  if (!id.safeParse(entryId).success || !parsed.success) return invalid();
  const result = await send((client) =>
    client.PUT("/api/v1/content/entries/{id}/terms", {
      params: { path: { id: entryId } },
      body: { term_ids: parsed.data },
    }),
  );
  if (!result.ok) return result;
  refresh();
  return { ok: true, data: result.data.data.term_ids };
}

/** Đặt tác giả, theo thứ tự (người đầu là tác giả chính). */
export async function setAuthors(entryId: string, authorIds: string[]): Promise<Outcome<string[]>> {
  const parsed = Ids.max(20).safeParse(authorIds);
  if (!id.safeParse(entryId).success || !parsed.success) return invalid();
  const result = await send((client) =>
    client.PUT("/api/v1/content/entries/{id}/authors", {
      params: { path: { id: entryId } },
      body: { author_ids: parsed.data },
    }),
  );
  if (!result.ok) return result;
  refresh();
  return { ok: true, data: result.data.data.author_ids };
}

const Query = z.string().trim().min(1).max(200);

/** Tìm tác giả theo tên (`q` của core, không dấu vẫn ra), cho trình soạn khi hơn một trang. */
export async function findAuthors(q: string): Promise<Outcome<Author[]>> {
  const parsed = Query.safeParse(q);
  if (!parsed.success) return invalid();
  const result = await send((client) =>
    client.GET("/api/v1/content/authors", { params: { query: { q: parsed.data, limit: 50 } } }),
  );
  return result.ok ? { ok: true, data: result.data.data } : result;
}

/** Tìm danh mục và thẻ theo tên ở mọi ngôn ngữ (`q` của core). */
export async function findTerms(q: string): Promise<Outcome<Term[]>> {
  const parsed = Query.safeParse(q);
  if (!parsed.success) return invalid();
  const result = await send((client) =>
    client.GET("/api/v1/content/terms", { params: { query: { q: parsed.data, limit: 50 } } }),
  );
  return result.ok ? { ok: true, data: result.data.data } : result;
}

// ---------------------------------------------------------------- Lịch sử, xem trước

/** Chép một phiên bản cũ về bản nháp (không đăng). */
export async function restoreRevision(
  entryId: string,
  revisionId: string,
  ifMatch: string,
): Promise<EntryOutcome> {
  if (
    !id.safeParse(entryId).success ||
    !id.safeParse(revisionId).success ||
    !version.safeParse(ifMatch).success
  ) {
    return invalid();
  }
  const result = await withVersion((client) =>
    client.POST("/api/v1/content/entries/{id}/revisions/{revision_id}/restore", {
      params: { path: { id: entryId, revision_id: revisionId }, header: { "If-Match": ifMatch } },
    }),
  );
  if (result.ok) refresh();
  return result;
}

/**
 * Link xem trước bản nháp cho người không có tài khoản. Lưu chữ đang sửa trước, vì link luôn
 * hiện bản nháp đã lưu mới nhất.
 */
export async function makePreview(
  entryId: string,
  ifMatch: string,
  fields: EntryFields | null,
): Promise<
  { ok: true; token: string; expiresAt: string; entry: Entry | null; version: string } | StepFailure
> {
  if (!id.safeParse(entryId).success || !version.safeParse(ifMatch).success) return invalid();
  const saved = await savedFirst(entryId, ifMatch, fields);
  if (!saved.ok) return saved;
  const result = await send((client) =>
    client.POST("/api/v1/content/entries/{id}/preview-token", {
      params: { path: { id: entryId } },
    }),
  );
  if (saved.entry) refresh();
  if (!result.ok) return afterSave(result, saved);
  return {
    ok: true,
    token: result.data.data.token,
    expiresAt: result.data.data.expires_at,
    entry: saved.entry,
    version: saved.version,
  };
}

// ---------------------------------------------------------------- Bản dịch, AI

/** Tạo bản dịch trống (một bài mới cùng nhóm bản dịch) rồi mở nó. */
export async function createTranslation(
  entryId: string,
  target: string,
  title: string,
): Promise<Failure> {
  const parsedLocale = locale.safeParse(target);
  if (!id.safeParse(entryId).success || !parsedLocale.success) return invalid();
  const result = await send((client) =>
    client.POST("/api/v1/content/entries/{id}/translations", {
      params: { path: { id: entryId } },
      body: { locale: parsedLocale.data, title: title.slice(0, 300) },
    }),
  );
  if (!result.ok) return result;
  redirect(`/content/${result.data.data.id}`);
}

/** Nhờ AI dịch vào bản nháp của bản dịch (không bao giờ tự đăng). Core làm ở job nền. */
export async function translateWithAi(
  entryId: string,
  target: string,
): Promise<Outcome<TranslationRequest>> {
  const parsedLocale = locale.safeParse(target);
  if (!id.safeParse(entryId).success || !parsedLocale.success) return invalid();
  const result = await send((client) =>
    client.POST("/api/v1/content/entries/{id}/translate", {
      params: { path: { id: entryId } },
      body: { locale: parsedLocale.data },
    }),
  );
  if (!result.ok) return result;
  refresh();
  return { ok: true, data: result.data.data };
}

/** Gợi ý SEO bằng AI. Core không lưu gì: người dùng xem rồi mới áp dụng vào bản nháp. */
export async function suggestSeo(entryId: string): Promise<Outcome<SeoSuggestion>> {
  if (!id.safeParse(entryId).success) return invalid();
  const result = await send((client) =>
    client.POST("/api/v1/content/entries/{id}/seo-suggestions", {
      params: { path: { id: entryId } },
    }),
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data.data };
}
