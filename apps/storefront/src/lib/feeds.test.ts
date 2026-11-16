import { describe, expect, it } from "vitest";
import { escapeXml, rss, sitemapEntries } from "./feeds";
import type { PublicEntry } from "./types";

const post = {
  id: "01a1dd85-6bac-7109-96c6-a07b7032b40e",
  title: "Chảo gang & inox <so sánh>",
  path: "/blog/chao-gang",
  excerpt: "Tóm tắt",
  first_published_at: "2026-11-08T03:00:00Z",
  authors: [{ id: "a", display_name: "Thu Hà", slug: "thu-ha" }],
  terms: [{ id: "t", taxonomy: "category", name: "Chọn mua", slug: "chon-mua", locale: "vi" }],
} as unknown as PublicEntry;

describe("RSS", () => {
  it("thoát ký tự XML, link theo ngôn ngữ, guid là id", () => {
    const xml = rss({
      site: "https://shop.example",
      title: "Góc bếp",
      description: "Bài viết",
      locale: "en",
      posts: [post],
    });
    expect(xml).toContain("<title>Chảo gang &amp; inox &lt;so sánh&gt;</title>");
    expect(xml).toContain("<link>https://shop.example/en/blog/chao-gang</link>");
    expect(xml).toContain(`<guid isPermaLink="false">${post.id}</guid>`);
    expect(xml).toContain("<dc:creator>Thu Hà</dc:creator>");
    expect(xml).toContain('href="https://shop.example/en/feed.xml"');
    expect(escapeXml(`'"`)).toBe("&apos;&quot;");
  });
});

describe("sitemap", () => {
  it("bỏ mục noindex và ngôn ngữ lạ; hreflang khi có bản dịch", () => {
    const entries = sitemapEntries("https://shop.example", [
      {
        id: "1",
        kind: "post",
        locale: "vi",
        path: "/blog/a",
        content_modified_at: "2026-11-01T00:00:00Z",
        noindex: false,
        translations: [{ locale: "en", path: "/blog/a-en" }],
      },
      {
        id: "2",
        kind: "page",
        locale: "en",
        path: "/about",
        content_modified_at: "2026-11-01T00:00:00Z",
        noindex: true,
        translations: [],
      },
      {
        id: "3",
        kind: "page",
        locale: "fr",
        path: "/x",
        content_modified_at: "2026-11-01T00:00:00Z",
        noindex: false,
        translations: [],
      },
    ]);
    expect(entries).toEqual([
      {
        url: "https://shop.example/blog/a",
        lastModified: "2026-11-01T00:00:00Z",
        alternates: {
          languages: { vi: "https://shop.example/blog/a", en: "https://shop.example/en/blog/a-en" },
        },
      },
    ]);
  });
});
