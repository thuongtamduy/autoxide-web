// Core giả cho test e2e: đủ các endpoint trang quản trị gọi, theo đúng hình dạng của
// `openapi.json`. Chạy: `node e2e/mock-core.ts` (Node tự bỏ kiểu TypeScript).
//
// Tài khoản:
// - admin@example.com / admin password — có mọi permission;
// - viewer@example.com / viewer password — thiếu `kernel.modules.read`;
// - mfa@example.com / mfa password — cần mã 123456 ở bước hai.
//
// Quản trị người dùng, role và trang công khai của link trong thư: `mock-access.ts`.
// Webhook, API key, audit, trạng thái AI, OpenAPI: `mock-settings.ts`.
//
// Mã của app xác thực luôn là 123456. Access token chỉ sống 31 giây (cookie của trang quản trị
// hết sau 1 giây), để test đi qua đường làm mới token. `GET /__stats` trả số lần làm mới;
// `POST /__reset` đưa mọi thứ về ban đầu (tài khoản, phiên, passkey, xác thực hai bước);
// `POST /__sessions` thêm một phiên như khi đăng nhập ở thiết bị khác.

import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Me } from "@autoxide/sdk";
import { KERNEL, NOTES } from "../src/test/fixtures.ts";
import { ADMIN_ROLE, accessRoutes, publicRoutes, resetAccess } from "./mock-access.ts";
import {
  type Account,
  empty,
  json,
  problem,
  type Schemas,
  send,
  text,
  wrongCode,
  wrongPassword,
} from "./mock-http.ts";
import { fireEvent, resetSettings, settingsRoutes } from "./mock-settings.ts";

const PORT = Number(process.env.MOCK_CORE_PORT ?? 4010);
const CODE = "123456";
const TOTP_SECRET = "JBSWY3DPEHPK3PXP";

function seed(): Account[] {
  const make = (
    email: string,
    password: string,
    canReadModules: boolean,
    mfa: boolean,
  ): Account => ({
    id: randomUUID(),
    email,
    name: email.split("@")[0] ?? email,
    password,
    canReadModules,
    mfa,
    recoveryCodes: [],
    totpPending: false,
    verified: false,
    passkeys: [],
    credentialIds: [],
    deleted: false,
    disabledAt: null,
    roleIds: canReadModules && !mfa ? [ADMIN_ROLE] : [],
    hasPassword: true,
    createdAt: "2026-11-12T00:00:00Z",
    updatedAt: "2026-11-12T00:00:00Z",
  });
  return [
    make("admin@example.com", "admin password", true, false),
    make("viewer@example.com", "viewer password", false, false),
    make("mfa@example.com", "mfa password", true, true),
  ];
}

type Session = {
  id: string;
  account: Account;
  started: string;
  lastActive: string;
  userAgent: string | null;
};

let accounts = seed();
const access = new Map<string, Session>();
const refresh = new Map<string, Session>();
const used = new Set<string>();
const mfa = new Map<string, { account: Account; userAgent: string | null }>();
const sessions = new Map<string, Session>();
const ceremonies = new Map<string, Account>();
let refreshes = 0;

function issue(session: Session) {
  const accessToken = randomUUID();
  const refreshToken = randomUUID();
  access.set(accessToken, session);
  refresh.set(refreshToken, session);
  session.lastActive = new Date().toISOString();
  return {
    data: {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 31,
      refresh_token: refreshToken,
      refresh_token_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      session_id: session.id,
    } satisfies Schemas["TokenResponse"],
  };
}

function startSession(account: Account, userAgent: string | null): Session {
  const now = new Date().toISOString();
  const session = { id: randomUUID(), account, started: now, lastActive: now, userAgent };
  sessions.set(session.id, session);
  return session;
}

/** Như core: refresh token của phiên ngừng dùng được ngay; access token đã cấp còn sống tới hạn. */
function endSession(id: string) {
  sessions.delete(id);
  for (const [token, session] of refresh) {
    if (session.id === id) refresh.delete(token);
  }
}

function caller(request: IncomingMessage): Session | undefined {
  const token = request.headers.authorization?.replace(/^Bearer /, "");
  const session = token ? access.get(token) : undefined;
  return session && !session.account.deleted && !session.account.disabledAt ? session : undefined;
}

function recoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => {
    const hex = randomBytes(8).toString("hex");
    return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
  });
}

