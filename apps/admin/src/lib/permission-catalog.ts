// Sổ permission cho bộ chọn, đọc ở máy chủ. Core trả mô tả theo `Accept-Language` và mức rủi ro
// trong cùng một câu trả lời (D-264 của core).
import "server-only";
import { load } from "./core";
import type { PermissionInfo } from "./permission-groups";

/** Sổ permission của cả hệ thống (`GET /auth/permissions`, cần `auth.roles.read`) — cho màn Role. */
export async function permissionCatalog(): Promise<PermissionInfo[]> {
  const { data } = await load((client) => client.GET("/api/v1/auth/permissions"));
  return data;
}

/**
 * Permission của chính người đang đăng nhập (`GET /me/permissions`, ai đăng nhập cũng gọi được),
 * kèm mô tả và rủi ro — đúng tập một API key của họ được phép có.
 */
export async function myPermissions(): Promise<PermissionInfo[]> {
  const { data } = await load((client) => client.GET("/api/v1/me/permissions"));
  return data;
}
