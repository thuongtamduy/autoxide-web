import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config } from "./proxy";

const runs = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("matcher của proxy", () => {
  it.each([
    "/login",
    "/login?next=%2Faccount",
    "/verify-email?token=abc",
    "/forgot-password",
    "/reset-password?token=abc",
    "/preview?token=abc",
    "/media/0193a0c4-7d1e-7c2a-9b1e-3f2d5c6b7a81/content?v=1",
    "/media/upload?name=a.jpg",
    "/_next/static/chunk.js",
  ])("trang không cần đăng nhập không qua proxy: %s", (url) => {
    expect(runs(url)).toBe(false);
  });

  it.each([
    "/",
    "/account",
    "/org/access/users",
    "/settings/modules",
    "/login-help",
    "/verify-emails",
    "/reset-password-x",
    "/previews",
    "/content",
    "/content/media",
    "/medias",
  ])("trang cần đăng nhập qua proxy: %s", (url) => {
    expect(runs(url)).toBe(true);
  });
});
