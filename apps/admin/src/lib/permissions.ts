// Permission của core mà giao diện cần biết tên để ẩn / hiện màn và nút. Core vẫn kiểm quyền
// thật ở từng lời gọi; tên lấy đúng từ `openapi.json` (mô tả "Requires `…`" của endpoint).

/** Xem sổ module (`GET /api/v1/kernel/modules`). */
export const MODULES_READ = "kernel.modules.read";

/** Xem tài khoản người dùng và role của họ (`GET /api/v1/auth/users…`). */
export const USERS_READ = "auth.users.read";
/** Tạo, đổi tên, khoá / mở khoá, xoá tài khoản; đặt mật khẩu đầu tiên; đăng xuất, gỡ MFA. */
export const USERS_MANAGE = "auth.users.manage";
/** Xem role và sổ permission (`GET /api/v1/auth/roles`, `/permissions`). */
export const ROLES_READ = "auth.roles.read";
/** Tạo, sửa, xoá role và gán role cho người dùng. */
export const ROLES_MANAGE = "auth.roles.manage";

// Permission của bước 34 của core (chưa có): màn dùng dữ liệu mẫu tới khi core có (W-006).
/** Mời nhân sự vào một nút (`/auth/invitations`). */
export const INVITATIONS_MANAGE = "auth.invitations.manage";
/** Xem uỷ quyền sang khách con. */
export const DELEGATIONS_READ = "auth.delegations.read";
/** Cấp và thu hồi uỷ quyền. */
export const DELEGATIONS_MANAGE = "auth.delegations.manage";
/** Xem nút tổ chức (và hồ sơ công khai của nút). */
export const UNITS_READ = "organizations.units.read";
/** Sửa nút tổ chức (và hồ sơ công khai của nút). */
export const UNITS_WRITE = "organizations.units.write";
/** Đổi cài đặt theo nút (vd `auth.support_access`). */
export const SETTINGS_WRITE = "organizations.settings.write";
/** Xem các lần cấp quyền vào hỗ trợ và lần vào. */
export const SUPPORT_ACCESS_READ = "auth.support_access.read";
