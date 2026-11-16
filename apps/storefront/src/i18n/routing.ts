import { defineRouting } from "next-intl/routing";

// Ngôn ngữ nằm trên địa chỉ (website công khai cần cho SEO): tiếng Việt là mặc định ở `/`,
// tiếng Anh dưới `/en` (`as-needed`). Không tự đoán ngôn ngữ theo trình duyệt hay cookie: một
// địa chỉ luôn ra đúng một ngôn ngữ, máy tìm kiếm và người dùng thấy như nhau; người đọc tự đổi
// bằng nút ngôn ngữ ở chân trang hay ở bài viết.
export const routing = defineRouting({
  locales: ["vi", "en"],
  defaultLocale: "vi",
  localePrefix: "as-needed",
  localeDetection: false,
  localeCookie: false,
});

export type Locale = (typeof routing.locales)[number];

/** Đường dẫn trên website của một địa chỉ không có tiền tố ngôn ngữ (`/blog/x` → `/en/blog/x`). */
export function localePath(locale: Locale, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === routing.defaultLocale) return clean;
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
}
