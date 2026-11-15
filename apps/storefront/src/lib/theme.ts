// Sáng / tối do người đọc chọn, giữ trong cookie `ax_theme` (cùng tên với trang quản trị; không
// phải dữ liệu bí mật nên trình duyệt tự ghi được). Không có cookie = theo máy (CSS
// `prefers-color-scheme`). Dùng được ở cả máy chủ và trình duyệt.
export const THEME_COOKIE = "ax_theme";
export type Theme = "light" | "dark";

/** Giá trị cho `data-theme` của <html>; `undefined` = theo máy. */
export function themeAttr(value: string | undefined): Theme | undefined {
  return value === "light" || value === "dark" ? value : undefined;
}

/** Giao diện kế tiếp khi bấm nút: ngược với giao diện đang thấy. */
export function nextTheme(current: Theme | undefined, systemDark: boolean): Theme {
  const shown = current ?? (systemDark ? "dark" : "light");
  return shown === "dark" ? "light" : "dark";
}
