"use server";

// Cấp phát khách theo gói (`/plans/provisionings`, D-338 của core): tạo khách, gán gói, dữ liệu mẫu,
// mời quản trị viên — chạy nền bằng job, hỏng thì sửa rồi chạy lại từ bước đã ghi. Core kiểm
// `plans.provision`, slug, gói, placement; ở đây chỉ kiểm ô bắt buộc để gom lỗi một lần.
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { DialogState } from "@/components/ui/form-dialog";
import { send } from "@/lib/action";
import { type FormState, nextDone, problemState } from "@/lib/form";
import { parseChoice } from "@/lib/plans";

const FIELDS = ["name", "slug", "choice", "placement", "parent_id", "admin_email", "admin_name"];

export async function provisionTenant(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const values = Object.fromEntries(
    FIELDS.map((name) => [name, String(formData.get(name) ?? "").trim()]),
  );
  const t = await getTranslations("access.required");
  const fields: Record<string, string> = {};
  if (!values.name) fields.name = t("field");
  if (!values.slug) fields.slug = t("field");
  if (!values.admin_email) fields.admin_email = t("field");
  const choice = parseChoice(values.choice ?? "");
  if (!choice) fields.choice = t("field");
  if (Object.keys(fields).length > 0 || !choice) return { fields, values };
  const result = await send((client) =>
    client.POST("/api/v1/plans/provisionings", {
      body: {
        name: values.name ?? "",
        slug: values.slug ?? "",
        plan_id: choice.plan_id,
        price_id: choice.price_id,
        admin_email: values.admin_email ?? "",
        ...(values.admin_name ? { admin_name: values.admin_name } : {}),
        ...(values.placement ? { placement: values.placement } : {}),
        ...(values.parent_id ? { parent_id: values.parent_id } : {}),
        sample_data: formData.get("sample_data") === "on",
      },
    }),
  );
  if (!result.ok) {
    return {
      ...problemState(result.problem, FIELDS, {
        tenant_slug_taken: "slug",
        "plans.provisioning_slug_taken": "slug",
        "plans.plan_not_found": "choice",
        "plans.kyc_required": "choice",
        tenant_placement_not_found: "placement",
        tenant_placement_behind: "placement",
      }),
      values,
    };
  }
  refresh();
  return { done: nextDone(state), go: "/platform/provisioning" };
}

/** Chạy lại một lượt cấp phát hỏng, từ bước đã ghi. */
export async function retryProvision(state: FormState, formData: FormData): Promise<FormState> {
  const result = await send((client) =>
    client.POST("/api/v1/plans/provisionings/{id}/retry", {
      params: { path: { id: String(formData.get("id") ?? "") } },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}
