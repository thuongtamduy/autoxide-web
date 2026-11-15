import "server-only";

import type { Me, ModuleInfo } from "@autoxide/sdk";
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

/** Quyền của người đang đăng nhập, để ẩn nút họ không dùng được (core vẫn kiểm ở mỗi lời gọi). */
export const getViewer = cache(async (): Promise<Viewer> => {
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
