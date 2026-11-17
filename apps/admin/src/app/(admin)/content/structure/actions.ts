"use server";

// Server Action của màn "Trang và cấu trúc": chuyển trang cha, danh mục và thẻ, tác giả, chuyển
// hướng, so hai phiên bản. Mọi lời gọi core chạy ở máy chủ với token trong cookie `httpOnly`.
//
// Phiên bản: danh sách bài của core kèm `version` (chính là `ETag`) của từng dòng, nên chuyển trang
// cha gửi thẳng nó trong `If-Match`. Danh mục, thẻ, tác giả, chuyển hướng chưa có `version` trong
// danh sách: trước khi sửa, đọc lại bản ghi để lấy `ETag`, rồi so `updated_at` với giá trị trang đã
// hiện; khác nhau là có người vừa sửa, báo "đã đổi" (như 412) thay vì ghi đè. Core vẫn kiểm
// `If-Match` ở lệnh ghi.
import type { AutoxideClient, Problem } from "@autoxide/sdk";
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { type Outcome, send } from "@/lib/action";
import { LOCALE_CODE } from "@/lib/content";
import { type FormState, nextDone, parseForm, problemState } from "@/lib/form";
import { type BulkInput, type BulkResult, cleanIds, eachId } from "@/lib/table";

type Result<T> = { data?: T; error?: unknown; response: Response };

const uuid = z.uuid();

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

function values(formData: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, text(formData, name)]));
}

async function invalidState(): Promise<FormState> {
  return { error: "The request is not valid.", code: "invalid_request" };
}

/**
 * Đọc lại một bản ghi, lấy `ETag`; nếu `updated_at` khác giá trị trang đã hiện thì trả lỗi
 * `precondition_failed` (người khác vừa sửa).
 */
async function freshTag(
  read: (client: AutoxideClient) => Promise<Result<{ data: { updated_at: string } }>>,
  shown: string,
): Promise<{ ok: true; etag: string } | { ok: false; problem: Problem }> {
  let etag = "";
  const result = await send(async (client) => {
    const answer = await read(client);
    etag = answer.response.headers.get("etag") ?? "";
    return answer;
  });
  if (!result.ok) return result;
  if (shown && result.data.data.updated_at !== shown) {
    const t = await getTranslations("structure");
    return {
      ok: false,
      problem: {
        type: "about:blank",
        title: "Precondition Failed",
        status: 412,
        code: "precondition_failed",
        detail: t("conflict"),
      },
    };
  }
  return { ok: true, etag: etag || "*" };
}

// ---------------------------------------------------------------- Trang

/** Chuyển một trang sang trang cha khác (hay lên cấp cao nhất). Core đổi đường dẫn của cả cây con. */
export async function movePage(state: FormState, formData: FormData): Promise<FormState> {
  const id = text(formData, "id");
  const parent = text(formData, "parent_id");
  const version = text(formData, "version");
  if (
    !uuid.safeParse(id).success ||
    (parent && !uuid.safeParse(parent).success) ||
    version.length < 1 ||
    version.length > 200
  ) {
    return invalidState();
  }
  const result = await send((client) =>
    client.POST("/api/v1/content/entries/{id}/move", {
      params: { path: { id }, header: { "If-Match": version } },
      body: { parent_id: parent || null },
    }),
  );
  if (!result.ok) {
    // 412: người khác vừa sửa trang — câu riêng của màn, như các lệnh sửa khác ở đây.
    if (result.problem.code === "precondition_failed") {
      const t = await getTranslations("structure");
      return { error: t("conflict"), code: result.problem.code };
    }
    return problemState(result.problem, ["parent_id"], { "content.tree_cycle": "parent_id" });
  }
  refresh();
  return { done: nextDone(state) };
}

// ---------------------------------------------------------------- Danh mục và thẻ

const TermForm = z.object({
  taxonomy: z.enum(["category", "tag"]),
  locale: z.string().regex(LOCALE_CODE),
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().max(200).optional(),
  description: z.string().max(5000).optional(),
  parent_id: z.union([z.uuid(), z.literal("")]).optional(),
});
const TERM_FIELDS = ["name", "slug", "description", "parent_id", "locale"] as const;

