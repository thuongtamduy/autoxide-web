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
// Cờ giao diện theo người dùng (`/api/v1/me/flags`): `mock-flags.ts`.
// Khách hàng, placement, cài đặt theo khách, dời khách (bước 33): `mock-tenants.ts`; tên miền
// riêng của khách: `mock-domains.ts`.
// Màn Nội dung (bài viết, trình soạn, xem trước): `mock-content.ts`.
// Phân hệ Tiếp thị (biểu mẫu, bản tin, bình luận): `mock-engage.ts`.
// Menu của website (module `menus`): `mock-menus.ts`.
// Phần công khai cho website `apps/storefront` (bài đã đăng, bình luận, bản tin): `mock-storefront.ts`.
//
// Mã của app xác thực luôn là 123456. Access token chỉ sống 31 giây (cookie của trang quản trị
// hết sau 1 giây), để test đi qua đường làm mới token. `GET /__stats` trả số lần làm mới;
// `POST /__reset` đưa mọi thứ về ban đầu (tài khoản, phiên, passkey, xác thực hai bước);
// `POST /__sessions` thêm một phiên như khi đăng nhập ở thiết bị khác (kèm `method`, `country`);
// `POST /__no-password` giả tài khoản chưa có mật khẩu.
// `POST /__ai` (`{"enabled": true}`) bật AI (`GET /api/v1/ai/status`) để thử "Hỏi bằng lời" của Đơn hàng.

import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Me } from "@autoxide/sdk";
import { KERNEL, NOTES } from "../src/test/fixtures.ts";
import {
  ADMIN_ROLE,
  accessRoutes,
  PERMISSION_CATALOG,
  publicRoutes,
  resetAccess,
} from "./mock-access.ts";
import {
  CONTENT_MODULE,
  contentBump,
  contentPreview,
  contentRoutes,
  resetContent,
  seedLegal,
  seedPages,
  setAiEnabled,
} from "./mock-content.ts";
import { domainRoutes, resetDomains, setDnsRecord } from "./mock-domains.ts";
import { ENGAGE_MODULES, engageRoutes, resetEngage } from "./mock-engage.ts";
import { flagRoutes, resetFlags } from "./mock-flags.ts";
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
import { mediaContent, mediaRoutes, resetMedia } from "./mock-media.ts";
import { bumpMenu, MENUS_MODULE, menusRoutes, publicMenu, resetMenus } from "./mock-menus.ts";
import {
  finishLoginCeremony,
  fireEvent,
  resetSettings,
  settingsRoutes,
  startLoginCeremony,
} from "./mock-settings.ts";
import { storefrontRoutes } from "./mock-storefront.ts";
import {
  knownTenant,
  ownClientConfig,
  ownReadOnly,
  ownStatus,
  resetTenants,
  setOwnTenant,
  setTenancy,
  tenancyMode,
  tenantRoutes,
} from "./mock-tenants.ts";

const PORT = Number(process.env.MOCK_CORE_PORT ?? 4010);
const CODE = "123456";
const TOTP_SECRET = "JBSWY3DPEHPK3PXP";

/** Như giá trị mặc định của core (`GET /api/v1/kernel/client-config`; đã đối chiếu với core thật). */
const CLIENT_CONFIG: Schemas["ClientConfigResponse"] = {
  kernel: { version: "0.15.0", public_url: null },
  mail: { from: "Autoxide <noreply@localhost>", sends: false },
  media: {
    max_bytes: 104_857_600,
    allowed_types: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/avif",
      "image/svg+xml",
      "video/mp4",
      "video/webm",
      "audio/*",
      "application/pdf",
    ],
    alt_locales: ["en", "vi"],
    image_widths: [320, 640, 1280, 1920],
    trash_days: 30,
  },
  content: {
    locales: ["en", "vi"],
    default_locale: "en",
    post_path_prefix: "blog",
    embed_hosts: ["youtube.com", "youtu.be", "youtube-nocookie.com", "vimeo.com"],
    max_body_bytes: 524_288,
  },
  menus: { locales: ["en", "vi"], default_locale: "en" },
};

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
    lastSignInAt: null,
    pendingEmail: null,
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
  /** Cách đăng nhập (`sign_in_method` của core). */
  method: string;
  /** Mã quốc gia từ header của proxy; core giả nhận `CF-IPCountry` như cấu hình mẫu của core. */
  country: string | null;
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

