import "server-only";

import { ApiError, type components, type Me, type ModuleInfo } from "@autoxide/sdk";
import { cache } from "react";
import type { Viewer } from "@/nav/nav";
import { holds } from "@/nav/nav";
import { sampleDataEnabled } from "@/sample";
import { isForbidden, load } from "./core";

// Người đang đăng nhập và sổ module, đọc một lần cho mỗi request (layout và trang dùng chung,
// `cache` của React gộp các lời gọi trong cùng một lần render).
export const getMe = cache(async (): Promise<Me> => {
  const { data } = await load((client) => client.GET("/api/v1/auth/me"));
  return data;
});

/** Sổ module của core; `null` khi người dùng không có quyền xem (vẫn dựng được khung). */
export const getModules = cache(async (): Promise<ModuleInfo[] | null> => {
  try {
    const { data } = await load((client) => client.GET("/api/v1/kernel/modules"));
    return data;
  } catch (error) {
    if (isForbidden(error)) return null;
    throw error;
  }
});

/**
 * Khách của request (`GET /kernel/tenant`, bước 33): tên, chế độ của bản cài, có phải khách nền tảng
 * (nhân sự vận hành) không. `null` khi core không trả được (core cũ chưa có endpoint).
 */
export const getCurrentTenant = cache(
  async (): Promise<components["schemas"]["CurrentTenant"] | null> => {
    try {
      return (await load((client) => client.GET("/api/v1/kernel/tenant"))).data;
    } catch (error) {
      if (error instanceof ApiError) return null;
      throw error;
    }
  },
);

/** Quyền của người đang đăng nhập, để ẩn nút họ không dùng được (core vẫn kiểm ở mỗi lời gọi). */
export const getViewer = cache(async (): Promise<Viewer> => {
  // Đang vào khách khác: `GET /auth/me` gửi kèm khách đó, core trả quyền ở đó (D-339).
  const me = await getMe();
  return {
    allPermissions: me.all_permissions,
    permissions: me.permissions,
    modules: null,
    sample: sampleDataEnabled(),
  };
});

/** Người đang đăng nhập có permission này (hoặc một trong danh sách). */
export async function can(permission: string | readonly string[]): Promise<boolean> {
  return holds(await getViewer(), permission);
}

/**
 * Các khách người dùng làm việc được (`GET /auth/me/tenants`): khách của mình trước, rồi khách vào được
 * qua uỷ quyền hay quyền vào hỗ trợ. Rỗng khi core không trả lời.
 */
export const getMyTenants = cache(
  async (): Promise<components["schemas"]["MyTenantResponse"][]> => {
    try {
      return (await load((client) => client.GET("/api/v1/auth/me/tenants"))).data;
    } catch (error) {
      if (error instanceof ApiError) return [];
      throw error;
    }
  },
);