function sessionView(session: Session): Schemas["SessionResponse"] {
  return {
    id: session.id,
    started_at: session.started,
    last_active_at: session.lastActive,
    expires_at: new Date(Date.parse(session.lastActive) + 30 * 86_400_000).toISOString(),
    user_agent: session.userAgent,
  };
}

/**
 * Như options của core: dạng JSON cho `parseCreationOptionsFromJSON()`. `openapi.json` mô tả
 * `options` là object tự do (kiểu sinh ra là `Record<string, never>`), nên ép kiểu ở đây.
 */
function creationOptions(account: Account): Record<string, never> {
  const options = {
    challenge: randomBytes(32).toString("base64url"),
    rp: { id: "localhost", name: "Autoxide" },
    user: {
      id: randomBytes(16).toString("base64url"),
      name: account.email,
      displayName: account.name,
    },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    timeout: 60_000,
    attestation: "none",
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    excludeCredentials: account.credentialIds.map((id) => ({ type: "public-key", id })),
  };
  return options as unknown as Record<string, never>;
}

function mfaStatus(account: Account): Schemas["MfaStatusResponse"] {
  return { totp_enabled: account.mfa, recovery_codes_remaining: account.recoveryCodes.length };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://mock");
  const route = `${request.method} ${url.pathname}`;
  const vi = request.headers["accept-language"] === "vi";
  const userAgent = request.headers["user-agent"] ?? null;

  if (route === "GET /__stats") {
    return send(response, 200, { refreshes });
  }
  if (route === "POST /__reset") {
    accounts = seed();
    access.clear();
    refresh.clear();
    used.clear();
    mfa.clear();
    sessions.clear();
    ceremonies.clear();
    refreshes = 0;
    resetAccess();
    resetSettings();
    return send(response, 204);
  }
  if (route === "POST /__webhooks/fire") {
    return fireEvent(request, response);
  }
  if (route === "POST /__sessions") {
    const body = await json(request);
    const account = accounts.find((a) => a.email === text(body, "email"));
    if (!account) return problem(response, 404, "not_found", "No such account.");
    const session = startSession(account, text(body, "user_agent") || null);
    return send(response, 201, { id: session.id });
  }
  if (route === "POST /api/v1/auth/login") {
    const body = await json(request);
    const account = accounts.find(
      (a) => !a.deleted && !a.disabledAt && a.email === body.email && a.password === body.password,
    );
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
      mfa.set(token, { account, userAgent });
      return send(response, 202, {
        data: { mfa_token: token, expires_in: 300, methods: ["totp"] },
      });
    }
    return send(response, 200, issue(startSession(account, userAgent)));
  }
  if (route === "POST /api/v1/auth/login/mfa") {
    const body = await json(request);
    const token = text(body, "mfa_token");
    const pending = mfa.get(token);
    if (!pending) {
      return problem(response, 401, "auth.invalid_mfa_token", "Sign in again.");
    }
    const code = text(body, "code");
    const recovery = pending.account.recoveryCodes.indexOf(code);
    if (code !== CODE && recovery < 0) {
      return problem(response, 401, "auth.invalid_mfa_code", "The code is wrong.");
    }
    if (recovery >= 0) pending.account.recoveryCodes.splice(recovery, 1);
    mfa.delete(token);
    return send(response, 200, issue(startSession(pending.account, pending.userAgent)));
  }
  if (route === "POST /api/v1/auth/refresh") {
    const body = await json(request);
    const token = text(body, "refresh_token");
    const session = refresh.get(token);
    if (used.has(token)) {
      return problem(response, 401, "auth.refresh_token_reused", "Sign in again.");
    }
    if (!session || session.account.deleted) {
      return problem(response, 401, "auth.invalid_refresh_token", "Sign in again.");
    }
    used.add(token);
    refresh.delete(token);
    refreshes += 1;
    return send(response, 200, issue(session));
  }
  if (route === "POST /api/v1/auth/logout") {
    const body = await json(request);
    const session = refresh.get(text(body, "refresh_token"));
    if (session) endSession(session.id);
    return empty(response, 204);
  }

  if (await publicRoutes(request, response, route, () => accounts)) return;
  // Tài liệu OpenAPI là công khai, như core.
  if (route === "GET /api/v1/openapi.json") {
    return send(response, 200, {
      openapi: "3.1.0",
      info: { title: "Autoxide (mock)", version: "0" },
    });
  }

  const session = caller(request);
  if (!session) {
    return problem(response, 401, "auth.invalid_token", "Sign in.");
  }
  const account = session.account;
  if (route === "GET /api/v1/auth/me") {
    return send(response, 200, {
      data: {
        id: account.id,
        email: account.email,
        name: account.name,
        email_verified_at: account.verified ? "2026-11-13T08:00:00Z" : null,
        all_permissions: account.canReadModules,
        permissions: [],
        created_at: "2026-11-12T00:00:00Z",
      } satisfies Me,
    });
  }
  if (url.pathname.startsWith("/api/v1/auth/me/") || url.pathname === "/api/v1/auth/me") {
    return mine(request, response, url, route, account);
  }
  const handled = await accessRoutes(
    request,
    response,
    url,
    () => accounts,
    (created) => accounts.push(created),
    (target) => {
      const ended = [...sessions.values()].filter((s) => s.account === target);
      for (const s of ended) endSession(s.id);
      return ended.length;
    },
  );
  if (handled) return;
  if (await settingsRoutes(request, response, url, account)) return;
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

