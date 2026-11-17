"use server";

// Server Action của màn "Cây tổ chức" (module `organizations` của core, bước 34). Core kiểm quyền
// (`organizations.units.write` ở nút cha, `organizations.settings.write`), luật của cây và giá trị
// cài đặt; ở đây chỉ chuyển ô của form và đổi Problem thành lỗi theo ô.
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import type { DialogState } from "@/components/ui/form-dialog";
import { send } from "@/lib/action";
import { type FormState, nextDone, problemState } from "@/lib/form";
import { settingValue, UNIT_COOKIE, unitIdOf } from "@/lib/org";

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

/** Thêm nút con. Nút tạo ra `active` (người tạo có quyền duyệt) thì Hoàn tác = lưu trữ nút đó. */
export async function addUnit(state: DialogState, formData: FormData): Promise<DialogState> {
  const values = {
    parent_id: text(formData, "parent_id"),
    name: text(formData, "name"),
    unit_type: text(formData, "unit_type"),
    code: text(formData, "code"),
  };
  const t = await getTranslations("access.required");
  if (values.name.trim() === "") {
    return { fields: { name: t("field") }, values };
  }
  const code = values.code.trim();
  const result = await send((client) =>
    client.POST("/api/v1/organizations/units", {
      body: {
        parent_id: values.parent_id,
        name: values.name.trim(),
        unit_type: values.unit_type,
        ...(code ? { code } : {}),
      },
    }),
  );
  if (!result.ok) {
    return {
      ...problemState(result.problem, ["name", "unit_type", "code"], {
        "organizations.unit_code_taken": "code",
        "organizations.unit_type_not_found": "unit_type",
      }),
      values,
    };
  }
  const unit = result.data.data;
  refresh();
  return {
    done: nextDone(state),
    go: `/org?unit=${unit.id}`,
    ...(unit.status === "active" ? { undo: { id: unit.id } } : {}),
  };
}

/** Đổi trạng thái một nút (`POST …/status`): Hoàn tác "thêm nút" (lưu trữ), duyệt nút chờ. */
async function setStatus(
  state: DialogState,
  id: string,
  status: "active" | "suspended" | "archived",
): Promise<DialogState> {
  const result = await send((client) =>
    client.POST("/api/v1/organizations/units/{id}/status", {
      params: { path: { id } },
      body: { status },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}

export async function archiveUnit(state: DialogState, formData: FormData): Promise<DialogState> {
  return setStatus(state, text(formData, "id"), "archived");
}

export async function approveUnit(state: FormState, formData: FormData): Promise<FormState> {
  return setStatus(state, text(formData, "id"), "active");
}

/** Đặt giá trị một cài đặt ở nút. `current` (JSON) cho biết dạng giá trị để đổi chữ gõ vào. */
export async function putSetting(state: DialogState, formData: FormData): Promise<DialogState> {
  const values = { value: text(formData, "value") };
  // Giá trị đang có và mặc định (JSON) cho biết dạng giá trị (vd danh sách) để đổi chữ gõ vào.
  const parsed = (name: string): unknown => {
    try {
      return JSON.parse(text(formData, name) || "null");
    } catch {
      return null;
    }
  };
  const result = await send((client) =>
    client.PUT("/api/v1/organizations/units/{id}/settings/{key}", {
      params: { path: { id: text(formData, "unit_id"), key: text(formData, "key") } },
      body: { value: settingValue(values.value, parsed("current"), parsed("fallback")) },
    }),
  );
  if (!result.ok) {
    return {
      ...problemState(result.problem, ["value"], { "organizations.setting_invalid": "value" }),
      values,
    };
  }
  refresh();
  return { done: nextDone(state) };
}

/** "Dùng giá trị kế thừa": bỏ giá trị đặt riêng ở nút (`DELETE …/settings/{key}`). */
export async function dropSetting(state: FormState, formData: FormData): Promise<FormState> {
  // `id` của InlineAction mang "<unit_id>|<key>".
  const [unitId = "", key = ""] = text(formData, "id").split("|");
  const result = await send((client) =>
    client.DELETE("/api/v1/organizations/units/{id}/settings/{key}", {
      params: { path: { id: unitId, key } },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}

/**
 * Bộ chọn nút góc trên trái: nhớ nút trong cookie `ax_unit` (không phải secret). Gốc hay giá trị lạ
 * thì xoá cookie: xem cả khách. Màn đang xem giữ nguyên, chỉ dữ liệu đổi theo nút.
 */
export async function pickUnit(formData: FormData): Promise<void> {
  const id = unitIdOf(text(formData, "unit"));
  const store = await cookies();
  if (id && formData.get("root") !== "1") {
    store.set(UNIT_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  } else {
    store.delete(UNIT_COOKIE);
  }
  refresh();
}
