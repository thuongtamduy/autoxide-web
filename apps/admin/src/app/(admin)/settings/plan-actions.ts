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

const PROFILE_FIELDS = [
  "legal_name",
  "tax_code",
  "email",
  "phone",
  "province_code",
  "commune_code",
  "line",
] as const;

/** Lỗi ô địa chỉ của core (`address.commune_code`) về đúng ô của form. */
const ADDRESS_FIELD: Record<string, string> = {
  "address.province_code": "province_code",
  "address.commune_code": "commune_code",
  "address.line": "line",
  "address.country": "province_code",
};

/**
 * Lưu hồ sơ xuất hoá đơn (`PUT /plans/billing-profile`, D-335 của core: thay cả hồ sơ). Địa chỉ: để
 * trống cả ba ô (không có), hoặc điền đủ. Core kiểm mã số thuế, email, tỉnh và phường.
 */
export async function saveBillingProfile(state: FormState, formData: FormData): Promise<FormState> {
  const values = Object.fromEntries(
    PROFILE_FIELDS.map((name) => [name, String(formData.get(name) ?? "").trim()]),
  ) as Record<(typeof PROFILE_FIELDS)[number], string>;
  const t = await getTranslations("access.required");
  const fields: Record<string, string> = {};
  if (!values.legal_name) fields.legal_name = t("field");
  if (!values.email) fields.email = t("field");
  const address = [values.province_code, values.commune_code, values.line];
  if (address.some(Boolean)) {
    if (!values.province_code) fields.province_code = t("field");
    if (!values.commune_code) fields.commune_code = t("field");
    if (!values.line) fields.line = t("field");
  }
  if (Object.keys(fields).length > 0) return { fields, values };
  const result = await send((client) =>
    client.PUT("/api/v1/plans/billing-profile", {
      body: {
        legal_name: values.legal_name,
        email: values.email,
        tax_code: values.tax_code || null,
        phone: values.phone || null,
        address: address.some(Boolean)
          ? {
              country: "VN",
              province_code: values.province_code,
              commune_code: values.commune_code,
              line: values.line,
            }
          : null,
      },
    }),
  );
  if (!result.ok) {
    const problem = {
      ...result.problem,
      ...(result.problem.errors
        ? {
            errors: result.problem.errors.map((entry) => ({
              ...entry,
              field: ADDRESS_FIELD[entry.field] ?? entry.field,
            })),
          }
        : {}),
    };
    return { ...problemState(problem, [...PROFILE_FIELDS]), values };
  }
  return done(state);
}
