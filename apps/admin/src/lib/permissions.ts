// Permission của core mà giao diện cần biết tên để ẩn / hiện màn và nút. Core vẫn kiểm quyền
// thật ở từng lời gọi; tên lấy đúng từ `openapi.json` (mô tả "Requires `…`" của endpoint).

/** Xem sổ module (`GET /api/v1/kernel/modules`). */
export const MODULES_READ = "kernel.modules.read";

/** Xem tài khoản người dùng và role của họ (`GET /api/v1/auth/users…`). */
export const USERS_READ = "auth.users.read";
/** Tạo, đổi tên, khoá / mở khoá, xoá tài khoản; đặt mật khẩu đầu tiên; đăng xuất, gỡ MFA. */
export const USERS_MANAGE = "auth.users.manage";
/** Xem và gỡ passkey của người khác (core bước 32, D-251): cho người lo khôi phục tài khoản. */
export const PASSKEYS_MANAGE = "auth.passkeys.manage";
/** Xem và thu hồi API key của mọi người (`/api/v1/auth/all-api-keys`, D-272 của core). */
export const API_KEYS_MANAGE = "auth.api_keys.manage";
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
/** Sửa hồ sơ công khai của nút (tên, địa chỉ, giờ mở cửa hiện trên website). */
export const PROFILE_MANAGE = "organizations.profile.manage";
/** Xem các lần cấp quyền vào hỗ trợ và lần vào. */
export const SUPPORT_ACCESS_READ = "auth.support_access.read";

/** Quản lý webhook: endpoint, secret ký, lần giao (`/api/v1/webhooks…`). */
export const WEBHOOKS_MANAGE = "webhooks.manage";
/** Đọc nhật ký audit (`GET /api/v1/audit`). */
export const AUDIT_READ = "audit.read";
/** Xem trạng thái tính năng AI (`GET /api/v1/ai/status`). */
export const AI_VIEW = "ai.view";

// Permission của bước 33, 35, 52 của core (chưa có): màn Cài đặt dùng dữ liệu mẫu tới khi có.
/** Xem gói, thuê bao, mức dùng và kỳ thanh toán (bước 35). */
export const BILLING_READ = "plans.billing.read";
/** Đổi, huỷ gói và sửa hồ sơ xuất hoá đơn (bước 35). */
export const BILLING_MANAGE = "plans.billing.manage";
/** Thêm, xác minh, gỡ tên miền của khách (bước 33). */
export const DOMAINS_MANAGE = "kernel.domains.manage";
/** Đặt cấu hình và secret theo khách (`/api/v1/kernel/settings`, bước 33 của core). */
export const TENANT_SETTINGS_MANAGE = "kernel.settings.manage";

/** Bàn kỹ thuật: nhật ký request, event theo bản ghi, job (bước 52). */
export const DEVTOOLS_READ = "kernel.devtools.read";

// Nội dung: thư viện media (module `media`) và cấu trúc nội dung (module `content`).
/** Xem tệp, thư mục, thẻ và thùng rác của thư viện media. */
export const MEDIA_READ = "media.read";
/** Tải lên, sửa, thay nội dung, chuyển thư mục, công khai, cho vào thùng rác; thư mục. */
export const MEDIA_WRITE = "media.write";
/** Xoá hẳn tệp trong thùng rác. */
export const MEDIA_PURGE = "media.purge";
/** Đọc bài viết, trang, danh mục, thẻ, tác giả, menu cũ. */
export const CONTENT_READ = "content.read";
/** Danh mục, thẻ, tác giả, chuyển hướng (`content.manage`). */
export const CONTENT_MANAGE = "content.manage";
/** Menu của website (module `menus`, chưa có trong core: màn dùng dữ liệu mẫu). */
export const MENUS_READ = "menus.read";
/** Sửa menu của website (module `menus`, chưa có). */
export const MENUS_MANAGE = "menus.manage";
/** Thêm nút, đổi trạng thái nút (duyệt nút `pending`) ở nhánh của mình (bước 34). */
export const UNITS_MANAGE = "organizations.units.manage";

