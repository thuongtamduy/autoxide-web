"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/**
 * Đổi ngôn ngữ ở chân trang: cùng đường dẫn ở ngôn ngữ kia. Bài viết có đường dẫn khác nhau theo
 * ngôn ngữ thì trang bài viết tự có link tới bản dịch (`translations` của core).
 */
export function LanguageSwitch({
  current,
  names,
  label,
}: {
  current: string;
  names: Record<string, string>;
  label: string;
}) {
  const pathname = usePathname();
  return (
    <nav className="lang-switch" aria-label={label}>
      {routing.locales.map((locale, index) => (
        <span key={locale}>
          {index > 0 ? <span aria-hidden="true"> · </span> : null}
          {locale === current ? (
            <span aria-current="true" lang={locale}>
              {names[locale]}
            </span>
          ) : (
            <Link href={pathname} locale={locale} lang={locale} hrefLang={locale}>
              {names[locale]}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
