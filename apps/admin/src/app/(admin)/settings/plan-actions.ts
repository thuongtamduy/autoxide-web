"use server";

// Server Action của tab "Gói và thuê bao" phía khách (module `plans` của core, bước 35). Core kiểm
// quyền (`plans.billing.manage`), luật đổi gói (nâng: ngay, có kỳ `proration`; hạ: cuối kỳ) và trạng
// thái thuê bao; ở đây chỉ chuyển ô của form và đổi Problem thành lỗi theo ô.
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { send } from "@/lib/action";
import { type FormState, nextDone, problemState } from "@/lib/form";
import { parseChoice } from "@/lib/plans";

async function done(state: FormState): Promise<FormState> {
  refresh();
  return { done: nextDone(state) };
}

/**
 * Đổi gói (`POST /plans/subscription/change`). `reference` là mã của lần đổi này, sinh khi mở hộp
 * thoại: gửi lại cùng mã (vd bấm hai lần, mạng chập chờn) thì core không đổi hai lần.
 */
export async function changePlan(state: FormState, formData: FormData): Promise<FormState> {
  const choice = parseChoice(String(formData.get("choice") ?? ""));
  const reference = String(formData.get("reference") ?? "").slice(0, 200);
  if (!choice) {
    const t = await getTranslations("access.required");
    return { fields: { choice: t("field") } };
  }
  const result = await send((client) =>
    client.POST("/api/v1/plans/subscription/change", {
      body: { ...choice, reference: reference || crypto.randomUUID() },
    }),
  );
  if (!result.ok) {
    return problemState(result.problem, ["choice"], {
      "plans.plan_not_found": "choice",
      "plans.price_not_found": "choice",
    });
  }
  return done(state);
}

/** Huỷ gia hạn: dùng tới hết kỳ hiện tại (`at_period_end: true`), hoàn tác được trước khi hết kỳ. */
export async function cancelRenewal(state: FormState): Promise<FormState> {
  const result = await send((client) =>
    client.POST("/api/v1/plans/subscription/cancel", { body: { at_period_end: true } }),
  );
  if (!result.ok) return problemState(result.problem, []);
  return done(state);
}

/** Tiếp tục gia hạn (bỏ lệnh huỷ cuối kỳ). */
export async function resumeRenewal(state: FormState): Promise<FormState> {
  const result = await send((client) => client.POST("/api/v1/plans/subscription/resume"));
  if (!result.ok) return problemState(result.problem, []);
  return done(state);
}
