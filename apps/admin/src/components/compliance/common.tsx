import { useLocale, useTranslations } from "next-intl";
import type { RuleVersion } from "@/sample/compliance-rules";

// Khối dùng chung của phân hệ Tuân thủ (Server Component). Căn cứ pháp lý luôn đọc từ bộ quy định
// (dữ liệu có ngày hiệu lực), không viết cứng trong component.

/** Màu của nhãn theo mức cần làm. */
export const TONE_BADGE = {
  ok: "badge b-ok",
  warn: "badge b-warn",
  bad: "badge b-bad",
  info: "badge b-info",
} as const;

/** Dòng "Căn cứ" của một quy tắc: văn bản, ngày hiệu lực, phiên bản; nhắc đối chiếu khi cần. */
export function Basis({ rule, lead }: { rule: RuleVersion | undefined; lead?: string }) {
  const t = useTranslations("compliance.basis");
  if (!rule) return null;
  return (
    <p className="note cp-basis">
      {lead ? <>{lead} </> : null}
      <b>{t("label")}</b> {rule.legal_basis}. {t("effective", { version: rule.version })}{" "}
      <Day value={rule.effective_from} />
      {rule.effective_to ? (
        <>
          {" "}
          {t("until")} <Day value={rule.effective_to} />
        </>
      ) : null}
      .{rule.needs_legal_review ? <> {t("review")}</> : null}
    </p>
  );
}

/** Còn bao lâu tới một hạn (giờ, phút), hoặc đã quá hạn. */
export function TimeLeft({ until }: { until: string }) {
  const t = useTranslations("compliance");
  const left = Date.parse(until) - Date.now();
  if (left <= 0) return <span className="due bad">{t("overdue")}</span>;
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  return <span className="due">{t("left", { hours, minutes })}</span>;
}

/**
 * Một ngày theo luật (`YYYY-MM-DD`, vd ngày hiệu lực): không đổi múi giờ, vì ngày hiệu lực là ngày
 * lịch chứ không phải thời điểm.
 */
export function Day({ value }: { value: string }) {
  const locale = useLocale();
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  const text = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
    date,
  );
  return <time dateTime={value.slice(0, 10)}>{text}</time>;
}
