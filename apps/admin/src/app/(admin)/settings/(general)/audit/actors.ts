import "server-only";

import { ApiError } from "@autoxide/sdk";
import { load } from "@/lib/core";
import { USERS_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";

/**
 * Tên người làm của MỘT mục audit (trang chi tiết). `GET /audit/{id}` không nhận `include=actor`
 * (chỉ danh sách nhận), nên đọc `GET /auth/users/{id}` một lần khi người xem có `auth.users.read`.
 * Danh sách không dùng hàm này: tên đi cùng câu trả lời (`actor_name`). Người đã xoá hay không đọc
 * được thì `null` (giao diện hiện mã).
 */
export async function actorName(id: string | null | undefined): Promise<string | null> {
  if (!id || !(await can(USERS_READ))) return null;
  try {
    const { data } = await load((client) =>
      client.GET("/api/v1/auth/users/{id}", { params: { path: { id } } }),
    );
    return data.name || data.email;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) return null;
    throw error;
  }
}