function startSession(
  account: Account,
  userAgent: string | null,
  method = "password",
  country: string | null = null,
): Session {
  const now = new Date().toISOString();
  const session = {
    id: randomUUID(),
    account,
    started: now,
    lastActive: now,
    userAgent,
    method,
    country,
  };
  sessions.set(session.id, session);
  account.lastSignInAt = now;
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
    sign_in_method: session.method,
    country: session.country,
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

/** Như bảng AAGUID → tên của core (một phần nhỏ). */
const AUTHENTICATORS: Record<string, string> = {
  "08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello",
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "Apple Passwords",
};

function authenticatorName(aaguid: string | null): string | null {
  return aaguid ? (AUTHENTICATORS[aaguid] ?? null) : null;
}

function mfaStatus(account: Account): Schemas["MfaStatusResponse"] {
  return { totp_enabled: account.mfa, recovery_codes_remaining: account.recoveryCodes.length };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://mock");
  const route = `${request.method} ${url.pathname}`;
  const vi = request.headers["accept-language"] === "vi";
  const userAgent = request.headers["user-agent"] ?? null;
  const countryHeader = request.headers["cf-ipcountry"];
  const country =
    typeof countryHeader === "string" && countryHeader !== "XX" ? countryHeader : null;

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
    resetContent();
    resetMedia();
    resetEngage();
    resetMenus();
    resetFlags();
    resetTenants();
    resetDomains();
    return send(response, 204);
  }
  if (route === "POST /__tenancy") return setTenancy(request, response);
  if (route === "POST /__own-tenant") return setOwnTenant(request, response);
  if (route === "POST /__domains/dns") return setDnsRecord(request, response);
  if (route === "POST /__webhooks/fire") {
    return fireEvent(request, response);
  }
  if (route === "POST /__sessions") {
    const body = await json(request);
    const account = accounts.find((a) => a.email === text(body, "email"));
    if (!account) return problem(response, 404, "not_found", "No such account.");
    const session = startSession(
      account,
      text(body, "user_agent") || null,
      text(body, "method") || "password",
      text(body, "country") || null,
    );
    return send(response, 201, { id: session.id });
  }
  if (route === "POST /__passkeys") {
    // Nạp passkey cho một tài khoản (không qua WebAuthn), để thử màn quản trị gỡ passkey.
    const body = await json(request);
    const account = accounts.find((a) => a.email === text(body, "email"));
    if (!account) return problem(response, 404, "not_found", "No such account.");
    const aaguid = text(body, "aaguid") || null;
    const passkey = {
      id: randomUUID(),
      name: text(body, "name") || "Passkey",
      aaguid,
      authenticator: authenticatorName(aaguid),
      created_at: "2026-11-10T08:00:00Z",
      last_used_at: null,
    } satisfies Schemas["PasskeyResponse"];
    account.passkeys.push(passkey);
    account.credentialIds.push(randomBytes(16).toString("base64url"));
    return send(response, 201, { id: passkey.id });
  }
  if (route === "POST /__no-password") {
    // Giả một tài khoản vào bằng passkey, chưa có mật khẩu (`has_password: false`); core giả vẫn
    // cho đăng nhập bằng mật khẩu cũ để test vào được.
    const body = await json(request);
    const account = accounts.find((a) => a.email === text(body, "email"));
    if (!account) return problem(response, 404, "not_found", "No such account.");
    account.hasPassword = false;
    return send(response, 204);
  }
  if (route === "POST /__ai") {
    setAiEnabled((await json(request)).enabled === true);
    return send(response, 204);
  }
  if (route === "POST /__content/bump") return contentBump(request, response);
  if (route === "POST /__content/pages") return seedPages(response);
  if (route === "POST /__content/legal") return seedLegal(response);
  if (route === "POST /__menus/bump") return bumpMenu(request, response);
  // Menu công khai của website: không cần đăng nhập, như core.
  if (request.method === "GET" && publicMenu(response, url)) return;
  // Nội dung tệp media: khách tải được tệp công khai (trang xem trước), như core.
  if (request.method === "GET" && mediaContent(response, url, caller(request) !== undefined))
    return;
  if (route === "GET /api/v1/content/public/preview") return contentPreview(response, url);
  if (route === "POST /api/v1/auth/login") {
    // Chế độ nhiều khách: đăng nhập phải nêu khách (header hay tên miền), như core (bước 33). Tài
    // khoản giả đều thuộc khách nền tảng (`default`).
    if (tenancyMode() === "multi") {
      const tenant = request.headers["autoxide-tenant"];
      if (typeof tenant !== "string") {
        return problem(
          response,
          400,
          "tenant_required",
          "No customer (tenant) could be told for this request. Send it to the tenant's domain, add the header `Autoxide-Tenant: <slug>`, or sign in.",
        );
      }
      if (!knownTenant(tenant)) {
        return problem(response, 404, "tenant_not_found", `There is no tenant \`${tenant}\`.`);
      }
    }
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
    return send(response, 200, issue(startSession(account, userAgent, "password", country)));
  }
  // Nghi thức đăng nhập bằng passkey: core dùng lại nó để xác nhận lại khi tạo API key (D-272).
  if (route === "POST /api/v1/auth/login/passkey/options") {
    return send(response, 200, { data: startLoginCeremony() });
  }
  // Đăng nhập bằng passkey: passkey nhận ra tài khoản (không cần email), không hỏi thêm mã; như
  // core, nghi thức dùng một lần, passkey lạ → 401 `auth.passkey_sign_in_failed`.
  if (route === "POST /api/v1/auth/login/passkey") {
    const body = await json(request);
    if (!finishLoginCeremony(text(body, "ceremony_id"))) {
      return problem(response, 400, "auth.invalid_passkey_ceremony", "Start again.");
    }
    const credential = body.credential as { id?: unknown } | undefined;
    const owner = accounts.find(
      (a) =>
        !a.deleted && typeof credential?.id === "string" && a.credentialIds.includes(credential.id),
    );
    if (!owner) {
      return problem(
        response,
        401,
        "auth.passkey_sign_in_failed",
        "The passkey is not one of yours, or its answer is not valid.",
      );
    }
    if (owner.disabledAt) {
      return problem(response, 403, "auth.user_disabled", "This account is disabled.");
    }
    return send(response, 200, issue(startSession(owner, userAgent, "passkey", country)));
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
    return send(
      response,
      200,
      issue(startSession(pending.account, pending.userAgent, "password_and_mfa", country)),
    );
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
  // Cấu hình cho giao diện: công khai, như core. Kèm credential thì theo khách của người đó (D-296):
  // giá trị khách tự đặt thay giá trị chung; token sai thì 401 như core.
  if (route === "GET /api/v1/kernel/client-config") {
    if (!request.headers.authorization) return send(response, 200, { data: CLIENT_CONFIG });
    if (!caller(request)) return problem(response, 401, "auth.invalid_token", "Sign in.");
    return send(response, 200, { data: ownClientConfig(CLIENT_CONFIG) });
  }
  // Tài liệu OpenAPI là công khai, như core.
  if (route === "GET /api/v1/openapi.json") {
    return send(response, 200, {
      openapi: "3.1.0",
      info: { title: "Autoxide (mock)", version: "0" },
    });
  }

  // Link tải tệp xuất có chữ ký và hạn riêng, không cần đăng nhập (như core).
  if (
    /^\/api\/v1\/forms\/exports\/[^/]+\/file$/.test(url.pathname) &&
    (await engageRoutes(request, response, url, route))
  ) {
    return;
  }
  // Phần công khai của website: không cần đăng nhập, như core. Cài đặt bình luận công khai dùng
  // chung với màn Bình luận của trang quản trị (`mock-engage.ts`).
  if (route === "GET /api/v1/comments/public/settings") {
    await engageRoutes(request, response, url, route);
    return;
  }
  if (await storefrontRoutes(request, response, url, route)) return;
  const session = caller(request);
  if (!session) {
    return problem(response, 401, "auth.invalid_token", "Sign in.");
  }
  const account = session.account;
  // Khách bị tạm khoá hay đang bảo trì: mọi route bị từ chối, như `ensure_serving` của core.
  if (ownStatus() === "suspended") {
    return problem(
      response,
      403,
      "tenant_suspended",
      "This tenant is suspended. Contact the service provider.",
    );
  }
  if (ownStatus() === "maintenance") {
    response.setHeader("Retry-After", "30");
    return problem(
      response,
      503,
      "tenant_maintenance",
      "The data of this tenant is under maintenance. Retry in 30 seconds.",
    );
  }
  // Khách của người đăng nhập chỉ đọc (D-296): mọi lệnh ghi bị từ chối, như `ensure_writable` của
  // core (đăng nhập, refresh, đăng xuất đã trả lời ở trên).
  if (ownReadOnly() && !["GET", "HEAD", "OPTIONS"].includes(request.method ?? "GET")) {
    return problem(
      response,
      403,
      "tenant_read_only",
      "This tenant is read-only for now: its data can be read and exported, but not changed. Contact the service provider.",
    );
  }
  if (route === "GET /api/v1/auth/me") {
    return send(response, 200, {
      data: {
        id: account.id,
        email: account.email,
        name: account.name,
        email_verified_at: account.verified ? "2026-11-13T08:00:00Z" : null,
        all_permissions: account.canReadModules,
        permissions: [],
        has_password: account.hasPassword,
        pending_email: account.pendingEmail,
        created_at: "2026-11-12T00:00:00Z",
      } satisfies Me,
    });
  }
  if (route === "GET /api/v1/me/permissions") {
    // Admin có mọi permission: cả sổ; người khác: những gì role của họ cho (ở đây không có).
    const mine = account.canReadModules ? PERMISSION_CATALOG : [];
    return send(response, 200, { data: mine } satisfies Schemas["Data_Vec_MyPermission"]);
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
  if (await flagRoutes(request, response, url, account)) return;
  if (await tenantRoutes(request, response, url, account)) return;
  if (await domainRoutes(request, response, url, account)) return;
  if (await settingsRoutes(request, response, url, account, () => accounts)) return;
  if (await engageRoutes(request, response, url, route)) return;
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
      const listed = [KERNEL, NOTES, CONTENT_MODULE, MENUS_MODULE, ...ENGAGE_MODULES].map(
        (module) => ({
          ...module,
          migrations: module.migrations.map((m) => ({ ...m, applied: null })),
        }),
      );
      return send(response, 200, { data: listed });
    }
    const name = decodeURIComponent(url.pathname.slice("/api/v1/kernel/modules/".length));
    const module = [KERNEL, NOTES, CONTENT_MODULE, MENUS_MODULE, ...ENGAGE_MODULES].find(
      (m) => m.name === name,
    );
    if (!module) {
      return problem(response, 404, "kernel.module_not_found", `No module named \`${name}\`.`);
    }
    return send(response, 200, { data: module });
  }
  if (url.pathname === "/api/v1/menus" || url.pathname.startsWith("/api/v1/menus/")) {
    return menusRoutes(request, response, url, route, caller(request)?.account.id ?? null);
  }
  if (url.pathname === "/api/v1/media" || url.pathname.startsWith("/api/v1/media/")) {
    return mediaRoutes(request, response, url, route);
  }
  if (url.pathname.startsWith("/api/v1/content/") || route === "GET /api/v1/ai/status") {
    return contentRoutes(request, response, url, route);
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
    return send(response, 200, issue(startSession(account, userAgent, "password_change")));
  }
  if (route === "POST /api/v1/auth/me/email") {
    if (!passwordOk()) return wrongPassword(response);
    const email = text(body, "new_email").trim().toLowerCase();
    if (accounts.some((a) => a.email === email && a !== account)) {
      return problem(response, 409, "auth.email_taken", "Another account has this email.");
    }
    account.pendingEmail = {
      email,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    };
    return empty(response, 202);
  }
  if (route === "DELETE /api/v1/auth/me/email") {
    if (!account.pendingEmail) {
      return problem(
        response,
        404,
        "auth.no_pending_email_change",
        "No email change is waiting to be confirmed.",
      );
    }
    account.pendingEmail = null;
    return empty(response, 204);
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
      // Authenticator ảo của Chromium (test) không khai AAGUID: core trả `null` cho cả hai.
      aaguid: null,
      authenticator: null,
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
