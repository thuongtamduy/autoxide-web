import { describe, expect, it } from "vitest";
import { pageMetadata } from "./seo";

describe("metadata của trang", () => {
  it("trang của website: canonical theo ngôn ngữ, hreflang cho mọi ngôn ngữ và x-default", () => {
    const meta = pageMetadata({ locale: "en", path: "/blog", title: "Articles" });
    expect(meta.alternates?.canonical).toBe("/en/blog");
    expect(meta.alternates?.languages).toEqual({
      vi: "/blog",
      en: "/en/blog",
      "x-default": "/blog",
    });
    expect(meta.openGraph).toMatchObject({ url: "/en/blog", locale: "en_US", type: "website" });
  });

  it("bài chưa dịch chỉ có hreflang của chính nó; bài có bản dịch theo đường dẫn của bản dịch", () => {
    expect(
      pageMetadata({ locale: "en", path: "/blog/a", title: "A", alternates: {} }).alternates
        ?.languages,
    ).toEqual({ en: "/en/blog/a" });
    expect(
      pageMetadata({ locale: "vi", path: "/blog/a", title: "A", alternates: { en: "/blog/a-en" } })
        .alternates?.languages,
    ).toEqual({ vi: "/blog/a", en: "/en/blog/a-en", "x-default": "/blog/a" });
  });

  it("canonical do người viết đặt và noindex", () => {
    const meta = pageMetadata({
      locale: "vi",
      path: "/blog/a",
      title: "A",
      canonical: "https://example.com/a",
      noindex: true,
    });
    expect(meta.alternates?.canonical).toBe("https://example.com/a");
    expect(meta.robots).toEqual({ index: false, follow: true });
  });
});
