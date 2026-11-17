import "server-only";

import { ApiError } from "@autoxide/sdk";
import { load } from "./core";
import type { SupportGrant } from "./support";

/** Lần cấp quyền vào một khách, mới trước; `null` khi core từ chối (thiếu `auth.support.grant`). */
export async function loadGrants(tenantId: string): Promise<SupportGrant[] | null> {
  try {
    return (
      await load((c) =>
        c.GET("/api/v1/auth/support-grants", { params: { query: { tenant_id: tenantId } } }),
      )
    ).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return null;
    throw error;
  }
}

/**
 * Nhân sự của khách nền tảng (người được cấp quyền vào) — `GET /auth/users` của chính khách nền tảng,
 * đang hoạt động, 200 người đầu. `[]` khi thiếu `auth.users.read`.
 */
export async function loadStaff(): Promise<{ value: string; label: string }[]> {
  try {
    const page = await load((c) =>
      c.GET("/api/v1/auth/users", { params: { query: { limit: 200, status: "active" } } }),
    );
    return page.data.map((u) => ({
      value: u.id,
      label: u.name ? `${u.name} · ${u.email}` : u.email,
    }));
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return [];
    throw error;
  }
}
