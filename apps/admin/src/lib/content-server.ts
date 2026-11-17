import "server-only";

import { ApiError } from "@autoxide/sdk";
import type { AiState, Author, Entry, Term } from "./content";
import { load } from "./core";
import { AI_SUGGESTIONS_FEATURE } from "./plans";
import { lacksFeature } from "./plans-server";

// Đọc dữ liệu của màn Nội dung cho Server Component.

/** Một bài và phiên bản (`ETag`) của nó; `null` khi không có bài này. */
export async function loadEntry(id: string): Promise<{ entry: Entry; version: string } | null> {
  let version = "";
  try {
    const { data } = await load(async (client) => {
      const answer = await client.GET("/api/v1/content/entries/{id}", {
        params: { path: { id } },
      });
      version = answer.response.headers.get("etag") ?? "";
      return answer;
    });
    return { entry: data, version };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** Như `load`, nhưng lỗi (thiếu quyền, module tắt) thành `null` để trang vẫn dựng được. */
export async function optional<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError) return null;
    throw error;
  }
}

/** Một trang danh sách cho bộ chọn: mục đầu và có còn mục nữa không (thì hiện ô tìm). */
export interface PickList<T> {
  items: T[];
  more: boolean;
}

/** Hồ sơ tác giả, một trang 200; còn nữa thì trình soạn tìm theo tên (`q` của core). */
export async function loadAuthors(): Promise<PickList<Author>> {
  const page = await optional(
    load((client) => client.GET("/api/v1/content/authors", { params: { query: { limit: 200 } } })),
  );
  return { items: page?.data ?? [], more: Boolean(page?.pagination.next_cursor) };
}

/** Danh mục và thẻ, một trang 200; còn nữa thì trình soạn tìm theo tên. */
export async function loadTerms(): Promise<PickList<Term>> {
  const page = await optional(
    load((client) => client.GET("/api/v1/content/terms", { params: { query: { limit: 200 } } })),
  );
  return { items: page?.data ?? [], more: Boolean(page?.pagination.next_cursor) };
}

/** AI có bật không (`GET /api/v1/ai/status`). Nút AI chỉ chạy khi bật. */
export async function loadAi(): Promise<AiState> {
  try {
    const { data } = await load((client) => client.GET("/api/v1/ai/status"));
    return data.enabled ? { enabled: true } : { enabled: false, reason: "off" };
  } catch (error) {
    if (error instanceof ApiError) {
      return { enabled: false, reason: error.status === 403 ? "forbidden" : "off" };
    }
    throw error;
  }
}

/**
 * AI cho bài viết (gợi ý SEO, dịch): như `loadAi`, nhưng tắt kèm lý do `plan` khi gói của khách chưa
 * có tính năng `content.ai_suggestions` (bước 35) — core sẽ từ chối `feature_not_enabled`.
 */
export async function loadContentAi(): Promise<AiState> {
  if (await lacksFeature(AI_SUGGESTIONS_FEATURE)) return { enabled: false, reason: "plan" };
  return loadAi();
}
