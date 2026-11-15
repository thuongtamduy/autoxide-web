import "server-only";

import { ApiError } from "@autoxide/sdk";
import { load } from "@/lib/core";
import { USERS_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";

/**
 * Tên của những người làm thay đổi trong nhật ký. Mục audit chỉ có `actor_user_id`; đọc tên bằng
 * `GET /auth/users/{id}` (song song, mỗi người một lần) khi người xem có `auth.users.read`. Người đã
 * xoá hay không đọc được thì không có tên (giao diện hiện mã rút gọn).
 */
export async function actorNames(
  ids: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (unique.length === 0 || !(await can(USERS_READ))) return names;
  await Promise.all(
    unique.map(async (id) => {
      try {
        const { data } = await load((client) =>
          client.GET("/api/v1/auth/users/{id}", { params: { path: { id } } }),
        );
        names.set(id, data.name || data.email);
      } catch (error) {
        if (error instanceof ApiError && (error.status === 404 || error.status === 403)) return;
        throw error;
      }
    }),
  );
  return names;
}
