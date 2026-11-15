import "server-only";

import type { Entry } from "./content";
import { optional } from "./content-server";
import { load } from "./core";
import { getModules } from "./viewer";

// Phần THẬT của phân hệ Tuân thủ (còn lại là dữ liệu mẫu, W-012): đọc bài và trang của module
// `content` qua API công khai của core. Thiếu module hay permission thì trả `null`, trang vẫn dựng.

/** Số bài có nhãn AI hiện tối đa (một trang của core). */
export const AI_SCAN_LIMIT = 200;

/** Bài và trang có nhãn AI (`ai_generated=true`, core lọc), sửa gần nhất trước. */
export async function loadAiEntries(): Promise<Entry[] | null> {
  const page = await optional(
    load((c) =>
      c.GET("/api/v1/content/entries", {
        params: {
          query: { ai_generated: true, sort: "updated_at", order: "desc", limit: AI_SCAN_LIMIT },
        },
      }),
    ),
  );
  return page ? page.data : null;
}

/** Trang đã đăng của `content`: nguồn được nhận của văn bản pháp lý (một trang 200). */
export async function loadPublishedPages(): Promise<Entry[] | null> {
  const page = await optional(
    load((c) =>
      c.GET("/api/v1/content/entries", {
        params: { query: { kind: "page", status: "published", limit: 200 } },
      }),
    ),
  );
  return page ? page.data : null;
}

/** Các module tra dữ liệu theo email đã cài (`forms`, `newsletter`, `comments`). */
export async function emailLookupModules(): Promise<string[]> {
  const modules = await getModules();
  const names = modules?.map((m) => m.name) ?? null;
  return ["forms", "newsletter", "comments"].filter(
    (name) => names === null || names.includes(name),
  );
}
