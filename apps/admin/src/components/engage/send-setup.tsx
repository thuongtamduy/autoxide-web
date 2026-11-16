import { useTranslations } from "next-intl";
import type { NewsletterSettings } from "@/lib/newsletter";

/**
 * Máy chủ đã sẵn sàng gửi bản tin chưa (`GET /newsletter/settings`): thiếu biến môi trường nào thì
 * báo trước, thay vì để người dùng bấm gửi rồi mới gặp lỗi 503. Đổi cấu hình là việc của người vận
 * hành (biến môi trường), nên chỉ báo, không có nút sửa. Không đọc được cấu hình thì không hiện gì.
 */
export function SendSetup({ settings }: { settings: NewsletterSettings | null }) {
  const t = useTranslations("engage.newsletter.setup");
  if (!settings) return null;
  if (settings.missing.length > 0) {
    return (
      <p className="note warn" data-testid="newsletter-setup">
        <b>{t("missingTitle")}</b> {t("missing", { vars: settings.missing.join(", ") })}
      </p>
    );
  }
  return (
    <p className="fhint" data-testid="newsletter-setup">
      {t("ready", {
        rate: settings.send_rate_per_minute,
        address: settings.postal_address || t("noAddress"),
      })}
    </p>
  );
}
