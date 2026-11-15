import { useTranslations } from "next-intl";

/**
 * Chip "Dữ liệu mẫu · chờ API bước N" cạnh tiêu đề của phần dùng dữ liệu mẫu (W-006). `title`
 * ghi endpoint còn thiếu, để người xem và agent biết phần nào chưa nối core.
 */
export function SampleBadge({ step, endpoint }: { step: string; endpoint: string }) {
  const t = useTranslations("sample");
  return (
    <span className="badge b-sample" title={t("missing", { endpoint })} data-sample={step}>
      {t("badge", { step })}
    </span>
  );
}
