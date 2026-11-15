import type { MetadataRoute } from "next";
import { localePath, routing } from "@/i18n/routing";
import { publicClient } from "@/lib/core";
import { siteUrl } from "@/lib/env";
import { sitemapEntries } from "@/lib/feeds";
import type { SitemapItem } from "@/lib/types";

// `sitemap.xml`: trang chủ và mục bài viết ở mọi ngôn ngữ, cùng mọi bài / trang đã đăng của core
// (`GET /api/v1/content/public/sitemap`, theo con trỏ tới hết, tối đa 50 trang × 200). Dựng mỗi lần
// có request: build không gọi core.
export const dynamic = "force-dynamic";

const MAX_PAGES = 50;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = siteUrl();
  const fixed = ["/", "/blog"].map((path) => ({
    url: `${site}${localePath(routing.defaultLocale, path)}`,
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `${site}${localePath(l, path)}`]),
      ),
    },
  }));
  const items: SitemapItem[] = [];
  try {
    const client = publicClient(routing.defaultLocale);
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const { data } = await client.GET("/api/v1/content/public/sitemap", {
        params: { query: { limit: 200, order: "asc", ...(cursor ? { cursor } : {}) } },
      });
      if (!data) break;
      items.push(...data.data);
      if (!data.pagination.next_cursor) break;
      cursor = data.pagination.next_cursor;
    }
  } catch {
    // Core không trả lời: sitemap chỉ còn các trang cố định, lần sau dựng lại.
  }
  return [...fixed, ...sitemapEntries(site, items)];
}