/** `/api/v1/auth/me/…`: việc của chính người đang đăng nhập. */
async function mine(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  route: string,
  account: Account,
) {
  const userAgent = request.headers["user-agent"] ?? null;
  const body = request.method === "GET" ? {} : await json(request);
  const passwordOk = () => text(body, "current_password") === account.password;
  const endAll = (keep?: string | null) => {
    const ended = [...sessions.values()].filter((s) => s.account === account && s.id !== keep);
    for (const other of ended) endSession(other.id);
    return ended.length;
  };

  if (route === "POST /api/v1/auth/me/password") {
    if (!passwordOk()) return wrongPassword(response);
    const next = text(body, "new_password");
    if (next.length < 12 || next.length > 128) {
      return problem(response, 422, "validation_failed", "The request has invalid fields.", [
        {
          field: "new_password",
          code: "length",
          detail: "must be between 12 and 128 characters long",
        },
      ]);
    }
    account.password = next;
    endAll();
    return send(response, 200, issue(startSession(account, userAgent)));
  }
  if (route === "POST /api/v1/auth/me/email") {
    if (!passwordOk()) return wrongPassword(response);
    const email = text(body, "new_email").trim().toLowerCase();
    if (accounts.some((a) => a.email === email && a !== account)) {
      return problem(response, 409, "auth.email_taken", "Another account has this email.");
    }
    return empty(response, 202);
  }
  if (route === "POST /api/v1/auth/me/email/verification") {
    if (account.verified) {
      return problem(response, 409, "auth.email_already_verified", "The address is verified.");
    }
    return empty(response, 202);
  }
  if (route === "GET /api/v1/auth/me/mfa") {
    return send(response, 200, { data: mfaStatus(account) });
  }
  if (route === "POST /api/v1/auth/me/mfa/totp") {
    if (!passwordOk()) return wrongPassword(response);
    if (account.mfa) return problem(response, 409, "auth.mfa_already_enabled", "It is on.");
    account.totpPending = true;
    const label = encodeURIComponent(account.email);
    return send(response, 200, {
      data: {
        secret: TOTP_SECRET,
        otpauth_url: `otpauth://totp/Autoxide:${label}?secret=${TOTP_SECRET}&issuer=Autoxide`,
      } satisfies Schemas["TotpSetupResponse"],
    });
  }
  if (route === "POST /api/v1/auth/me/mfa/totp/confirm") {
    if (!account.totpPending) {
      return problem(response, 409, "auth.mfa_setup_not_started", "Start the setup first.");
    }
    if (text(body, "code") !== CODE) return wrongCode(response);
    account.totpPending = false;
    account.mfa = true;
    account.recoveryCodes = recoveryCodes();
    return send(response, 200, {
      data: { recovery_codes: account.recoveryCodes } satisfies Schemas["RecoveryCodesResponse"],
    });
  }
  if (route === "POST /api/v1/auth/me/mfa/totp/disable") {
    if (!account.mfa) return problem(response, 409, "auth.mfa_not_enabled", "It is off.");
    const code = text(body, "code");
    if (code !== CODE && !account.recoveryCodes.includes(code)) return wrongCode(response);
    account.mfa = false;
    account.recoveryCodes = [];
    return send(response, 200, { data: mfaStatus(account) });
  }
  if (route === "POST /api/v1/auth/me/mfa/recovery-codes") {
    if (!account.mfa) return problem(response, 409, "auth.mfa_not_enabled", "It is off.");
    if (text(body, "code") !== CODE) return wrongCode(response);
    account.recoveryCodes = recoveryCodes();
    return send(response, 200, {
      data: { recovery_codes: account.recoveryCodes } satisfies Schemas["RecoveryCodesResponse"],
    });
  }
  if (route === "GET /api/v1/auth/me/passkeys") {
    return send(response, 200, {
      data: [...account.passkeys].reverse(),
      pagination: { limit: 50, next_cursor: null },
    } satisfies Schemas["Page_PasskeyResponse"]);
  }
  if (route === "POST /api/v1/auth/me/passkeys/registration") {
    if (!passwordOk()) return wrongPassword(response);
    const ceremony = randomUUID();
    ceremonies.set(ceremony, account);
    return send(response, 200, {
      data: {
        ceremony_id: ceremony,
        options: creationOptions(account),
      } satisfies Schemas["CeremonyResponse"],
    });
  }
  if (route === "POST /api/v1/auth/me/passkeys") {
    const ceremony = text(body, "ceremony_id");
    if (ceremonies.get(ceremony) !== account) {
      return problem(response, 400, "auth.invalid_passkey_ceremony", "Start again.");
    }
    ceremonies.delete(ceremony);
    const credential = body.credential as { id?: unknown; type?: unknown } | undefined;
    if (typeof credential?.id !== "string" || credential.type !== "public-key") {
      return problem(response, 400, "auth.passkey_rejected", "Not a registration response.");
    }
    if (account.credentialIds.includes(credential.id)) {
      return problem(response, 409, "auth.passkey_already_registered", "Already registered.");
    }
    const passkey = {
      id: randomUUID(),
      name: text(body, "name"),
      created_at: new Date().toISOString(),
      last_used_at: null,
    } satisfies Schemas["PasskeyResponse"];
    account.passkeys.push(passkey);
    account.credentialIds.push(credential.id);
    return send(response, 201, { data: passkey });
  }
  if (request.method === "DELETE" && url.pathname.startsWith("/api/v1/auth/me/passkeys/")) {
    const id = url.pathname.slice("/api/v1/auth/me/passkeys/".length);
    const index = account.passkeys.findIndex((p) => p.id === id);
    if (index < 0) return problem(response, 404, "auth.passkey_not_found", "No such passkey.");
    account.passkeys.splice(index, 1);
    account.credentialIds.splice(index, 1);
    return empty(response, 204);
  }
  if (route === "GET /api/v1/auth/me/sessions") {
    const list = [...sessions.values()].filter((s) => s.account === account).reverse();
    return send(response, 200, {
      data: list.map(sessionView),
      pagination: { limit: 50, next_cursor: null },
    } satisfies Schemas["Page_SessionResponse"]);
  }
  if (route === "DELETE /api/v1/auth/me/sessions") {
    const ended = endAll(url.searchParams.get("keep"));
    return send(response, 200, {
      data: { ended } satisfies Schemas["EndedSessionsResponse"],
    });
  }
  if (request.method === "DELETE" && url.pathname.startsWith("/api/v1/auth/me/sessions/")) {
    const id = url.pathname.slice("/api/v1/auth/me/sessions/".length);
    if (sessions.get(id)?.account !== account) {
      return problem(response, 404, "auth.session_not_found", "No such session.");
    }
    endSession(id);
    return empty(response, 204);
  }
  if (route === "GET /api/v1/auth/me/export") {
    // Phần của mỗi module là object tự do trong `openapi.json` (kiểu sinh ra không ghi được
    // trường nào), nên ép kiểu.
    const exported = {
      auth: { profile: { email: account.email, name: account.name } },
      notes: [],
    } as unknown as Schemas["PersonalDataResponse"];
    return send(response, 200, { data: exported });
  }
  if (route === "DELETE /api/v1/auth/me") {
    if (!passwordOk()) return wrongPassword(response);
    account.deleted = true;
    endAll();
    return empty(response, 204);
  }
  return problem(response, 404, "not_found", "No such route in the mock core.");
}

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`mock core on http://127.0.0.1:${PORT}\n`);
});
