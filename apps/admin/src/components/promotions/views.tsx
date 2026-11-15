import { getTranslations } from "next-intl/server";
import { formatMoney } from "@/lib/format";
import { vnDateTime } from "@/lib/promotions";
import type { ActivationCheck, PromotionStatus } from "@/sample/promotions";

// Phần hiện dùng chung của các tab màn "Khuyến mại" (Server Component).

/** Màu nhãn trạng thái chương trình (bảng trạng thái của bản thiết kế). */
export const STATUS_BADGE: Record<PromotionStatus, string> = {
  draft: "badge b-draft",
  scheduled: "badge b-sched",
  active: "badge b-ok",
  paused: "badge b-warn",
  ended: "badge b-arch",
  cancelled: "badge b-arch",
};

const CHECK_BADGE: Record<ActivationCheck["tone"], string> = {
  ok: "badge b-ok",
  warn: "badge b-warn",
  bad: "badge b-bad",
};

/** Các điều kiện kiểm khi bật (dùng ở dòng mở rộng và tab Flash sale). */
export async function Checks({ checks, locale }: { checks: ActivationCheck[]; locale: string }) {
  const t = await getTranslations("promotions.checks");
  return (
    <ul className="pm-checks">
      {checks.map((c) => (
        <li key={c.key} className="pm-check" data-tone={c.tone} data-check={c.key}>
          <span className="head">
            {t(`${c.key}.title`)}
            <span className={CHECK_BADGE[c.tone]}>
              <span className="dot" />
              {c.ok ? t("ok") : t("bad")}
            </span>
          </span>
          <span>
            {t(`${c.key}.${c.ok ? "okText" : "badText"}`, {
              value: c.params.value ?? "",
              max: c.params.max ?? "",
              legal_basis: c.params.legal_basis ?? "",
              missing: c.params.missing ?? "",
              authority: c.params.authority ?? "",
              reference: c.params.reference ?? "",
              due: c.params.due ? vnDateTime(c.params.due, locale) : "",
              items: c.params.items ?? "",
              quantity: c.params.quantity ?? "",
              not_required: c.params.not_required ?? "",
            })}
          </span>
          {c.code ? <span className="sub mono">{c.code}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Câu của một việc trong lịch sử / một phiên bản (`promotions.history.<code>`). Tham số là chữ thô
 * của hàm mẫu: giờ ISO đổi sang giờ Việt Nam, số tiền (giá sốc) đổi sang tiền.
 */
export async function historyText(
  code: string,
  params: Record<string, string>,
  locale: string,
): Promise<string> {
  const t = await getTranslations("promotions.history");
  const show = (v: string | undefined) => {
    if (!v) return "";
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return vnDateTime(v, locale);
    if (code === "flash_price_changed" && /^\d+$/.test(v)) return formatMoney(v, "VND", locale);
    return v;
  };
  return t.has(code)
    ? t(code, {
        from: show(params.from),
        to: show(params.to),
        reference: params.reference ?? "",
        code: params.code ?? "",
        count: params.count ?? "",
        sku: params.sku ?? "",
        locale: params.locale ?? "",
      })
    : code;
}
