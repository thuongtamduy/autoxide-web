import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ApiError, createAutoxideClient, toApiError } from "./index";

const BASE = "http://core.test";
const seen: Request[] = [];
const server = setupServer(
  http.get(`${BASE}/api/v1/kernel/modules`, ({ request }) => {
    seen.push(request.clone());
    return HttpResponse.json({ data: [] });
  }),
  http.post(`${BASE}/api/v1/auth/logout`, ({ request }) => {
    seen.push(request.clone());
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(`${BASE}/api/v1/kernel/modules/:name`, () =>
    HttpResponse.json(
      {
        type: "about:blank",
        title: "Not Found",
        status: 404,
        code: "kernel.module_not_found",
        detail: "No module named `shop` is installed.",
      },
      { status: 404, headers: { "Content-Type": "application/problem+json" } },
    ),
  ),
);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  seen.length = 0;
});
afterAll(() => server.close());

describe("createAutoxideClient", () => {
  it("gắn token, ngôn ngữ; lệnh đọc không có Idempotency-Key", async () => {
    const client = createAutoxideClient({
      baseUrl: `${BASE}/`,
      accessToken: "abc",
      language: "vi",
    });

    const { data } = await client.GET("/api/v1/kernel/modules");

    expect(data).toEqual({ data: [] });
    const request = seen[0];
    expect(request?.headers.get("authorization")).toBe("Bearer abc");
    expect(request?.headers.get("accept-language")).toBe("vi");
    expect(request?.headers.has("idempotency-key")).toBe(false);
  });

  it("lệnh ghi mang Idempotency-Key mới mỗi lần", async () => {
    const client = createAutoxideClient({ baseUrl: BASE });

    await client.POST("/api/v1/auth/logout", { body: { refresh_token: "r" } });
    await client.POST("/api/v1/auth/logout", { body: { refresh_token: "r" } });

    const keys = seen.map((request) => request.headers.get("idempotency-key"));
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).not.toBe(keys[0]);
    expect(seen[0]?.headers.has("authorization")).toBe(false);
  });

  it("lỗi của core thành ApiError giữ nguyên code", async () => {
    const client = createAutoxideClient({ baseUrl: BASE });

    const { error, response } = await client.GET("/api/v1/kernel/modules/{name}", {
      params: { path: { name: "shop" } },
    });

    const failure = toApiError(response, error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure.status).toBe(404);
    expect(failure.code).toBe("kernel.module_not_found");
  });

  it("thân lỗi không phải Problem vẫn thành ApiError", () => {
    const failure = toApiError(new Response("bad gateway", { status: 502 }), "bad gateway");

    expect(failure.code).toBe("http_error");
    expect(failure.status).toBe(502);
  });
});
