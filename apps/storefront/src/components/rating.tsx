import { useTranslations } from "next-intl";
import { formatRating } from "@/lib/format";

/** "★ 4,8 (212)": sao chỉ để nhìn; người dùng trình đọc màn hình nghe câu đầy đủ. */
export function Rating({ value, count, locale }: { value: number; count: number; locale: string }) {
  const t = useTranslations("product");
  const score = formatRating(value, locale);
  return (
    <span className="rating" title={t("ratingLabel", { score, count })}>
      <span className="stars" aria-hidden="true">
        ★
      </span>
      <span className="num" aria-hidden="true">
        {score}
      </span>
      <span className="muted" aria-hidden="true">
        ({count})
      </span>
      <span className="sr-only">{t("ratingLabel", { score, count })}</span>
    </span>
  );
}
