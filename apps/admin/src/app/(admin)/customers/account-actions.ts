"use server";

// Tài khoản người mua (`/auth/customers`, bước 34 của core, D-309): khoá / mở một tài khoản, bật / tắt
// cho người mua tự đăng ký (cài đặt `auth.customer_registration` ở nút gốc). Core kiểm
// `auth.customers.manage`; khoá thì người mua bị đăng xuất mọi nơi.
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { send } from "@/lib/action";
import type { ChangeState } from "@/lib/engage";
import { type FormState, nextDone, problemState } from "@/lib/form";
import { rootUnit } from "@/lib/org-server";
import { type BulkInput, type BulkResult, cleanIds, eachId } from "@/lib/table";

/** Khoá hay mở một tài khoản người mua; `id` là `<id>|lock` hay `<id>|unlock`. */
export async function setBuyerDisabled(state: FormState, formData: FormData): Promise<FormState> {
  const [id = "", move = ""] = String(formData.get("id") ?? "").split("|");
  const result = await send((client) =>
    client.PATCH("/api/v1/auth/customers/{id}", {
      params: { path: { id } },
      body: { disabled: move === "lock" },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}

/**
 * Đổi trạng thái đảo được cho menu "⋯" (`status` = `active` để mở, `disabled` để khoá): trả trạng
 * thái cũ để nút Hoàn tác gửi lại. Core không có ETag cho tài khoản người mua, nên `expect` bỏ qua.
 */
export async function changeBuyer(_state: ChangeState, formData: FormData): Promise<ChangeState> {
  const id = String(formData.get("id") ?? "");
  const disabled = formData.get("status") === "disabled";
  const result = await send((client) =>
    client.PATCH("/api/v1/auth/customers/{id}", { params: { path: { id } }, body: { disabled } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return {
    done: 1,
    previous: disabled ? "active" : "disabled",
    updated: result.data.data.updated_at,
  };
}

/**
 * Khoá / mở nhiều tài khoản (thanh hàng loạt). Core chỉ có `PATCH /auth/customers/{id}`: lặp từng
 * id, gom lỗi (câu của core); không bịa endpoint hàng loạt.
 */
async function bulkBuyers(input: BulkInput, disabled: boolean): Promise<BulkResult> {
  const result = await eachId(cleanIds(input.ids), async (id) => {
    const written = await send((client) =>
      client.PATCH("/api/v1/auth/customers/{id}", { params: { path: { id } }, body: { disabled } }),
    );
    return written.ok ? null : written.problem.detail;
  });
  refresh();
  return result;
}

export async function bulkLockBuyers(input: BulkInput): Promise<BulkResult> {
  return bulkBuyers(input, true);
}

export async function bulkUnlockBuyers(input: BulkInput): Promise<BulkResult> {
  return bulkBuyers(input, false);
}

/** Bật / tắt cho người mua tự tạo tài khoản ở website (`auth.customer_registration` ở nút gốc). */
export async function saveRegistration(state: FormState, formData: FormData): Promise<FormState> {
  const root = await rootUnit();
  if (!root) {
    const t = await getTranslations("errors");
    return { error: t("failed"), code: "org_not_found" };
  }
  const result = await send((client) =>
    client.PUT("/api/v1/organizations/units/{id}/settings/{key}", {
      params: { path: { id: root.id, key: "auth.customer_registration" } },
      body: { value: formData.get("open") === "on" },
    }),
  );
  if (!result.ok) return problemState(result.problem, []);
  refresh();
  return { done: nextDone(state) };
}
