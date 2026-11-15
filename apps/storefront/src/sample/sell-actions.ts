"use server";

import type { FieldError } from "./checkout";

// Đăng ký bán hàng khi khách chưa tạo biểu mẫu `ban-tren-cho` trong core (mẫu, W-030): chỉ kiểm và báo
// đã nhận, không lưu, không gửi thư. Có biểu mẫu thì trang dùng module `forms` thật
// (`src/lib/forms-actions.ts`). Hồ sơ người bán thật mở bằng `POST /api/v1/marketplace/sellers` sau khi
// người bán có tài khoản (bước 46), rồi xác thực danh tính, chấp nhận quy chế, nộp giấy tờ.

export interface SellState {
  status: "idle" | "ok" | "error";
  errors: FieldError[];
  email: string;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const KINDS = ["enterprise", "household", "individual"];

export async function applyToSell(_: SellState, form: FormData): Promise<SellState> {
  const email = String(form.get("email") ?? "")
    .trim()
    .slice(0, 254);
  const errors: FieldError[] = [];
  if (!EMAIL.test(email)) errors.push({ field: "email", code: "email_invalid" });
  if (!KINDS.includes(String(form.get("kind") ?? "")))
    errors.push({ field: "kind", code: "seller_kind_required" });
  if (!String(form.get("category") ?? "").trim())
    errors.push({ field: "category", code: "category_required" });
  if (form.get("consent") !== "on") errors.push({ field: "consent", code: "consent_required" });
  if (errors.length > 0) return { status: "error", errors, email };
  return { status: "ok", errors: [], email };
}
