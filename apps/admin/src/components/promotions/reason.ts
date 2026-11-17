"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@/lib/format";
import type { Reason } from "@/sample/promotions";

const MONEY_PARAMS = new Set(["amount", "min_order", "missing", "price"]);
/** Mọi tham số các câu lý do có thể dùng: thiếu thì để trống thay vì lỗi định dạng. */
const BLANK: Record<string, string> = Object.fromEntries(
  [
    "percent",
    "amount",
    "min_order",
    "missing",
    "price",
    "slots",
    "code",
    "title",
    "buy",
    "have",
    "max",
    "group",
    "sku",
    "condition",
    "starts_at",
  ].map((k) => [k, ""]),
);

/**
 * Câu của một lý do (`Reason` của core: `code` + `params`), theo ngôn ngữ giao diện. Mã chưa đủ điều
 * kiện (`promotions.code_not_applicable`) mang `condition` là một lý do bỏ qua (`promotions.skip.*`),
 * dịch lồng vào câu.
 */
export function useReason(): (reason: Reason) => string {
  const t = useTranslations("promotions.why");
  const locale = useLocale();
  return (reason) => {
    const fmt: Record<string, string> = { ...BLANK };
    for (const [key, raw] of Object.entries(reason.params)) {
      if (MONEY_PARAMS.has(key) && /^\d+$/.test(raw)) fmt[key] = formatMoney(raw, "VND", locale);
      else if (key === "starts_at")
        fmt[key] = new Intl.DateTimeFormat(locale, {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "Asia/Ho_Chi_Minh",
        }).format(new Date(raw));
      else fmt[key] = raw;
    }
    const condition = reason.params.condition;
    if (condition && t.has(`promotions_skip_${condition}`)) {
      fmt.condition = t(`promotions_skip_${condition}`, fmt);
    }
    const key = reason.code.replaceAll(".", "_");
    return t.has(key) ? t(key, fmt) : reason.code;
  };
}
