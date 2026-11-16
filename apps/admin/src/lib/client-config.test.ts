import { createAutoxideClient } from "@autoxide/sdk";
import { describe, expect, it, vi } from "vitest";

// File server-only: thay `server-only`, cookie và client thật bằng bản rỗng; test gọi thẳng
// `readClientConfig` với client có `fetch` giả.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("./core", () => ({ anonymousClient: async () => null, coreClient: async () => null }));

const { readClientConfig } = await import("./client-config");

const config = (locales: string[]) => ({ content: { locales, default_locale: locales[0] } });

/** Client giả: ghi lại header `Authorization`, trả `answer`. */
function client(answer: () => Response | Promise<Response>, seen: (string | null)[] = []) {
  return async () =>
    createAutoxideClient({
      baseUrl: "http://core.test",
      accessToken: "tok",
      fetch: async (request) => {
        seen.push(request.headers.get("authorization"));
        return answer();
      },
    });
}

const anonymous =
  (answer: () => Response | Promise<Response>, seen: string[] = []) =>
  async () =>
    createAutoxideClient({
      baseUrl: "http://core.test",
      fetch: async (request) => {
        seen.push(request.url);
        return answer();
      },
    });

describe("readClientConfig", () => {
  it("đã đăng nhập: gọi bằng token, nhận cấu hình của khách mình, không gọi như khách", async () => {
    const seen: (string | null)[] = [];
    const guest: string[] = [];
    const result = await readClientConfig(
      client(() => Response.json({ data: config(["vi", "en"]) }), seen),
      anonymous(() => Response.json({ data: config(["en"]) }), guest),
    );
    expect(result).toEqual(config(["vi", "en"]));
    expect(seen).toEqual(["Bearer tok"]);
    expect(guest).toHaveLength(0);
  });

  it("token bị từ chối (401): gọi lại như khách", async () => {
    const result = await readClientConfig(
      client(() =>
        Response.json(
          { type: "about:blank", title: "x", status: 401, code: "unauthorized", detail: "x" },
          { status: 401 },
        ),
      ),
      anonymous(() => Response.json({ data: config(["en"]) })),
    );
    expect(result).toEqual(config(["en"]));
  });

  it("chưa đăng nhập: gọi như khách", async () => {
    const result = await readClientConfig(
      null,
      anonymous(() => Response.json({ data: config(["en"]) })),
    );
    expect(result).toEqual(config(["en"]));
  });

  it("core không trả lời: `null`", async () => {
    const down = () => {
      throw new TypeError("fetch failed");
    };
    expect(await readClientConfig(client(down), anonymous(down))).toBeNull();
  });
});
