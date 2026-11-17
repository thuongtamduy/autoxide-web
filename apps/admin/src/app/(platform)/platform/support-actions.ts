"use server";

// Server Action của mặt điều khiển nền tảng gọi core THẬT: cấp và thu hồi quyền vào dữ liệu một khách
// (`/auth/support-grants`, bước 34, cần `auth.support.grant` ở khách nền tảng), xuất toàn bộ dữ liệu
// một khách (`POST /kernel/tenants/{id}/exports`, cần `kernel.tenants.operate`). Core kiểm lý do,
// thời hạn, khách có cho hỗ trợ không; ở đây chỉ kiểm ô bắt buộc để gom lỗi một lần.
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { DialogState } from "@/components/ui/form-dialog";
import { send } from "@/lib/action";
import { type FormState, nextDone, problemState } from "@/lib/form";

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

const GRANT_FIELDS = [
  "tenant_id",
  "staff_user_id",
  "role_id",
  "basis",
  "hours",
  "legal_reference",
  "reason",
] as const;

/** Cấp quyền vào dữ liệu một khách có lý do và thời hạn; khách thấy lần cấp trong nhật ký. */
export async function grantSupport(state: DialogState, formData: FormData): Promise<DialogState> {
  const values = Object.fromEntries(GRANT_FIELDS.map((name) => [name, text(formData, name)]));
  const t = await getTranslations("platform.support.required");
  const fields: Record<string, string> = {};
  if (!values.tenant_id) fields.tenant_id = t("tenant");
  if (!values.staff_user_id) fields.staff_user_id = t("staff");
  if (!values.role_id) fields.role_id = t("role");
  if (!values.reason) fields.reason = t("reason");
  if (values.basis === "legal_request" && !values.legal_reference) {
    fields.legal_reference = t("legal");
  }
  if (Object.keys(fields).length > 0) return { fields, values };
  const result = await send((client) =>
    client.POST("/api/v1/auth/support-grants", {
      body: {
        tenant_id: values.tenant_id ?? "",
        staff_user_id: values.staff_user_id ?? "",
        role_id: values.role_id ?? "",
        basis: values.basis || "support",
        hours: Number(values.hours) || 1,
        reason: values.reason ?? "",
        ...(values.basis === "legal_request"
          ? { legal_reference: values.legal_reference ?? "" }
          : {}),
      },
    }),
  );
  if (!result.ok) {
    return {
      ...problemState(result.problem, [...GRANT_FIELDS], {
        "auth.support_access_disabled": "basis",
        "auth.support_duration_exceeded": "hours",
      }),
      values,
    };
  }
  refresh();
  return { done: nextDone(state) };
}

/**
 * Thu hồi một lần cấp (kể cả khi chưa hết hạn): nhân sự mất quyền vào ngay. `id` là
 * `<tenant_id>|<grant_id>` (core cần cả hai).
 */
export async function revokeSupport(state: FormState, formData: FormData): Promise<FormState> {
  const [tenantId = "", id = ""] = text(formData, "id").split("|");
  const result = await send((client) =>
    client.DELETE("/api/v1/auth/support-grants/{id}", {
      params: { path: { id }, query: { tenant_id: tenantId } },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}

/**
 * Xuất toàn bộ dữ liệu một khách (chạy nền, một tệp JSON Lines; không có mật khẩu, secret và nội dung
 * tệp tải lên). Đang có lượt chạy thì core trả lại lượt đó thay vì chạy thêm.
 */
export async function exportTenantData(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const result = await send((client) =>
    client.POST("/api/v1/kernel/tenants/{id}/exports", {
      params: { path: { id: text(formData, "tenant_id") } },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}
