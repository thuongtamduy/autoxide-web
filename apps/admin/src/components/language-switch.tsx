import { useLocale, useTranslations } from "next-intl";
import { setLanguage } from "@/app/actions";
import { LOCALES } from "@/i18n/locales";
import { cn } from "@/lib/cn";

const NAMES: Record<(typeof LOCALES)[number], string> = { en: "English", vi: "Tiếng Việt" };

/** Chọn ngôn ngữ; mỗi ngôn ngữ một nút gửi form (không cần JavaScript). */
export function LanguageSwitch() {
  const t = useTranslations("nav");
  const current = useLocale();
  return (
    <form action={setLanguage} aria-label={t("language")} className="flex gap-1 text-xs">
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="submit"
          name="locale"
          value={locale}
          lang={locale}
          aria-pressed={locale === current}
          className={cn(
            "rounded px-2 py-1",
            locale === current
              ? "bg-muted font-semibold text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {NAMES[locale]}
        </button>
      ))}
    </form>
  );
}
