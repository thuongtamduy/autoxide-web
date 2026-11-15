import "server-only";

// Tên và link của đích bình luận. `CommentDetail` chỉ có `target_type` + `target_id`; core chưa
// có API trả tiêu đề của đích (ResourceDirectory chỉ dùng bên trong core), nên với `content.entry`
// giao diện đọc bài qua API của module `content` khi người xem có `content.read`. Loại đích khác,
// hay bài đã xoá, hiện id. Có API thì bỏ hàm này (ghi ở chỗ thiếu API).
import { load } from "./core";
import { can } from "./viewer";

export interface TargetLabel {
  title: string;
  href?: string;
}

export function targetKey(type: string, id: string): string {
  return `${type}\u0000${id}`;
}

/** Tiêu đề của các đích (song song, mỗi đích một lời gọi). */
export async function targetLabels(
  targets: readonly { type: string; id: string }[],
): Promise<Map<string, TargetLabel>> {
  const labels = new Map<string, TargetLabel>();
  const entries = targets.filter((t) => t.type === "content.entry");
  if (entries.length > 0 && (await can("content.read"))) {
    await Promise.all(
      entries.map(async ({ type, id }) => {
        try {
          const { data } = await load((client) =>
            client.GET("/api/v1/content/entries/{id}", { params: { path: { id } } }),
          );
          labels.set(targetKey(type, id), { title: data.title, href: `/content/${id}` });
        } catch {
          // Bài đã xoá hay không đọc được: hiện id.
        }
      }),
    );
  }
  return labels;
}
