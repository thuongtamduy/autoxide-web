"use server";

// Server Action của Thư viện media. Mọi lời gọi core chạy ở máy chủ với token lấy từ cookie
// `httpOnly`; trình duyệt chỉ nhận dữ liệu của tệp. Sửa tệp gửi `If-Match` với `ETag` đã đọc:
// người khác sửa trước thì core trả 412, giao diện báo và không ghi đè. Tải lên và thay nội dung
// không qua đây (Server Action giới hạn thân 1 MB) mà qua route `/media/upload`, `/media/{id}/replace`.
import type { Problem } from "@autoxide/sdk";
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { type Outcome, send } from "@/lib/action";
import { defined } from "@/lib/content";
import { type FormState, nextDone, parseForm, problemState } from "@/lib/form";
import type { AltSuggestion, MediaItem } from "@/lib/media";
import { sampleGuard, translateSample } from "@/lib/sample-action";
import { type LocalizedAlt, putMediaAlts } from "@/sample/media";

const id = z.uuid();
const version = z.string().min(1).max(200);

function invalid(): { ok: false; problem: Problem } {
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

export type ItemOutcome =
  | { ok: true; item: MediaItem; version: string }
  | { ok: false; problem: Problem };

const Changes = z
  .object({
    name: z.string().max(400),
    alt: z.string().max(2000),
    title: z.string().max(400),
    caption: z.string().max(4000),
    folder_id: z.uuid().nullable(),
    tags: z.array(z.string().max(100)).max(40),
    visibility: z.enum(["public", "private"]),
  })
  .partial();
export type MediaChanges = z.input<typeof Changes>;

/** Sửa chi tiết một tệp (`PATCH`, cần `If-Match`); trả tệp và phiên bản mới. */
export async function updateMedia(
  itemId: string,
  ifMatch: string,
  changes: MediaChanges,
): Promise<ItemOutcome> {
  const parsed = Changes.safeParse(changes);
  if (!id.safeParse(itemId).success || !version.safeParse(ifMatch).success || !parsed.success) {
    return invalid();
  }
  let etag = "";
  const result = await send(async (client) => {
    const answer = await client.PATCH("/api/v1/media/{id}", {
      params: { path: { id: itemId }, header: { "If-Match": ifMatch } },
      body: defined(parsed.data),
    });
    etag = answer.response.headers.get("etag") ?? "";
    return answer;
  });
  if (!result.ok) return result;
  refresh();
  return { ok: true, item: result.data.data, version: etag };
}

/** Đọc lại một tệp và phiên bản của nó (sau khi thay nội dung, hay khi bị 412). */
export async function readMedia(itemId: string): Promise<ItemOutcome> {
  if (!id.safeParse(itemId).success) return invalid();
  let etag = "";
  const result = await send(async (client) => {
    const answer = await client.GET("/api/v1/media/{id}", { params: { path: { id: itemId } } });
    etag = answer.response.headers.get("etag") ?? "";
    return answer;
  });
  if (!result.ok) return result;
  return { ok: true, item: result.data.data, version: etag };
}

/** Gợi ý alt bằng AI ở một ngôn ngữ. Core không lưu gì: người dùng sửa rồi bấm Lưu. */
export async function suggestAlt(
  itemId: string,
  locale: string,
  context: string,
): Promise<Outcome<AltSuggestion>> {
  if (!id.safeParse(itemId).success || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(locale)) {
    return invalid();
  }
  const result = await send((client) =>
    client.POST("/api/v1/media/{id}/alt-suggestions", {
      params: { path: { id: itemId } },
      body: { locale, ...(context.trim() ? { context: context.trim().slice(0, 500) } : {}) },
    }),
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data.data };
}

/** Alt của các ngôn ngữ khác (dữ liệu mẫu, W-006: core chỉ có một `alt` cho mỗi tệp). */
export async function saveLocalizedAlts(
  itemId: string,
  alts: LocalizedAlt[],
): Promise<Outcome<LocalizedAlt[]>> {
  const off = await sampleGuard();
  if (off) {
    return {
      ok: false,
      problem: {
        type: "about:blank",
        title: "Not Found",
        status: 404,
        code: "sample_data_off",
        detail: off.error ?? "",
      },
    };
  }
  if (!id.safeParse(itemId).success || alts.length > 20) return invalid();
  const result = await putMediaAlts(itemId, alts);
  if (!result.ok) return { ok: false, problem: await translateSample(result.problem) };
  refresh();
  return { ok: true, data: result.data.alts };
}

// ---------------------------------------------------------------- Thùng rác (hộp thoại xác nhận)

async function trashCall(
  state: FormState,
  formData: FormData,
  call: "trash" | "restore" | "purge",
): Promise<FormState> {
  const itemId = String(formData.get("id") ?? "");
  if (!id.safeParse(itemId).success) return { error: invalid().problem.detail };
  const params = { params: { path: { id: itemId } } };
  const result = await send((client) => {
    switch (call) {
      case "trash":
        return client.DELETE("/api/v1/media/{id}", params);
      case "restore":
        return client.POST("/api/v1/media/{id}/restore", params);
      case "purge":
        return client.POST("/api/v1/media/{id}/purge", params);
    }
  });
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}

/** Cho vào thùng rác: link công khai ngừng chạy, khôi phục được trong số ngày core giữ. */
export async function trashMedia(state: FormState, formData: FormData): Promise<FormState> {
  return trashCall(state, formData, "trash");
}

export async function restoreMedia(state: FormState, formData: FormData): Promise<FormState> {
  return trashCall(state, formData, "restore");
}

/** Xoá hẳn (cần `media.purge`); không hoàn tác được. */
export async function purgeMedia(state: FormState, formData: FormData): Promise<FormState> {
  return trashCall(state, formData, "purge");
}

// ---------------------------------------------------------------- Thư mục

const FolderForm = z.object({
  name: z.string().trim().min(1).max(255),
  parent_id: z.union([z.uuid(), z.literal("")]).optional(),
});

/** Thư mục mới, trong thư mục đang mở (hay ở gốc). */
export async function createFolder(state: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("media.folders");
  const values = { name: String(formData.get("name") ?? "") };
  const input = parseForm(FolderForm, formData, t("nameRequired"));
  if (!input.ok) return { fields: input.fields, values };
  const result = await send((client) =>
    client.POST("/api/v1/media/folders", {
      body: { name: input.data.name, parent_id: input.data.parent_id || null },
    }),
  );
  if (!result.ok) {
    return {
      ...problemState(result.problem, ["name"], { "media.folder_name_taken": "name" }),
      values,
    };
  }
  refresh();
  return { done: nextDone(state) };
}

/** Đổi tên thư mục (`If-Match` đọc ngay trước khi đổi). */
export async function renameFolder(state: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("media.folders");
  const folderId = String(formData.get("id") ?? "");
  const values = { name: String(formData.get("name") ?? "") };
  const input = parseForm(FolderForm, formData, t("nameRequired"));
  if (!input.ok) return { fields: input.fields, values };
  if (!id.safeParse(folderId).success) return { error: invalid().problem.detail };
  const ifMatch = String(formData.get("etag") ?? "") || "*";
  const result = await send((client) =>
    client.PATCH("/api/v1/media/folders/{id}", {
      params: { path: { id: folderId }, header: { "If-Match": ifMatch } },
      body: { name: input.data.name },
    }),
  );
  if (!result.ok) {
    return {
      ...problemState(result.problem, ["name"], { "media.folder_name_taken": "name" }),
      values,
    };
  }
  refresh();
  return { done: nextDone(state) };
}

/** Xoá thư mục trống (core từ chối thư mục còn tệp, kể cả tệp trong thùng rác). */
export async function deleteFolder(state: FormState, formData: FormData): Promise<FormState> {
  const folderId = String(formData.get("id") ?? "");
  if (!id.safeParse(folderId).success) return { error: invalid().problem.detail };
  const result = await send((client) =>
    client.DELETE("/api/v1/media/folders/{id}", { params: { path: { id: folderId } } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}

// ---------------------------------------------------------------- Bộ chọn ảnh của trình soạn

export interface PickerPage {
  items: MediaItem[];
  next: string | null;
}

/** Một trang ảnh cho bộ chọn ảnh (ảnh mới tải lên trước), lọc theo tên. */
export async function pickerImages(q: string, cursor: string | null): Promise<Outcome<PickerPage>> {
  const result = await send((client) =>
    client.GET("/api/v1/media", {
      params: {
        query: {
          type: "image/*",
          limit: 24,
          ...(q.trim() ? { q: q.trim().slice(0, 200) } : {}),
          ...(cursor ? { cursor: cursor.slice(0, 500) } : {}),
        },
      },
    }),
  );
  if (!result.ok) return result;
  return {
    ok: true,
    data: { items: result.data.data, next: result.data.pagination.next_cursor ?? null },
  };
}

/**
 * Đặt một ảnh thành công khai từ bộ chọn ảnh: bài đăng chỉ nhận ảnh công khai (core trả
 * `content.media_not_public`). Chỉ đổi `visibility`, nên gửi `If-Match: *` (đổi dù phiên bản nào).
 */
export async function makeMediaPublic(itemId: string): Promise<Outcome<MediaItem>> {
  if (!id.safeParse(itemId).success) return invalid();
  const result = await send((client) =>
    client.PATCH("/api/v1/media/{id}", {
      params: { path: { id: itemId }, header: { "If-Match": "*" } },
      body: { visibility: "public" },
    }),
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data.data };
}

/** Một tệp theo id (ảnh đại diện đang chọn của bài); `null` khi không còn hay không được xem. */
export async function mediaById(itemId: string): Promise<MediaItem | null> {
  if (!id.safeParse(itemId).success) return null;
  const result = await send((client) =>
    client.GET("/api/v1/media/{id}", { params: { path: { id: itemId } } }),
  );
  return result.ok ? result.data.data : null;
}
