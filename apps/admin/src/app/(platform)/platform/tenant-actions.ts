"use server";

// Server Action của mặt điều khiển nền tảng gọi core THẬT (bước 33): tạo khách, đổi tên, tạm khoá /
// mở lại, bật / tắt chỉ đọc (D-296), dời khách sang placement khác (W-032). Core kiểm permission (`kernel.tenants.manage`,
// `kernel.tenants.move`) và người gọi thuộc khách nền tảng; ở đây chỉ kiểm ô bắt buộc để báo sớm và
// gom mọi lỗi một lần. Việc của bước 35 trở đi (cấp phát, gói, xuất dữ liệu) vẫn là dữ liệu mẫu ở
// `actions.ts`.
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { DialogState } from "@/components/ui/form-dialog";
import { send } from "@/lib/action";
import { type FormState, nextDone, problemState } from "@/lib/form";

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/** Tạo khách mới (`POST /kernel/tenants`): core gieo dữ liệu đầu cho mọi module rồi mới trả lời. */
export async function createTenant(state: DialogState, formData: FormData): Promise<DialogState> {
  const t = await getTranslations("platform.newTenant");
  const values = {
    slug: text(formData, "slug"),
    name: text(formData, "name"),
    placement: text(formData, "placement"),
    parent_id: text(formData, "parent_id"),
  };
  const fields: Record<string, string> = {};
  if (!values.slug) fields.slug = t("slugRequired");
  if (!values.name) fields.name = t("nameRequired");
  if (Object.keys(fields).length > 0) return { fields, values };
  const result = await send((client) =>
    client.POST("/api/v1/kernel/tenants", {
      body: {
        slug: values.slug,
        name: values.name,
        ...(values.placement ? { placement: values.placement } : {}),
        ...(values.parent_id ? { parent_id: values.parent_id } : {}),
      },
    }),
  );
  if (!result.ok) {
    return {
      ...problemState(result.problem, ["slug", "name", "placement", "parent_id"], {
        tenant_slug_taken: "slug",
        tenant_placement_not_found: "placement",
        tenant_placement_behind: "placement",
        tenant_not_found: "parent_id",
      }),
      values,
    };
  }
  refresh();
  return { done: nextDone(state), go: `/platform/tenants/${result.data.data.id}` };
}

/** Đổi tên khách; gửi `If-Match` để không ghi đè thay đổi của người khác. */
export async function renameTenant(state: FormState, formData: FormData): Promise<FormState> {
  const name = text(formData, "name");
  if (!name) {
    const t = await getTranslations("platform.newTenant");
    return { fields: { name: t("nameRequired") } };
  }
  return patchTenant(state, formData, { name }, ["name"]);
}

/** Tạm khoá khách: mọi request vào khách đó nhận 403 `tenant_suspended`. */
export async function suspendCoreTenant(state: FormState, formData: FormData): Promise<FormState> {
  // Lý do vào nhật ký audit của khách (`reason`, D-334 của core); core kiểm độ dài. Gom mọi ô thiếu
  // để báo một lần.
  const reason = text(formData, "reason");
  const fields: Record<string, string> = {};
  if (!reason) fields.reason = (await getTranslations("platform.tenant"))("suspendReasonRequired");
  if (formData.get("acknowledged") !== "on") {
    fields.acknowledged = (await getTranslations("sample.fields"))("acknowledge");
  }
  if (Object.keys(fields).length > 0) return { fields, values: { reason } };
  return patchTenant(state, formData, { status: "suspended", reason }, ["reason"]);
}

/**
 * Bật / tắt chỉ đọc (`read_only`, D-296 của core; `mode` là `on` hay `off`): khách vẫn đăng nhập,
 * xem, xuất dữ liệu; mọi lệnh ghi bị từ chối `403 tenant_read_only`. Độc lập với tạm khoá.
 */
export async function setCoreTenantReadOnly(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  return patchTenant(state, formData, { read_only: text(formData, "mode") === "on" }, []);
}

/** Mở lại khách đang tạm khoá. */
export async function resumeCoreTenant(state: FormState, formData: FormData): Promise<FormState> {
  return patchTenant(state, formData, { status: "active" }, []);
}

/**
 * Dời khách thật (`POST /kernel/tenants/{id}/move` với `dry_run: false`) theo đúng đích và
 * `keep_source` của lần chạy thử đang hiện. Core xếp job rồi trả lượt dời (201); trang mở trạng thái
 * của lượt đó (`?move=`) và tự làm mới tới khi xong. Lý do chặn (409) hiện nguyên câu của core.
 */
export async function startMove(state: DialogState, formData: FormData): Promise<DialogState> {
  const id = text(formData, "tenant_id");
  const to = text(formData, "to");
  const keepSource = text(formData, "keep_source") === "1";
  const result = await send((client) =>
    client.POST("/api/v1/kernel/tenants/{id}/move", {
      params: { path: { id } },
      body: { to, dry_run: false, keep_source: keepSource },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  // Core trả 200 kèm kế hoạch khi coi lời gọi là chạy thử; ở đây luôn gửi `dry_run: false` nên chỉ
  // 201 (lượt dời) là đúng. Kiểm `state` để kiểu dữ liệu chắc chắn là `TenantMove`.
  const moved = result.data.data;
  if (!("state" in moved)) {
    const t = await getTranslations("platform.tenant.move");
    return { error: t("notStarted") };
  }
  refresh();
  return {
    done: nextDone(state),
    go: `/platform/tenants/${encodeURIComponent(id)}?move=${encodeURIComponent(moved.id)}`,
  };
}

async function patchTenant(
  state: FormState,
  formData: FormData,
  body: { name?: string; status?: string; read_only?: boolean; reason?: string },
  fields: readonly string[],
): Promise<FormState> {
  const id = text(formData, "tenant_id") || text(formData, "id");
  const etag = text(formData, "etag");
  const result = await send((client) =>
    client.PATCH("/api/v1/kernel/tenants/{id}", {
      params: { path: { id }, header: etag ? { "If-Match": etag } : {} },
      body,
    }),
  );
  if (!result.ok) {
    if (result.problem.code === "precondition_failed") refresh();
    return {
      ...problemState(result.problem, fields),
      ...(body.name ? { values: { name: body.name } } : {}),
    };
  }
  refresh();
  return { done: nextDone(state) };
}
