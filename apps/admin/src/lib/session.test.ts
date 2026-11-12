import { describe, expect, it } from "vitest";
import { ACCESS_COOKIE, mfaCookie, REFRESH_COOKIE, safeNext, tokenCookies } from "./session";

const tokens = {
  access_token: "a",
  token_type: "Bearer",
  expires_in: 900,
  refresh_token: "r",
  refresh_token_expires_at: "2026-12-12T00:00:00Z",
  session_id: "s",
};

describe("tokenCookies", () => {
  it("cookie access hết trước token 30 giây; cookie refresh hết cùng token", () => {
    const [access, refresh] = tokenCookies(tokens, true);

    expect(access).toMatchObject({ name: ACCESS_COOKIE, value: "a" });
    expect(access?.options).toMatchObject({ httpOnly: true, secure: true, maxAge: 870 });
    expect(refresh).toMatchObject({ name: REFRESH_COOKIE, value: "r" });
    expect(refresh?.options.expires?.toISOString()).toBe("2026-12-12T00:00:00.000Z");
    expect(refresh?.options).toMatchObject({ sameSite: "lax", path: "/" });
  });

  it("token sắp hết ngay vẫn có cookie ít nhất 1 giây", () => {
    const [access] = tokenCookies({ ...tokens, expires_in: 10 }, false);

    expect(access?.options).toMatchObject({ maxAge: 1, secure: false });
  });

  it("cookie mfa sống bằng hạn của mfa_token", () => {
    const cookie = mfaCookie({ mfa_token: "m", expires_in: 300, methods: ["totp"] }, true);

    expect(cookie.options.maxAge).toBe(300);
  });
});

describe("safeNext", () => {
  it.each([
    ["/modules/auth", "/modules/auth"],
    ["/modules?x=1", "/modules?x=1"],
    [undefined, "/modules"],
    ["", "/modules"],
    ["https://evil.example", "/modules"],
    ["//evil.example", "/modules"],
    ["/\\evil.example", "/modules"],
    ["/login", "/modules"],
    [["/a"], "/modules"],
  ])("%j → %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});
