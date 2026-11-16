"use client";

import { nextTheme, THEME_COOKIE, type Theme } from "@/lib/theme";
import { Icon } from "./icon";

/**
 * Nút sáng / tối: đổi `data-theme` của <html> ngay (không tải lại trang) và nhớ trong cookie một
 * năm. Cả hai biểu tượng có sẵn trong HTML, CSS chọn cái hợp với giao diện đang thấy (`.th-ic`), nên
 * máy chủ không cần biết máy của người đọc đang sáng hay tối.
 */
export function ThemeToggle({ label }: { label: string }) {
  const toggle = () => {
    const root = document.documentElement;
    const current =
      root.dataset.theme === "dark" || root.dataset.theme === "light"
        ? (root.dataset.theme as Theme)
        : undefined;
    const theme = nextTheme(current, window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.dataset.theme = theme;
    // biome-ignore lint/suspicious/noDocumentCookie: cookie giao diện không bí mật; Cookie Store API chưa có ở mọi trình duyệt
    document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <button
      type="button"
      className="iconbtn hdr-theme"
      aria-label={label}
      data-tip={label}
      onClick={toggle}
    >
      <Icon name="moon" className="th-ic th-moon" />
      <Icon name="sun" className="th-ic th-sun" />
    </button>
  );
}
