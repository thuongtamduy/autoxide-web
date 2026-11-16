// Giao diện sáng / tối do người dùng chọn, giữ trong cookie (không phải dữ liệu bí mật).
// Không có cookie = theo cài đặt của máy (CSS `prefers-color-scheme`).
export const THEME_COOKIE = "ax_theme";
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** Lớp đặt trên <html>: `light` / `dark` khi đã chọn, không có gì khi theo máy. */
export function themeClass(value: string | undefined): string | undefined {
  return value === "light" || value === "dark" ? value : undefined;
}
