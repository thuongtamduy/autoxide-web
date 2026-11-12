// Core giả cho test e2e: đủ các endpoint trang quản trị gọi, theo đúng hình dạng của
// `openapi.json`. Chạy: `node e2e/mock-core.ts` (Node tự bỏ kiểu TypeScript).
//
// Tài khoản:
// - admin@example.com / admin password — có mọi permission;
// - viewer@example.com / viewer password — thiếu `kernel.modules.read`;
// - mfa@example.com / mfa password — cần mã 123456 ở bước hai.
//
// Access token chỉ sống 31 giây (cookie của trang quản trị hết sau 1 giây), để test đi qua
// đường làm mới token. `GET /__stats` trả số lần làm mới; `POST /__reset` xoá trạng thái.
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { KERNEL, NOTES } from "../src/test/fixtures.ts";

const PORT = Number(process.env.MOCK_CORE_PORT ?? 4010);

type Account = { email: string; password: string; canReadModules: boolean; mfa: boolean };
const ACCOUNTS: Account[] = [
  { email: "admin@example.com", password: "admin password", canReadModules: true, mfa: false },
  { email: "viewer@example.com", password: "viewer password", canReadModules: false, mfa: false },
  { email: "mfa@example.com", password: "mfa password", canReadModules: true, mfa: true },
];

const access = new Map<string, Account>();
const refresh = new Map<string, Account>();
const used = new Set<string>();
const mfa = new Map<string, Account>();
let refreshes = 0;

function issue(account: Account) {
  const accessToken = randomUUID();
  const refreshToken = randomUUID();
  access.set(accessToken, account);
  refresh.set(refreshToken, account);
  return {
    data: {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 31,
      refresh_token: refreshToken,
      refresh_token_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      session_id: randomUUID(),
    },
  };
}

function send(response: ServerResponse, status: number, body?: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

function problem(response: ServerResponse, status: number, code: string, detail: string) {
  send(response, status, { type: "about:blank", title: "Error", status, code, detail });
}

async function json(request: IncomingMessage): Promise<Record<string, string>> {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
  }
  return text ? JSON.parse(text) : {};
}

function caller(request: IncomingMessage): Account | undefined {
  const token = request.headers.authorization?.replace(/^Bearer /, "");
  return token ? access.get(token) : undefined;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://mock");
  const route = `${request.method} ${url.pathname}`;
  const vi = request.headers["accept-language"] === "vi";

  if (route === "GET /__stats") {
    return send(response, 200, { refreshes });
  }
  if (route === "POST /__reset") {
    access.clear();
    refresh.clear();
    used.clear();
    mfa.clear();
    refreshes = 0;
    return send(response, 204);
  }
  if (route === "POST /api/v1/auth/login") {
    const body = await json(request);
    const account = ACCOUNTS.find((a) => a.email === body.email && a.password === body.password);
    if (!account) {
      return problem(
        response,
        401,
        "auth.invalid_credentials",
        vi ? "Email hoặc mật khẩu không đúng." : "The email or password is incorrect.",
      );
    }
    if (account.mfa) {
      const token = randomUUID();
      mfa.set(token, account);
      return send(response, 202, {
        data: { mfa_token: token, expires_in: 300, methods: ["totp"] },
      });
    }
    return send(response, 200, issue(account));
  }
  if (route === "POST /api/v1/auth/login/mfa") {
    const body = await json(request);
    const account = body.mfa_token ? mfa.get(body.mfa_token) : undefined;
    if (!account) {
      return problem(response, 401, "auth.invalid_mfa_token", "Sign in again.");
    }
    if (body.code !== "123456") {
      return problem(response, 401, "auth.invalid_mfa_code", "The code is wrong.");
    }
    mfa.delete(body.mfa_token ?? "");
    return send(response, 200, issue(account));
  }
  if (route === "POST /api/v1/auth/refresh") {
    const body = await json(request);
    const token = body.refresh_token ?? "";
    const account = refresh.get(token);
    if (used.has(token)) {
      return problem(response, 401, "auth.refresh_token_reused", "Sign in again.");
    }
    if (!account) {
      return problem(response, 401, "auth.invalid_refresh_token", "Sign in again.");
    }
    used.add(token);
    refresh.delete(token);
    refreshes += 1;
    return send(response, 200, issue(account));
  }
  if (route === "POST /api/v1/auth/logout") {
    const body = await json(request);
    refresh.delete(body.refresh_token ?? "");
    response.writeHead(204);
    return response.end();
  }

  const account = caller(request);
  if (!account) {
    return problem(response, 401, "auth.invalid_token", "Sign in.");
  }
  if (route === "GET /api/v1/auth/me") {
    return send(response, 200, {
      data: {
        id: randomUUID(),
        email: account.email,
        name: account.email.split("@")[0],
        all_permissions: account.canReadModules,
        created_at: "2026-11-12T00:00:00Z",
      },
    });
  }
  if (url.pathname.startsWith("/api/v1/kernel/modules")) {
    if (!account.canReadModules) {
      return problem(
        response,
        403,
        "permission_denied",
        "Missing permission `kernel.modules.read`.",
      );
    }
    if (url.pathname === "/api/v1/kernel/modules") {
      const listed = [KERNEL, NOTES].map((module) => ({
        ...module,
        migrations: module.migrations.map((m) => ({ ...m, applied: null })),
      }));
      return send(response, 200, { data: listed });
    }
    const name = decodeURIComponent(url.pathname.slice("/api/v1/kernel/modules/".length));
    const module = [KERNEL, NOTES].find((m) => m.name === name);
    if (!module) {
      return problem(response, 404, "kernel.module_not_found", `No module named \`${name}\`.`);
    }
    return send(response, 200, { data: module });
  }
  return problem(response, 404, "not_found", "No such route in the mock core.");
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`mock core on http://127.0.0.1:${PORT}\n`);
});
