import { afterEach, describe, expect, it } from "vitest";
import { forgetRefreshes, refreshTokens } from "./refresh";

const TOKENS = {
  access_token: "a2",
  token_type: "Bearer",
  expires_in: 900,
  refresh_token: "r2",
  refresh_token_expires_at: "2026-12-12T00:00:00Z",
  session_id: "s",
};

afterEach(() => forgetRefreshes());

describe("refreshTokens", () => {
  it("các request đồng thời với cùng refresh token chỉ gọi core một lần", async () => {
    let calls = 0;
    const fetch = async (request: Request) => {
      calls += 1;
      expect(await request.json()).toEqual({ refresh_token: "r1" });
      await new Promise((resolve) => setTimeout(resolve, 20));
      return Response.json({ data: TOKENS });
    };

    const results = await Promise.all([
      refreshTokens("r1", { baseUrl: "http://core.test", fetch }),
      refreshTokens("r1", { baseUrl: "http://core.test", fetch }),
      refreshTokens("r1", { baseUrl: "http://core.test", fetch }),
    ]);
    // Tới trễ, sau khi lần đầu đã xong: vẫn dùng lại kết quả.
    const late = await refreshTokens("r1", { baseUrl: "http://core.test", fetch });

    expect(calls).toBe(1);
    for (const result of [...results, late]) {
      expect(result).toEqual({ ok: true, tokens: TOKENS });
    }
  });

  it("token bị từ chối trả code của core", async () => {
    const fetch = async () =>
      Response.json(
        {
          type: "about:blank",
          title: "Unauthorized",
          status: 401,
          code: "auth.refresh_token_reused",
          detail: "Sign in again.",
        },
        { status: 401 },
      );

    const result = await refreshTokens("r9", { baseUrl: "http://core.test", fetch });

    expect(result).toEqual({ ok: false, status: 401, code: "auth.refresh_token_reused" });
  });

  it("core không trả lời thì báo 503, không coi là hết phiên", async () => {
    const fetch = async () => {
      throw new TypeError("fetch failed");
    };

    const result = await refreshTokens("r8", { baseUrl: "http://core.test", fetch });

    expect(result).toEqual({ ok: false, status: 503, code: "core_unreachable" });
  });
});
