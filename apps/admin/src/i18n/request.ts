import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, pickLocale } from "./locales";

// Trang quản trị không cần ngôn ngữ trên URL: ngôn ngữ lấy từ cookie hoặc trình duyệt.
export default getRequestConfig(async () => {
  const locale = pickLocale(
    (await cookies()).get(LOCALE_COOKIE)?.value,
    (await headers()).get("accept-language"),
  );
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
