// Dựng RSS 2.0 và danh sách địa chỉ cho sitemap từ dữ liệu công khai của core. Hàm thuần.
import { type Locale, localePath, routing } from "@/i18n/routing";
import type { PublicEntry, SitemapItem } from "./types";

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RSS 2.0 của các bài (mới nhất trước); `id` của bài (không đổi) làm `guid`. */
export function rss({
  site,
  title,
  description,
  locale,
  posts,
}: {
  site: string;
  title: string;
  description: string;
  locale: Locale;
  posts: readonly PublicEntry[];
}): string {
  const home = `${site}${localePath(locale, "/blog")}`;
  const self = `${site}${localePath(locale, "/feed.xml")}`;
  const items = posts
    .map((post) => {
      const link = `${site}${localePath(locale, post.path)}`;
      const author = post.authors[0]?.display_name;
      return [
        "<item>",
        `<title>${escapeXml(post.title)}</title>`,
        `<link>${escapeXml(link)}</link>`,
        `<guid isPermaLink="false">${post.id}</guid>`,
        `<pubDate>${new Date(post.first_published_at).toUTCString()}</pubDate>`,
        post.excerpt ? `<description>${escapeXml(post.excerpt)}</description>` : "",
        author ? `<dc:creator>${escapeXml(author)}</dc:creator>` : "",
        ...post.terms.map((term) => `<category>${escapeXml(term.name)}</category>`),
        "</item>",
      ]
        .filter(Boolean)
        .join("");
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<title>${escapeXml(title)}</title>
<link>${escapeXml(home)}</link>
<description>${escapeXml(description)}</description>
<language>${locale}</language>
<atom:link href="${escapeXml(self)}" rel="self" type="application/rss+xml"/>
${items}
</channel>
</rss>
`;
}

export interface SitemapEntry {
  url: string;
  lastModified?: string;
  alternates?: { languages: Record<string, string> };
}

/** Địa chỉ của một mục sitemap của core, kèm bản dịch (`hreflang`). Mục `noindex` bị bỏ. */
export function sitemapEntries(site: string, items: readonly SitemapItem[]): SitemapEntry[] {
  const locales = routing.locales as readonly string[];
  return items
    .filter((item) => !item.noindex && locales.includes(item.locale))
    .map((item) => {
      const languages: Record<string, string> = {};
      for (const tr of [{ locale: item.locale, path: item.path }, ...item.translations]) {
        if (locales.includes(tr.locale))
          languages[tr.locale] = `${site}${localePath(tr.locale as Locale, tr.path)}`;
      }
      return {
        url: `${site}${localePath(item.locale as Locale, item.path)}`,
        lastModified: item.content_modified_at,
        ...(Object.keys(languages).length > 1 ? { alternates: { languages } } : {}),
      };
    });
}
