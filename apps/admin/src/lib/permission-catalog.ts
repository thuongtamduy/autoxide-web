// Sổ permission cho bộ chọn của role và API key, đọc ở máy chủ. Mô tả lấy từ `GET /auth/permissions`
// (cần `auth.roles.read`); mức rủi ro lấy từ sổ module `GET /kernel/modules` (cần
// `kernel.modules.read`) — thiếu quyền đọc sổ module thì vẫn có sổ permission, chỉ thiếu nhãn rủi ro.
import "server-only";
import { isForbidden, load } from "./core";
import { type PermissionInfo, withRisk } from "./permission-groups";

/** Sổ permission kèm mức rủi ro. Ném lỗi của core như `load` (kể cả 403 của sổ permission). */
export async function permissionCatalog(): Promise<PermissionInfo[]> {
  const [catalog, modules] = await Promise.all([
    load((client) => client.GET("/api/v1/auth/permissions")),
    load((client) => client.GET("/api/v1/kernel/modules")).catch((error: unknown) => {
      if (isForbidden(error)) return null;
      throw error;
    }),
  ]);
  return modules ? withRisk(catalog.data, modules.data) : catalog.data;
}
