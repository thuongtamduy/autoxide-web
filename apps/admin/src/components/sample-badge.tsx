import { useTranslations } from "next-intl";

/**
 * Chip "Dữ liệu mẫu · chờ API bước N" cạnh tiêu đề của phần dùng dữ liệu mẫu (W-006). `title`
 * ghi endpoint còn thiếu, để người xem và agent biết phần nào chưa nối core. `step="mới"` (chưa có
 * trong lộ trình của core) ghi "chờ API mới"; `module` ghi "chờ module …" khi cả module chưa có.
 */
export function SampleBadge({
  step,
  endpoint,
  module,
}: {
  step: string;
  endpoint: string;
  module?: string;
}) {
  const t = useTranslations("sample");
  const label = module
    ? t("badgeModule", { module })
    : step === "mới"
      ? t("badgeNew")
      : t("badge", { step });
  return (
    <span className="badge b-sample" title={t("missing", { endpoint })} data-sample={step}>
      {label}
    </span>
  );
}
