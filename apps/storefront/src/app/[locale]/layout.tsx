import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { SampleNotice } from "@/components/sample-notice";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { routing } from "@/i18n/routing";
import { siteUrl, themeVariant } from "@/lib/env";
import { siteIdentity } from "@/lib/site";
import { THEME_COOKIE, themeAttr } from "@/lib/theme";
import { sampleDataEnabled } from "@/sample";
// Thứ tự có nghĩa: biến → lớp của website (thay cho `style="…"` của bản thiết kế; `buyer.css` cho
// trang người mua và sàn, W-030) → luật của bản thiết kế (`shop.css`, gồm luật theo khổ màn ghi đè
// lên lớp của website, như bản gốc ghi đè style).
import "@/styles/tokens.css";
import "@/styles/site.css";
import "@/styles/buyer.css";
import "@/styles/shop.css";

// Layout gốc của website (mọi trang nằm dưới `[locale]`). Server Component: đầu trang, chân trang và
// mọi trang đọc core từ máy chủ; chỉ phần cần tương tác (ô bản tin, nút giỏ, sáng / tối, bình luận)
// là Client Component.

export async function generateMetadata(props: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) return {};
  const site = await siteIdentity(locale);
  const t = await getTranslations({ locale, namespace: "site" });
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: site.name, template: `%s · ${site.name}` },
    description: t("description", { name: site.name }),
    applicationName: site.name,
    openGraph: { siteName: site.name },
    alternates: {
      types: {
        "application/rss+xml": [
          { url: locale === "vi" ? "/feed.xml" : `/${locale}/feed.xml`, title: site.blogName },
        ],
      },
    },
  };
}

export default async function LocaleLayout(props: LayoutProps<"/[locale]">) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "nav" });
  const theme = themeAttr((await cookies()).get(THEME_COOKIE)?.value);
  const site = await siteIdentity(locale);
  const sample = sampleDataEnabled();
  return (
    <html lang={locale} data-theme={theme} data-variant={themeVariant()}>
      <body className="sp">
        <NextIntlClientProvider>
          <a className="skip" href="#main">
            {t("skip")}
          </a>
          {sample ? <SampleNotice /> : null}
          <SiteHeader locale={locale} site={site} />
          {props.children}
          <SiteFooter locale={locale} site={site} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
