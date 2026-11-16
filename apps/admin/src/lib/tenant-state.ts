import { ApiError } from "@autoxide/sdk";

// Trạng thái của khách làm MỌI trang ngừng phục vụ (core trả cùng một mã cho mọi route, xem mục
// "Tenant state" của openapi.json): khung quản trị không dựng được, nên thay cả khung bằng một trang báo
// riêng (thiết kế "Trạng thái toàn khung"). Core trả `tenant_maintenance` cả khi khách đang bảo trì,
// đang dời sang database khác hay đang cấp phát (`ensure_serving` của core). Chỉ đọc (`tenant_read_only`) không thuộc nhóm này: vẫn xem
// được, khung hiện dải báo.

export type TenantBlock = "suspended" | "maintenance";

/** Lỗi này là khách bị chặn toàn bộ (tạm khoá, bảo trì)? Khác thì `null`. */
export function tenantBlock(error: unknown): TenantBlock | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 403 && error.code === "tenant_suspended") return "suspended";
  if (error.status === 503 && error.code === "tenant_maintenance") return "maintenance";
  return null;
}
