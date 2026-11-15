import { useTranslations } from "next-intl";

/** Dải mỏng đầu trang khi bật dữ liệu mẫu: nói rõ phần nào là mẫu, không che nội dung. */
export function SampleNotice() {
  const t = useTranslations("sample");
  return (
    <div className="snotice" role="note">
      <div className="wrap">
        <span className="sn-long">{t("notice")}</span>
        <span className="sn-short">{t("noticeShort")}</span>
      </div>
    </div>
  );
}
