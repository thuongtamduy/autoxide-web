import "server-only";

import { ApiError } from "@autoxide/sdk";
import { cookies } from "next/headers";
import { cache } from "react";
import { coreClient, load } from "./core";
import { type MembershipRow, UNIT_COOKIE, type Unit, type UnitType, unitIdOf } from "./org";
import { UNITS_READ, USERS_READ } from "./permissions";
import { can } from "./viewer";

// Đọc cây tổ chức (module `organizations`) cho Server Component và Server Action.

/** Số trang tối đa khi đọc hết một danh sách (mỗi trang 200). */
const MAX_PAGES = 10;

/**
 * Mọi nút trong phạm vi của người xem (`GET /organizations/units`, cả nút đã lưu trữ). `null` khi
 * người xem không có `organizations.units.read` hay core không cài module `organizations` (404).
 */
export const loadUnits = cache(async (): Promise<Unit[] | null> => {
  if (!(await can(UNITS_READ))) return null;
  const all: Unit[] = [];
  let cursor: string | undefined;
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const answer = await load((client) =>
        client.GET("/api/v1/organizations/units", {
          params: { query: { limit: 200, order: "asc", ...(cursor ? { cursor } : {}) } },
        }),
      );
      all.push(...answer.data);
      cursor = answer.pagination.next_cursor ?? undefined;
      if (!cursor) break;
    }
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return null;
    throw error;
  }
  return all;
});

/** Loại nút của khách (`GET /organizations/unit-types`); rỗng khi không đọc được. */
export const loadUnitTypes = cache(async (): Promise<UnitType[]> => {
  try {
    return (await load((client) => client.GET("/api/v1/organizations/unit-types"))).data;
  } catch (error) {
    if (error instanceof ApiError) return [];
    throw error;
  }
});

/**
 * Số người ở mỗi nút (`GET /auth/memberships/counts`, D-332 của core): `direct` gán ở chính nút, `total`
 * gồm cả người ở nút trên. Rỗng khi thiếu `auth.users.read`.
 */
export async function loadMemberCounts(): Promise<Map<string, { direct: number; total: number }>> {
  if (!(await can(USERS_READ))) return new Map();
  const answer = await load((client) => client.GET("/api/v1/auth/memberships/counts"));
  return new Map(answer.data.map((c) => [c.org_id, { direct: c.direct, total: c.total }]));
}

/**
 * Dòng membership (mỗi dòng một role ở một nút), lọc theo `query`; đọc tới `MAX_PAGES` trang. Có
 * `org_id` thì gồm cả membership ở các nút trên (`inherited=true`, đánh dấu `inherited`). Cần
 * `auth.users.read`: không có thì rỗng.
 */
export async function loadMemberships(query: {
  org_id?: string;
  user_id?: string;
}): Promise<MembershipRow[]> {
  if (!(await can(USERS_READ))) return [];
  const all: MembershipRow[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const answer = await load((client) =>
      client.GET("/api/v1/auth/memberships", {
        params: {
          query: {
            ...query,
            ...(query.org_id ? { inherited: true } : {}),
            limit: 200,
            ...(cursor ? { cursor } : {}),
          },
        },
      }),
    );
    all.push(...answer.data);
    cursor = answer.pagination.next_cursor ?? undefined;
    if (!cursor) break;
  }
  return all;
}

/**
 * Nút đang chọn ở bộ chọn góc trên trái: cookie `ax_unit`, chỉ khi nút còn trong phạm vi người xem
 * và chưa lưu trữ. `null`: cả khách (không lọc). Nút gốc cũng là `null`: gốc là cả khách.
 */
export const currentUnit = cache(async (): Promise<Unit | null> => {
  const id = unitIdOf((await cookies()).get(UNIT_COOKIE)?.value);
  if (!id) return null;
  const units = await loadUnits();
  const unit = units?.find((u) => u.id === id);
  if (!unit || unit.status === "archived" || unit.parent_id === null) return null;
  return unit;
});

/** Nút gốc (id = id của khách); `null` khi không đọc được cây. */
export async function rootUnit(): Promise<Unit | null> {
  return (await loadUnits())?.find((u) => u.parent_id === null) ?? null;
}

/** Tham số lọc "của nút đang chọn" cho danh sách bài, media, form: `{}` khi xem cả khách. */
export async function ownerFilter(): Promise<{ owner_org?: string }> {
  const unit = await currentUnit();
  return unit ? { owner_org: unit.id } : {};
}

/** Một người dùng (tên, email) cho bảng thành viên; `null` khi không đọc được (đã xoá, thiếu quyền). */
export async function loadUser(
  id: string,
): Promise<{ id: string; name: string; email: string } | null> {
  const client = await coreClient();
  const { data, response } = await client.GET("/api/v1/auth/users/{id}", {
    params: { path: { id } },
  });
  return response.ok && data ? data.data : null;
}
