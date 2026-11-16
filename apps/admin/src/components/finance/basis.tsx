import { useTranslations } from "next-intl";
import { Day } from "@/components/compliance/common";
import type { TaxRule } from "@/sample/tax";

/**
 * Dòng "Căn cứ" của một quy tắc có ngày hiệu lực (gói dữ liệu thuế, bước 36): văn bản, ngày hiệu
 * lực; nhắc đối chiếu khi quy tắc đánh dấu. Căn cứ luôn đọc từ dữ liệu, không viết cứng ở màn.
 */
export function TaxBasis({ rule, lead }: { rule: TaxRule | undefined; lead?: string }) {
  const t = useTranslations("finance.basis");
  if (!rule) return null;
  return (
    <p className="note cp-basis">
      {lead ? <>{lead} </> : null}
      <b>{t("label")}</b> {rule.legal_basis}. {t("since")} <Day value={rule.effective_from} />
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
