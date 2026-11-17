"use server";

// Chuyển khách đang làm việc (bước 34 của core): vào một khách qua uỷ quyền hay quyền vào hỗ trợ, rồi
// quay về khách của mình. Khách vào được lấy lại từ core (`GET /auth/me/tenants`) trước khi ghi cookie,
// để không vào khách người dùng tự gõ. Mỗi lời gọi sau đó core vẫn kiểm lại (hết hạn → 403).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { secureCookies } from "@/lib/env";
import { UNIT_COOKIE } from "@/lib/org";
import { WORK_COOKIE } from "@/lib/tenant";
import { getMyTenants } from "@/lib/viewer";

/** Vào khách `tenant_id` (phải là khách vào được, không phải khách của mình). */
export async function enterTenant(formData: FormData): Promise<void> {
  const id = String(formData.get("tenant_id") ?? "");
  const store = await cookies();
  // Đọc danh sách ở khách của mình (lời gọi `/auth/me…` không mang khách đang vào).
  const target = (await getMyTenants()).find((x) => x.id === id && x.access !== "direct");
  if (target) {
    store.set(WORK_COOKIE, target.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookies(),
      path: "/",
    });
  } else {
    store.delete(WORK_COOKIE);
  }
  // Nút đang chọn thuộc cây của khách cũ.
  store.delete(UNIT_COOKIE);
  redirect("/");
}

/** Quay về khách của chính mình. */
export async function leaveTenant(): Promise<void> {
  const store = await cookies();
  store.delete(WORK_COOKIE);
  store.delete(UNIT_COOKIE);
  redirect("/");
}
