import { locale as rootLocale } from "next/root-params";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

// Ngôn ngữ lấy từ đoạn `[locale]` của địa chỉ (root param). Server Action và route handler không
// đọc được root param, nên ở đó luôn truyền ngôn ngữ rõ ràng: `getTranslations({ locale, … })`.
export default getRequestConfig(async ({ locale }) => {
  const candidate = locale ?? (await rootLocale());
  const resolved = hasLocale(routing.locales, candidate) ? candidate : routing.defaultLocale;
  const messages = (await import(`../../messages/${resolved}.json`)).default;
  return { locale: resolved, messages, timeZone: "Asia/Ho_Chi_Minh" };
});
