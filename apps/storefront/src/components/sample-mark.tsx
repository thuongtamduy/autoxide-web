import { useTranslations } from "next-intl";

/**
 * Dấu "mẫu" kín đáo cạnh tiêu đề của khối dùng dữ liệu mẫu (W-006, W-026). Trên website công khai
 * dấu này nhỏ, không lấn nội dung; `title` ghi endpoint còn thiếu (và bước của core) để người xem và
 * agent biết phần nào chưa nối core, như `SampleBadge` của trang quản trị. `note` thay câu đó khi
 * lý do khác (vd khách chưa tạo menu trong core).
 */
export function SampleMark(
  props: { endpoint: string; step: string; note?: undefined } | { note: string },
) {
  const t = useTranslations("sample");
  const title =
    props.note !== undefined
      ? props.note
      : t("missing", { endpoint: props.endpoint, step: props.step });
  return (
    <span className="smark" title={title}>
      {t("mark")}
    </span>
  );
}
