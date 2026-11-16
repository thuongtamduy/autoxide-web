"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

// Thanh báo mất kết nối ở đầu vùng nội dung (thiết kế "Trạng thái toàn khung", tab Đang tải và mất kết
// nối): dữ liệu đang xem vẫn đọc được; lệnh ghi gửi lại an toàn vì mang Idempotency-Key. Theo sự kiện
// `online` / `offline` của trình duyệt; máy chủ luôn coi là đang có mạng.
const subscribe = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};

export function OfflineBanner() {
  const t = useTranslations("shell.offline");
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <p className="note warn" role="status" data-testid="offline-banner">
      <b>{t("title")}</b> {t("body")}
    </p>
  );
}