// Permission của bước 37 của core (module `compliance`, chưa có): màn Tuân thủ dùng dữ liệu mẫu.
/** Xem hồ sơ định danh (KYC). */
export const KYC_READ = "compliance.kyc.read";
/** Duyệt, trả lại hồ sơ định danh (chỉ bằng phiên đăng nhập của người). */
export const KYC_REVIEW = "compliance.kyc.review";
/** Xem hồ sơ pháp lý, website, danh sách kiểm, bộ hồ sơ Bộ Công Thương. */
export const LEGAL_READ = "compliance.legal.read";
/** Sửa hồ sơ pháp lý, ghi trạng thái hồ sơ Bộ Công Thương. */
export const LEGAL_MANAGE = "compliance.legal.manage";
/** Xem văn bản pháp lý, phiên bản và bằng chứng chấp nhận. */
export const DOCUMENTS_READ = "compliance.documents.read";
/** Phát hành phiên bản mới của văn bản. */
export const DOCUMENTS_MANAGE = "compliance.documents.manage";
/** Xem sổ mục đích, hạn lưu, yêu cầu của chủ thể dữ liệu. */
export const PRIVACY_READ = "compliance.privacy.read";
/** Sửa sổ mục đích; xử lý yêu cầu của chủ thể dữ liệu. */
export const PRIVACY_MANAGE = "compliance.privacy.manage";
/** Ghi nhận và xử lý sự cố dữ liệu cá nhân. */
export const INCIDENTS_MANAGE = "compliance.incidents.manage";
/** Xem vụ việc (báo vi phạm, khiếu nại). */
export const CASES_READ = "compliance.cases.read";
/** Xử lý vụ việc: ẩn tạm, báo bên bị phản ánh, quyết định. */
export const CASES_HANDLE = "compliance.cases.handle";
/** Đặt chính sách của khách (xác thực người đăng nội dung, kênh khiếu nại). */
export const POLICIES_MANAGE = "compliance.policies.manage";
/** Bỏ nhãn AI của nội dung đã đăng (module `content`). */
export const CONTENT_PUBLISH = "content.publish";

// Permission của nhân sự vận hành nền tảng. Khách, placement đã có ở core (bước 33, D-260); gói,
// thuê bao, cấp phát, sức khoẻ, hỗ trợ (bước 34, 35, 39) chưa có: phần đó dùng dữ liệu mẫu (W-014).
// Core còn đòi người gọi thuộc khách nền tảng (`tenant_platform_only`), vì admin của một khách thường
// có mọi permission.
/** Xem sổ khách hàng (`GET /api/v1/kernel/tenants`). */
export const TENANTS_READ = "kernel.tenants.read";
/** Tạo khách, đổi tên, tạm khoá / mở lại khách (`POST`, `PATCH /kernel/tenants…`). */
export const TENANTS_MANAGE = "kernel.tenants.manage";
/** Dời khách sang placement khác (`POST /kernel/tenants/{id}/move`, D-292 của core). */
export const TENANTS_MOVE = "kernel.tenants.move";
/** Vào ngữ cảnh một khách bằng header `Autoxide-Tenant` (bước 33). */
export const TENANTS_OPERATE = "kernel.tenants.operate";
/** Xoá hẳn một khách đã tạm khoá (D-337 của core, không hoàn tác được). */
export const TENANTS_DELETE = "kernel.tenants.delete";
/** Quản trị viên của khách tự xuất toàn bộ dữ liệu của khách mình (bước 33 của core). */
export const DATA_EXPORT = "kernel.data.export";
/** Xem các nơi lưu dữ liệu (placement) và trạng thái migration của chúng. */
export const PLACEMENTS_READ = "kernel.placements.read";
/** Xem gói, giá và quyền dùng của gói (bước 35). */
export const PLANS_READ = "plans.plans.read";
/** Tạo, sửa, ngừng bán gói; thêm, tắt giá (bước 35). */
export const PLANS_MANAGE = "plans.plans.manage";
/** Xem thuê bao, mức dùng của mọi khách (bước 35). */
export const SUBSCRIPTIONS_READ = "plans.subscriptions.read";
/** Gán gói, huỷ thuê bao, ghi đè, đánh dấu đã thu (bước 35). */
export const SUBSCRIPTIONS_MANAGE = "plans.subscriptions.manage";
/** Cấp phát khách mới và chạy lại lượt cấp phát (bước 35). */
export const PROVISION = "plans.provision";
/** Xem tồn đọng job, event, kết nối database và backup (bước 39). */
export const OPS_READ = "kernel.ops.read";
/** Cấp và thu hồi quyền vào dữ liệu khách để hỗ trợ (bước 34). */
export const SUPPORT_GRANT = "auth.support.grant";
