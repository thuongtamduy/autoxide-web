import "server-only";

import { ApiError } from "@autoxide/sdk";
import { getClientConfig } from "./client-config";
import { load } from "./core";
import type { SupportGrant } from "./support";

/**
 * Lần cấp quyền vào một khách (hay 200 lần mới nhất của mọi khách khi không nêu khách, D-335), mới
 * trước; `null` khi core từ chối (thiếu `auth.support.grant`).
 */
export async function loadGrants(tenantId?: string): Promise<SupportGrant[] | null> {
  try {
    return (
      await load((c) =>
        c.GET("/api/v1/auth/support-grants", {
          params: { query: tenantId ? { tenant_id: tenantId } : {} },
        }),
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

/**
 * Khách có cho nhân sự nền tảng vào hỗ trợ không (`GET /auth/support-grants/allowed`, cài đặt
 * `auth.support_access` của khách, D-335); `null` khi không đọc được.
 */
export async function supportAllowed(tenantId: string): Promise<boolean | null> {
  try {
    return (
      await load((c) =>
        c.GET("/api/v1/auth/support-grants/allowed", {
          params: { query: { tenant_id: tenantId } },
        }),
      )
    ).data.support_access;
  } catch (error) {
    if (error instanceof ApiError) return null;
    throw error;
  }
}

/** Thời hạn chọn được khi cấp quyền vào: 1, 4 giờ và trần của bản cài (client-config, D-335). */
export async function supportHours(): Promise<number[]> {
  const max = (await getClientConfig())?.auth?.support_access_max_hours ?? 8;
  return [...new Set([1, 4, max].filter((h) => h >= 1 && h <= max))].sort((a, b) => a - b);
}
