import { describe, expect, it } from "vitest";
import { secureCookiesDropped } from "./insecure-origin";

describe("cookie Secure trên địa chỉ http", () => {
  it("http qua tên miền hay IP thật: cookie bị bỏ", () => {
    expect(secureCookiesDropped(true, { protocol: "http:", hostname: "admin.example.com" })).toBe(
      true,
    );
    expect(secureCookiesDropped(true, { protocol: "http:", hostname: "192.0.2.10" })).toBe(true);
  });

  it("https, localhost, hay đã tắt cookie Secure: không sao", () => {
    expect(secureCookiesDropped(true, { protocol: "https:", hostname: "admin.example.com" })).toBe(
      false,
    );
    expect(secureCookiesDropped(true, { protocol: "http:", hostname: "localhost" })).toBe(false);
    expect(secureCookiesDropped(true, { protocol: "http:", hostname: "127.0.0.1" })).toBe(false);
    expect(secureCookiesDropped(true, { protocol: "http:", hostname: "admin.localhost" })).toBe(
      false,
    );
    expect(secureCookiesDropped(false, { protocol: "http:", hostname: "admin.example.com" })).toBe(
      false,
    );
  });
});
