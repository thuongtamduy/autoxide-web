import "server-only";

import type { Me, ModuleInfo } from "@autoxide/sdk";
import { cache } from "react";
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