/** Tạo (không có `id`) hay sửa một danh mục / thẻ ở một ngôn ngữ. */
export async function saveTerm(state: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("structure.required");
  const typed = values(formData, TERM_FIELDS);
  const input = parseForm(TermForm, formData, t("field"), { name: t("name") });
  if (!input.ok) return { fields: input.fields, values: typed };
  const { taxonomy, parent_id, ...fields } = input.data;
  const body = {
    ...fields,
    slug: fields.slug ?? "",
    description: fields.description ?? "",
    ...(taxonomy === "category" ? { parent_id: parent_id || null } : {}),
  };
  const id = text(formData, "id");
  let result: Outcome<unknown>;
  if (id) {
    if (!uuid.safeParse(id).success) return invalidState();
    const tag = await freshTag(
      (c) => c.GET("/api/v1/content/terms/{id}", { params: { path: { id } } }),
      text(formData, "updated_at"),
    );
    if (!tag.ok) return problemState(tag.problem, []);
    result = await send((client) =>
      client.PATCH("/api/v1/content/terms/{id}", {
        params: { path: { id }, header: { "If-Match": tag.etag } },
        body,
      }),
    );
  } else {
    result = await send((client) =>
      client.POST("/api/v1/content/terms", { body: { ...body, taxonomy } }),
    );
  }
  if (!result.ok) {
    return {
      ...problemState(result.problem, TERM_FIELDS, {
        "content.slug_taken": "slug",
        "content.term_cycle": "parent_id",
      }),
      values: typed,
    };
  }
  refresh();
  return { done: nextDone(state) };
}

