// `metadata` của từng trang: tiêu đề, mô tả, Open Graph, `canonical` và `hreflang`. Một hàm cho
// mọi trang để không trang nào quên `canonical` hay bản dịch.
import type { Metadata } from "next";
import { type Locale, localePath, routing } from "@/i18n/routing";

export interface PageSeo {
  locale: Locale;
  /** Đường dẫn của trang, không có tiền tố ngôn ngữ (vd `/blog`). */
  path: string;
  title: string;
  description?: string;
  /**
   * Đường dẫn của trang ở các ngôn ngữ khác (không tiền tố). Bỏ trống = trang có cùng đường dẫn ở
   * mọi ngôn ngữ (trang của website); `{}` = trang chỉ có ở ngôn ngữ này (bài chưa dịch).
   */
  alternates?: Partial<Record<Locale, string>>;
  /** Canonical do người viết đặt (`seo.canonical_url` của bài), thay cho địa chỉ của trang. */
  canonical?: string;
  image?: { url: string; alt: string; width?: number | null; height?: number | null } | null;
  type?: "website" | "article";
  publishedTime?: string;
  noindex?: boolean;
}

export function pageMetadata(seo: PageSeo): Metadata {
  const others =
    seo.alternates ??
    Object.fromEntries(routing.locales.map((locale) => [locale, seo.path] as const));
  const languages: Record<string, string> = {};
  for (const locale of routing.locales) {
    const path = locale === seo.locale ? seo.path : others[locale];
    if (path) languages[locale] = localePath(locale, path);
  }
  if (languages[routing.defaultLocale])
    languages["x-default"] = languages[routing.defaultLocale] as string;
  const url = localePath(seo.locale, seo.path);
  return {
    title: seo.title,
    ...(seo.description ? { description: seo.description } : {}),
    alternates: { canonical: seo.canonical || url, languages },
    openGraph: {
      title: seo.title,
      ...(seo.description ? { description: seo.description } : {}),
      url,
      type: seo.type ?? "website",
      locale: seo.locale === "vi" ? "vi_VN" : "en_US",
      ...(seo.publishedTime ? { publishedTime: seo.publishedTime } : {}),
      ...(seo.image
        ? {
            images: [
              {
                url: seo.image.url,
                alt: seo.image.alt,
                ...(seo.image.width ? { width: seo.image.width } : {}),
                ...(seo.image.height ? { height: seo.image.height } : {}),
              },
            ],
          }
        : {}),
    },
    ...(seo.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}
