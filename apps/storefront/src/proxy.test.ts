import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config } from "./proxy";

const runs = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("matcher của proxy", () => {
  it.each([
    "/api/v1/media/0193a0c4-7d1e-7c2a-9b1e-3f2d5c6b7a81/content?v=1",
    "/_next/static/chunk.js",
    "/sitemap.xml",
    "/robots.txt",
    "/favicon.ico",
  ])("không qua proxy: %s", (url) => {
    expect(runs(url)).toBe(false);
  });

  it.each([
    "/",
    "/en",
    "/blog",
    "/en/blog/category/chon-mua",
    "/blog/ve-sinh-thot-go",
    "/search?q=chao",
    "/feed.xml",
    "/en/feed.xml",
  ])("qua proxy (định tuyến ngôn ngữ): %s", (url) => {
    expect(runs(url)).toBe(true);
  });
});
