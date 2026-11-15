import "server-only";

import type { components } from "@autoxide/sdk";
import { load } from "./core";

type Role = components["schemas"]["RoleResponse"];

/** Trần số trang khi đọc hết role (200 role mỗi trang): đủ cho mọi khách thường gặp. */
const MAX_ROLE_PAGES = 10;

/**
 * Mọi role, để chọn khi gán cho người dùng. Core trả theo trang (tối đa 200); đọc lần lượt theo
 * con trỏ. Xếp theo tên cho dễ tìm.
 */
export async function allRoles(): Promise<Role[]> {
  const roles: Role[] = [];
  let cursor: string | null | undefined;
  for (let page = 0; page < MAX_ROLE_PAGES; page += 1) {
    const result = await load((client) =>
      client.GET("/api/v1/auth/roles", {
        params: { query: { limit: 200, order: "asc", ...(cursor ? { cursor } : {}) } },
      }),
    );
    roles.push(...result.data);
    cursor = result.pagination.next_cursor;
    if (!cursor) break;
  }
  return roles.sort((a, b) => a.name.localeCompare(b.name));
}
