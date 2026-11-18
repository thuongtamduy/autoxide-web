"use client";

import { useTranslations } from "next-intl";
import { useHydrated } from "@/lib/hydrated";
import { secureCookiesDropped } from "@/lib/insecure-origin";

/**
 * Cảnh báo trên trang đăng nhập khi trang mở qua HTTP mà cookie phiên chỉ gửi qua HTTPS (W-060).
 * Đọc địa chỉ ở trình duyệt (cái trình duyệt thật sự thấy, kể cả sau proxy), nên chỉ hiện sau
 * hydration. `secure` là giá trị của máy chủ (`secureCookies()`), không phải secret.
 */
export function InsecureOriginWarning({ secure }: { secure: boolean }) {
  const t = useTranslations("login");
  const hydrated = useHydrated();
  if (!hydrated || !secureCookiesDropped(secure, window.location)) return null;
  return (
    <p role="alert" className="note warn w-full max-w-sm">
      {t("insecureOrigin")}
    </p>
  );
}
