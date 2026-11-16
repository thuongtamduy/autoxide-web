"use server";

import { getTranslations } from "next-intl/server";
import { load } from "@/lib/core";
import { CONTENT_READ, MEDIA_READ, USERS_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";

// Nhóm "Kết quả" của bảng lệnh Ctrl K (thiết kế "Khung quản trị"): tìm dữ liệu thật ở các module core
// đã có tham số tìm — bài viết / trang (`q`), media (`q`), người dùng (`search`). Mỗi nguồn chỉ gọi khi
// người xem có permission đọc nó; nguồn lỗi thì bỏ qua (không làm hỏng các nguồn khác). Tìm chung một
// lời gọi xuyên phân hệ chờ API tìm chung của core (bước 52).

export interface SearchHit {
  key: string;
  label: string;
  /** Loại và trạng thái, đã dịch ("Bài viết · Bản nháp"). */
  context: string;
  href: string;
}

const PER_SOURCE = 5;
const MIN_LENGTH = 2;

/** Tìm `query` trong mọi nguồn người xem đọc được; tối đa 5 kết quả mỗi nguồn. */
export async function searchEverything(query: string): Promise<SearchHit[]> {
  const q = query.trim().slice(0, 200);
  if (q.length < MIN_LENGTH) return [];
  const t = await getTranslations();
  const [content, media, users] = await Promise.all([
    can(CONTENT_READ),
    can(MEDIA_READ),
    can(USERS_READ),
  ]);
  const sources: Promise<SearchHit[]>[] = [];
  if (content) {
    sources.push(
      load((client) =>
        client.GET("/api/v1/content/entries", { params: { query: { q, limit: PER_SOURCE } } }),
      ).then(({ data }) =>
        data.map((entry) => ({
          key: `entry/${entry.id}`,
          label: entry.title || t("shell.results.untitled"),
          // Bài nháp đang chờ duyệt hiện "Chờ duyệt" như danh sách bài.
          context: `${t(`content.kinds.${entry.kind}`)} · ${t(`content.status.${entry.status === "draft" && entry.review_requested_at ? "review" : entry.status}`)}`,
          href: `/content/${entry.id}`,
        })),
      ),
    );
  }
  if (media) {
    sources.push(
      load((client) =>
        client.GET("/api/v1/media", { params: { query: { q, limit: PER_SOURCE } } }),
      ).then(({ data }) =>
        data.map((item) => ({
          key: `media/${item.id}`,
          label: item.title || item.name,
          context: t("shell.results.media"),
          href: `/content/media?item=${item.id}`,
        })),
      ),
    );
  }
  if (users) {
    sources.push(
      load((client) =>
        client.GET("/api/v1/auth/users", {
          params: { query: { search: q, limit: PER_SOURCE } },
        }),
      ).then(({ data }) =>
        data.map((user) => ({
          key: `user/${user.id}`,
          label: user.name || user.email,
          context: user.name
            ? `${t("shell.results.user")} · ${user.email}`
            : t("shell.results.user"),
          href: `/org/access/users/${user.id}`,
        })),
      ),
    );
  }
  const settled = await Promise.allSettled(sources);
  return settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}
