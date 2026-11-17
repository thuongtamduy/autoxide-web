"use server";

// Server Action của tab "Hồ sơ công khai" (module `organizations` của core, D-315): sửa thông tin cửa
// hàng hiện trên website, và đọc phường / xã của một tỉnh cho ô địa chỉ (module `address`, D-314).
// Core kiểm quyền (`organizations.profile.manage` ở nút), địa chỉ theo danh mục hành chính và giờ
// mở cửa; ở đây chỉ đổi ô của form thành thân request.
import type { components } from "@autoxide/sdk";
import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { send } from "@/lib/action";
import { type FormState, nextDone, problemState } from "@/lib/form";

type Body = components["schemas"]["PublicProfileRequest"];

const FIELDS = ["display_name", "province_code", "commune_code", "line", "opens", "closes"];

/** Lỗi ô của core (`address.commune_code`, `opening_hours[0].closes`) về đúng ô của form. */
const FIELD_OF: Record<string, string> = {
  "address.province_code": "province_code",
  "address.commune_code": "commune_code",
  "address.line": "line",
  "address.country": "province_code",
};

export async function saveProfile(state: FormState, formData: FormData): Promise<FormState> {
  const value = (name: string) => String(formData.get(name) ?? "").trim();
  const values: Record<string, string> = {
    ...Object.fromEntries(FIELDS.map((name) => [name, value(name)])),
    public: formData.get("public") === "on" ? "on" : "",
    pickup: formData.get("pickup") === "on" ? "on" : "",
  };
  const t = await getTranslations("access.required");
  const fields: Record<string, string> = {};
  if (!values.display_name) fields.display_name = t("display_name");
  // Địa chỉ: hoặc để trống cả ba ô (không có địa chỉ), hoặc điền đủ.
  const address = [values.province_code, values.commune_code, values.line];
  if (address.some(Boolean)) {
    if (!values.province_code) fields.province_code = t("field");
    if (!values.commune_code) fields.commune_code = t("field");
    if (!values.line) fields.line = t("field");
  }
  if (Boolean(values.opens) !== Boolean(values.closes)) {
    fields[values.opens ? "closes" : "opens"] = t("field");
  }
  if (Object.keys(fields).length > 0) return { fields, values };
  const body: Body = {
    public: formData.get("public") === "on",
    pickup: formData.get("pickup") === "on",
    display_name: values.display_name ?? null,
    address: address.some(Boolean)
      ? {
          country: "VN",
          province_code: values.province_code ?? "",
          commune_code: values.commune_code ?? "",
          line: values.line ?? "",
        }
      : null,
    // Cùng giờ mọi ngày (1 = thứ Hai … 7 = Chủ nhật); để trống cả hai ô: bỏ giờ mở cửa.
    opening_hours:
      values.opens && values.closes
        ? [1, 2, 3, 4, 5, 6, 7].map((day) => ({
            day,
            opens: values.opens ?? "",
            closes: values.closes ?? "",
          }))
        : [],
  };
  const result = await send((client) =>
    client.PATCH("/api/v1/organizations/units/{id}/public-profile", {
      params: { path: { id: value("unit_id") } },
      body,
    }),
  );
  if (!result.ok) {
    const problem = {
      ...result.problem,
      ...(result.problem.errors
        ? {
            errors: result.problem.errors.map((entry) => ({
              ...entry,
              field:
                FIELD_OF[entry.field] ??
                (/^opening_hours\[\d+\]\.(opens|closes)$/.exec(entry.field)?.[1] || entry.field),
            })),
          }
        : {}),
    };
    return { ...problemState(problem, FIELDS), values };
  }
  refresh();
  return { done: nextDone(state) };
}

/** Phường, xã, đặc khu của một tỉnh (`GET /address/provinces/{code}/communes`); lỗi thì rỗng. */
export async function communesOf(code: string): Promise<{ value: string; label: string }[]> {
  if (!/^[0-9A-Za-z]{1,10}$/.test(code)) return [];
  const result = await send((client) =>
    client.GET("/api/v1/address/provinces/{code}/communes", { params: { path: { code } } }),
  );
  if (!result.ok || !result.data) return [];
  return result.data.data.map((unit) => ({ value: unit.code, label: unit.name }));
}