export async function deleteTerm(state: FormState, formData: FormData): Promise<FormState> {
  const id = text(formData, "id");
  if (!uuid.safeParse(id).success) return invalidState();
  const result = await send((client) =>
    client.DELETE("/api/v1/content/terms/{id}", { params: { path: { id } } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}

/**
 * Xoá nhiều danh mục / thẻ (thanh hàng loạt). Core chỉ có `DELETE /content/terms/{id}`: lặp từng id;
 * danh mục còn danh mục con bị core từ chối, lỗi đó báo đúng dòng.
 */
export async function bulkDeleteTerms(input: BulkInput): Promise<BulkResult> {
  const result = await eachId(cleanIds(input.ids), async (termId) => {
    if (!uuid.safeParse(termId).success) return (await invalidState()).error ?? "";
    const deleted = await send((client) =>
      client.DELETE("/api/v1/content/terms/{id}", { params: { path: { id: termId } } }),
    );
    return deleted.ok ? null : deleted.problem.detail;
  });
  refresh();
  return result;
}

// ---------------------------------------------------------------- Tác giả

const AuthorForm = z.object({
  display_name: z.string().trim().min(1).max(200),
  slug: z.string().trim().max(200).optional(),
  bio: z.string().max(5000).optional(),
  website_url: z.string().trim().max(2000).optional(),
});
const AUTHOR_FIELDS = ["display_name", "slug", "bio", "website_url"] as const;

/** Tạo hay sửa một hồ sơ tác giả (hồ sơ công khai, tách khỏi tài khoản đăng nhập). */
export async function saveAuthor(state: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("structure.required");
  const typed = values(formData, AUTHOR_FIELDS);
  const input = parseForm(AuthorForm, formData, t("field"), { display_name: t("authorName") });
  if (!input.ok) return { fields: input.fields, values: typed };
  const body = {
    display_name: input.data.display_name,
    slug: input.data.slug ?? "",
    bio: input.data.bio ?? "",
    website_url: input.data.website_url ?? "",
  };
  const id = text(formData, "id");
  let result: Outcome<unknown>;
  if (id) {
    if (!uuid.safeParse(id).success) return invalidState();
    const tag = await freshTag(
      (c) => c.GET("/api/v1/content/authors/{id}", { params: { path: { id } } }),
      text(formData, "updated_at"),
    );
    if (!tag.ok) return problemState(tag.problem, []);
    result = await send((client) =>
      client.PATCH("/api/v1/content/authors/{id}", {
        params: { path: { id }, header: { "If-Match": tag.etag } },
        body,
      }),
    );
  } else {
    result = await send((client) => client.POST("/api/v1/content/authors", { body }));
  }
  if (!result.ok) {
    return {
      ...problemState(result.problem, AUTHOR_FIELDS, { "content.slug_taken": "slug" }),
      values: typed,
    };
  }
  refresh();
  return { done: nextDone(state) };
}

export async function deleteAuthor(state: FormState, formData: FormData): Promise<FormState> {
  const id = text(formData, "id");
  if (!uuid.safeParse(id).success) return invalidState();
  const result = await send((client) =>
    client.DELETE("/api/v1/content/authors/{id}", { params: { path: { id } } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}

// ---------------------------------------------------------------- Chuyển hướng

const RedirectForm = z.object({
  from_path: z.string().trim().min(1).max(2000),
  target: z.enum(["url", "entry", "gone"]),
  to_url: z.string().trim().max(2000).optional(),
  to_entry_id: z.union([z.uuid(), z.literal("")]).optional(),
  status_code: z.enum(["301", "302", "307", "308"]).optional(),
  locale: z.string().regex(LOCALE_CODE),
});
const REDIRECT_FIELDS = ["from_path", "to_url", "to_entry_id", "status_code", "locale"] as const;

/** Tạo hay sửa một chuyển hướng: tới đường dẫn / URL, tới một bài, hoặc 410 (đã gỡ hẳn). */
export async function saveRedirect(state: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("structure.required");
  const typed = values(formData, [...REDIRECT_FIELDS, "target"]);
  const input = parseForm(RedirectForm, formData, t("field"), {
    from_path: t("fromPath"),
  });
  const fields: Record<string, string> = input.ok ? {} : { ...input.fields };
  if (input.ok && input.data.target === "url" && !input.data.to_url) fields.to_url = t("toUrl");
  if (input.ok && input.data.target === "entry" && !input.data.to_entry_id) {
    fields.to_entry_id = t("toEntry");
  }
  if (!input.ok || Object.keys(fields).length > 0) return { fields, values: typed };
  const { target, to_url, to_entry_id, status_code, from_path, locale } = input.data;
  const body = {
    from_path,
    locale,
    status_code: target === "gone" ? 410 : Number(status_code ?? "301"),
    to_url: target === "url" ? (to_url ?? null) : null,
    to_entry_id: target === "entry" ? to_entry_id || null : null,
  };
  const id = text(formData, "id");
  let result: Outcome<unknown>;
  if (id) {
    if (!uuid.safeParse(id).success) return invalidState();
    const tag = await freshTag(
      (c) => c.GET("/api/v1/content/redirects/{id}", { params: { path: { id } } }),
      text(formData, "updated_at"),
    );
    if (!tag.ok) return problemState(tag.problem, []);
    result = await send((client) =>
      client.PATCH("/api/v1/content/redirects/{id}", {
        params: { path: { id }, header: { "If-Match": tag.etag } },
        body,
      }),
    );
  } else {
    result = await send((client) => client.POST("/api/v1/content/redirects", { body }));
  }
  if (!result.ok) {
    return {
      ...problemState(result.problem, REDIRECT_FIELDS, {
        "content.redirect_exists": "from_path",
        "content.path_taken": "from_path",
        "content.redirect_loop": "to_url",
      }),
      values: typed,
    };
  }
  refresh();
  return { done: nextDone(state) };
}

export async function deleteRedirect(state: FormState, formData: FormData): Promise<FormState> {
  const id = text(formData, "id");
  if (!uuid.safeParse(id).success) return invalidState();
  const result = await send((client) =>
    client.DELETE("/api/v1/content/redirects/{id}", { params: { path: { id } } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}

/** Xoá nhiều chuyển hướng: lặp `DELETE /content/redirects/{id}` (core chưa có lệnh hàng loạt). */
export async function bulkDeleteRedirects(input: BulkInput): Promise<BulkResult> {
  const result = await eachId(cleanIds(input.ids), async (redirectId) => {
    if (!uuid.safeParse(redirectId).success) return (await invalidState()).error ?? "";
    const deleted = await send((client) =>
      client.DELETE("/api/v1/content/redirects/{id}", { params: { path: { id: redirectId } } }),
    );
    return deleted.ok ? null : deleted.problem.detail;
  });
  refresh();
  return result;
}

// ---------------------------------------------------------------- Phiên bản

export interface SnapshotPair {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

/**
 * Nội dung của hai phiên bản (`before` cũ hơn, `after` mới hơn) để so ở trình duyệt. `after`
 * bỏ trống: so với bản nháp hiện tại của bài.
 */
export async function revisionPair(
  entryId: string,
  beforeId: string,
  afterId: string | null,
): Promise<Outcome<SnapshotPair>> {
  if (
    !uuid.safeParse(entryId).success ||
    !uuid.safeParse(beforeId).success ||
    (afterId !== null && !uuid.safeParse(afterId).success)
  ) {
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
  const read = (revisionId: string) =>
    send((client) =>
      client.GET("/api/v1/content/entries/{id}/revisions/{revision_id}", {
        params: { path: { id: entryId, revision_id: revisionId } },
      }),
    );
  const before = await read(beforeId);
  if (!before.ok) return before;
  if (afterId) {
    const after = await read(afterId);
    if (!after.ok) return after;
    return {
      ok: true,
      data: { before: before.data.data.snapshot ?? null, after: after.data.data.snapshot ?? null },
    };
  }
  const current = await send((client) =>
    client.GET("/api/v1/content/entries/{id}", { params: { path: { id: entryId } } }),
  );
  if (!current.ok) return current;
  return {
    ok: true,
    data: {
      before: before.data.data.snapshot ?? null,
      after: current.data.data as unknown as Record<string, unknown>,
    },
  };
}
