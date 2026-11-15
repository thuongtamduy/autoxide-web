// Core giả cho test e2e: đủ các endpoint trang quản trị gọi, theo đúng hình dạng của
// `openapi.json`. Chạy: `node e2e/mock-core.ts` (Node tự bỏ kiểu TypeScript).
//
// Tài khoản:
// - admin@example.com / admin password — có mọi permission;
// - viewer@example.com / viewer password — thiếu `kernel.modules.read`;
// - mfa@example.com / mfa password — cần mã 123456 ở bước hai.
//
// Mã của app xác thực luôn là 123456. Access token chỉ sống 31 giây (cookie của trang quản trị
// hết sau 1 giây), để test đi qua đường làm mới token. `GET /__stats` trả số lần làm mới;
// `POST /__reset` đưa mọi thứ về ban đầu (tài khoản, phiên, passkey, xác thực hai bước);
// `POST /__sessions` thêm một phiên như khi đăng nhập ở thiết bị khác.
// Màn Nội dung: xem khối "Nội dung" ở cuối file.

import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { components, Me, ModuleInfo } from "@autoxide/sdk";
import { KERNEL, NOTES } from "../src/test/fixtures.ts";

type Schemas = components["schemas"];

const PORT = Number(process.env.MOCK_CORE_PORT ?? 4010);
const CODE = "123456";
const TOTP_SECRET = "JBSWY3DPEHPK3PXP";

type Account = {
  id: string;
  email: string;
  name: string;
  password: string;
  canReadModules: boolean;
  mfa: boolean;
  recoveryCodes: string[];
  totpPending: boolean;
  verified: boolean;
  passkeys: Schemas["PasskeyResponse"][];
  credentialIds: string[];
  deleted: boolean;
};

function seed(): Account[] {
  const make = (email: string, password: string, canReadModules: boolean, mfa: boolean) => ({
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

function send(response: ServerResponse, status: number, body?: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

function empty(response: ServerResponse, status: 202 | 204) {
  response.writeHead(status);
  response.end();
}

function problem(
  response: ServerResponse,
  status: number,
  code: string,
  detail: string,
  errors?: Schemas["ProblemField"][],
) {
  send(response, status, {
    type: "about:blank",
    title: "Error",
    status,
    code,
    detail,
    ...(errors ? { errors } : {}),
  } satisfies Schemas["Problem"]);
}

function wrongPassword(response: ServerResponse) {
  problem(response, 400, "auth.wrong_password", "The current password is incorrect.");
}

function wrongCode(response: ServerResponse) {
  problem(response, 422, "validation_failed", "The request has invalid fields.", [
    { field: "code", code: "invalid", detail: "is not a current code from your app" },
  ]);
}

async function json(request: IncomingMessage): Promise<Record<string, unknown>> {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
  }
  return text ? JSON.parse(text) : {};
}

function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

function caller(request: IncomingMessage): Session | undefined {
  const token = request.headers.authorization?.replace(/^Bearer /, "");
  const session = token ? access.get(token) : undefined;
  return session && !session.account.deleted ? session : undefined;
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
    resetContent();
    return send(response, 204);
  }
  if (route === "POST /__sessions") {
    const body = await json(request);
    const account = accounts.find((a) => a.email === text(body, "email"));
    if (!account) return problem(response, 404, "not_found", "No such account.");
    const session = startSession(account, text(body, "user_agent") || null);
    return send(response, 201, { id: session.id });
  }
  if (route === "POST /__content/bump") return contentBump(request, response);
  if (route === "GET /api/v1/content/public/preview") return contentPreview(response, url);
  if (route === "POST /api/v1/auth/login") {
    const body = await json(request);
    const account = accounts.find(
      (a) => !a.deleted && a.email === body.email && a.password === body.password,
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
      const listed = [KERNEL, NOTES, CONTENT_MODULE].map((module) => ({
        ...module,
        migrations: module.migrations.map((m) => ({ ...m, applied: null })),
      }));
      return send(response, 200, { data: listed });
    }
    const name = decodeURIComponent(url.pathname.slice("/api/v1/kernel/modules/".length));
    const module = [KERNEL, NOTES, CONTENT_MODULE].find((m) => m.name === name);
    if (!module) {
      return problem(response, 404, "kernel.module_not_found", `No module named \`${name}\`.`);
    }
    return send(response, 200, { data: module });
  }
  if (url.pathname.startsWith("/api/v1/content/") || route === "GET /api/v1/ai/status") {
    return content(request, response, url, route);
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

// ================================================================ Nội dung (màn Bài viết)
// Khối của màn Nội dung: bài viết và trang, phiên bản (ETag / If-Match), đăng, gỡ, lưu trữ,
// gửi duyệt, lịch, phiên bản cũ, danh mục, tác giả, bản dịch, kiểm SEO, link xem trước. AI tắt
// (`GET /api/v1/ai/status` báo `enabled: false`), như core chưa cấu hình AI.
// `POST /__content/bump` (`{"id"}`) sửa một bài như có người khác sửa, để thử xung đột 412.

type MockEntry = Schemas["EntryResponse"] & { version: number };

const CONTENT_MODULE: ModuleInfo = {
  name: "content",
  internal: false,
  position: 3,
  permissions: [
    { name: "content.read", description: "Read drafts." },
    { name: "content.write", description: "Write drafts." },
    { name: "content.publish", description: "Publish." },
  ],
  events: [],
  subscriptions: [],
  jobs: [],
  schedules: [],
  tools: [],
  deprecations: [],
  languages: ["vi"],
  migrations: [{ name: "m0001_create_entries", applied: true }],
};

const CONTENT_AUTHORS: Schemas["AuthorResponse"][] = [
  {
    id: "01a1dd85-f609-701b-9e7f-d6e1e13e56d9",
    user_id: null,
    display_name: "Minh Anh",
    slug: "minh-anh",
    bio: "",
    avatar_media_id: null,
    website_url: "",
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  },
];

const CONTENT_TERMS: Schemas["TermResponse"][] = [
  {
    id: "01a1dd85-f5c7-77d6-b517-807884ba3e01",
    taxonomy: "category",
    parent_id: null,
    names: [
      {
        locale: "vi",
        name: "Chọn mua",
        slug: "chon-mua",
        description: "",
        meta_title: "",
        meta_description: "",
      },
    ],
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  },
];

let contentEntries: MockEntry[] = [];
let contentRevisions: Schemas["RevisionResponse"][] = [];
let contentSchedules: Schemas["ScheduleResponse"][] = [];
const previewTokens = new Map<string, string>();
let contentClock = Date.parse("2026-11-15T00:00:00Z");

/** Mỗi lần ghi một thời điểm mới (tăng 1 giây), để thứ tự "mới sửa trước" ổn định. */
function contentNow(): string {
  contentClock += 1000;
  return new Date(contentClock).toISOString();
}

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function newEntry(fields: Partial<MockEntry> & { title: string }): MockEntry {
  const id = randomUUID();
  const now = contentNow();
  return {
    id,
    kind: "post",
    locale: "vi",
    translation_group_id: id,
    parent_id: null,
    status: "draft",
    has_unpublished_changes: false,
    slug: slugify(fields.title),
    excerpt: "",
    body: { type: "doc", content: [] },
    body_schema_version: 1,
    word_count: 0,
    reading_time_minutes: 0,
    featured_media_id: null,
    featured_media_alt: "",
    meta_title: "",
    meta_description: "",
    og_media_id: null,
    canonical_url: "",
    noindex: false,
    ai_generated: false,
    review_requested_at: null,
    review_requested_by: null,
    translated_from_revision_id: null,
    translation_outdated: false,
    created_by: null,
    created_via: "session",
    created_at: now,
    updated_at: now,
    term_ids: [],
    author_ids: [],
    version: 1,
    ...fields,
  };
}

function keepRevision(entry: MockEntry, reason: string) {
  contentRevisions.unshift({
    id: randomUUID(),
    entry_id: entry.id,
    reason,
    created_by: null,
    created_at: contentNow(),
    // `openapi.json` mô tả `snapshot` là object tự do (kiểu sinh ra không ghi được trường nào),
    // nên ép kiểu.
    snapshot: {
      title: entry.title,
      slug: entry.slug,
      excerpt: entry.excerpt,
      body: entry.body,
    } as unknown as Record<string, never>,
  });
}

function resetContent() {
  contentClock = Date.parse("2026-11-15T00:00:00Z");
  contentRevisions = [];
  contentSchedules = [];
  previewTokens.clear();
  contentEntries = [
    newEntry({
      title: "Vệ sinh thớt gỗ đúng cách",
      status: "published",
      excerpt: "Ba bước sau mỗi lần dùng.",
      author_ids: [CONTENT_AUTHORS[0]?.id ?? ""],
    }),
    newEntry({ title: "Bảo quản dao bếp", review_requested_at: "2026-11-14T08:00:00Z" }),
  ];
  for (const entry of contentEntries) keepRevision(entry, "initial");
}
resetContent();

function view(entry: MockEntry): Schemas["EntryResponse"] {
  const { version: _version, ...rest } = entry;
  return rest;
}

function sendEntry(response: ServerResponse, status: number, entry: MockEntry) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    ETag: `"${entry.version}"`,
    ...(status === 201 ? { Location: `/api/v1/content/entries/${entry.id}` } : {}),
  });
  response.end(JSON.stringify({ data: view(entry) }));
}

/** Như core: thiếu `If-Match` là 428, khác phiên bản là 412; `*` luôn khớp. */
function versionOk(request: IncomingMessage, response: ServerResponse, entry: MockEntry): boolean {
  const ifMatch = request.headers["if-match"];
  if (!ifMatch) {
    problem(response, 428, "precondition_required", "Send the ETag you read in If-Match.");
    return false;
  }
  if (ifMatch !== "*" && ifMatch !== `"${entry.version}"`) {
    problem(
      response,
      412,
      "precondition_failed",
      "The record changed since you read it (its `ETag` is different).",
    );
    return false;
  }
  return true;
}

function touch(entry: MockEntry) {
  entry.version += 1;
  entry.updated_at = contentNow();
}

/** Ô của bản nháp: kiểm như core những gì test cần (tiêu đề, slug trùng, link không an toàn). */
function applyFields(
  response: ServerResponse,
  entry: MockEntry,
  body: Record<string, unknown>,
  creating: boolean,
): boolean {
  const errors: Schemas["ProblemField"][] = [];
  if (body.title !== undefined || creating) {
    const title = text(body, "title").trim();
    if (title.length < 1 || title.length > 300) {
      errors.push({ field: "title", code: "length", detail: "must be 1 to 300 characters" });
    }
  }
  if (JSON.stringify(body.body ?? null).includes("javascript:")) {
    errors.push({
      field: "body.content[0].content[0].marks[0].attrs.href",
      code: "unsafe_link",
      detail: "must start with `http://`, `https://`, `mailto:` or `/`",
    });
  }
  if (errors.length > 0) {
    problem(response, 422, "validation_failed", "The request has invalid fields.", errors);
    return false;
  }
  const title = body.title === undefined ? entry.title : text(body, "title").trim();
  const slug =
    body.slug === undefined
      ? entry.slug
      : text(body, "slug").trim() === ""
        ? slugify(title)
        : text(body, "slug").trim();
  const taken = contentEntries.some(
    (other) =>
      other.id !== entry.id &&
      other.slug === slug &&
      other.kind === entry.kind &&
      other.locale === entry.locale,
  );
  if (taken) {
    problem(response, 409, "content.slug_taken", "Another entry has this slug.");
    return false;
  }
  entry.title = title;
  entry.slug = slug;
  for (const key of ["excerpt", "meta_title", "meta_description", "canonical_url"] as const) {
    if (typeof body[key] === "string") entry[key] = body[key];
  }
  if (typeof body.noindex === "boolean") entry.noindex = body.noindex;
  if (typeof body.ai_generated === "boolean") entry.ai_generated = body.ai_generated;
  if (body.body && typeof body.body === "object") {
    entry.body = body.body as Schemas["BodyNode"];
    const words = JSON.stringify(entry.body).match(/"text":"([^"]*)"/g) ?? [];
    entry.word_count = words.join(" ").split(/\s+/).length - words.length;
    entry.reading_time_minutes = entry.word_count > 0 ? 1 : 0;
  }
  if (entry.status === "published") entry.has_unpublished_changes = true;
  return true;
}

/** `GET /api/v1/content/public/preview?token=`: không cần đăng nhập. */
function contentPreview(response: ServerResponse, url: URL) {
  const id = previewTokens.get(url.searchParams.get("token") ?? "");
  const entry = contentEntries.find((e) => e.id === id);
  if (!entry) {
    return problem(response, 404, "content.preview_token_invalid", "The link is not valid.");
  }
  const { created_by, created_via, review_requested_at, review_requested_by, ...rest } =
    view(entry);
  void [created_by, created_via, review_requested_at, review_requested_by];
  return send(response, 200, { data: rest satisfies Schemas["PreviewEntryResponse"] });
}

async function content(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  route: string,
): Promise<void> {
  const body = request.method === "GET" || request.method === "DELETE" ? {} : await json(request);
  const P = "/api/v1/content";
  if (route === "GET /api/v1/ai/status") {
    return send(response, 200, {
      data: {
        enabled: false,
        provider: "",
        model: "",
        images: false,
        embeddings_enabled: false,
        embedding_model: "",
        embedding_dimensions: 0,
        tokens_today: 0,
        daily_token_limit: 0,
      } satisfies Schemas["AiStatus"],
    });
  }
  if (route === `GET ${P}/authors`) {
    return send(response, 200, {
      data: CONTENT_AUTHORS,
      pagination: { limit: 50, next_cursor: null },
    } satisfies Schemas["Page_AuthorResponse"]);
  }
  if (route === `GET ${P}/terms`) {
    return send(response, 200, {
      data: CONTENT_TERMS,
      pagination: { limit: 50, next_cursor: null },
    } satisfies Schemas["Page_TermResponse"]);
  }
  if (route === `GET ${P}/entries`) {
    const q = url.searchParams;
    const fold = (value: string) => slugify(value).replace(/-/g, " ");
    const matches = contentEntries
      .filter((e) => !q.get("status") || e.status === q.get("status"))
      .filter((e) => !q.get("kind") || e.kind === q.get("kind"))
      .filter((e) => !q.get("locale") || e.locale === q.get("locale"))
      .filter(
        (e) =>
          !q.get("translation_group_id") ||
          e.translation_group_id === q.get("translation_group_id"),
      )
      .filter(
        (e) => !q.get("q") || fold(`${e.title} ${e.excerpt}`).includes(fold(q.get("q") ?? "")),
      )
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const limit = Number(q.get("limit") ?? 50);
    const start = Number(q.get("cursor") ?? 0);
    const page = matches.slice(start, start + limit);
    const next = start + limit < matches.length ? String(start + limit) : null;
    return send(response, 200, {
      data: page.map(view),
      pagination: { limit, next_cursor: next },
    } satisfies Schemas["Page_EntryResponse"]);
  }
  if (route === `POST ${P}/entries`) {
    const kind = body.kind === "page" ? "page" : "post";
    const entry = newEntry({ title: "", kind, locale: text(body, "locale") || "en" });
    if (!applyFields(response, entry, body, true)) return;
    entry.has_unpublished_changes = false;
    contentEntries.push(entry);
    keepRevision(entry, "initial");
    return sendEntry(response, 201, entry);
  }
  const schedule = url.pathname.match(/^\/api\/v1\/content\/schedules\/([^/]+)$/);
  if (schedule && request.method === "DELETE") {
    const found = contentSchedules.find((s) => s.id === schedule[1]);
    if (!found) return problem(response, 404, "content.schedule_not_found", "No schedule.");
    found.status = "canceled";
    return send(response, 200, { data: found });
  }
  const match = url.pathname.match(/^\/api\/v1\/content\/entries\/([^/]+)(\/.*)?$/);
  const entry = contentEntries.find((e) => e.id === match?.[1]);
  if (!match || !entry) {
    return problem(response, 404, "content.not_found", "No entry has this id.");
  }
  const tail = `${request.method} ${match[2] ?? ""}`;
  switch (tail) {
    case "GET ":
      return sendEntry(response, 200, entry);
    case "PATCH ": {
      if (!versionOk(request, response, entry)) return;
      if (!applyFields(response, entry, body, false)) return;
      touch(entry);
      return sendEntry(response, 200, entry);
    }
    case "POST /publish": {
      if (!versionOk(request, response, entry)) return;
      entry.status = "published";
      entry.has_unpublished_changes = false;
      entry.review_requested_at = null;
      touch(entry);
      keepRevision(entry, "published");
      return sendEntry(response, 200, entry);
    }
    case "POST /unpublish":
    case "POST /archive": {
      if (!versionOk(request, response, entry)) return;
      if (tail === "POST /unpublish" && entry.status !== "published") {
        return problem(response, 409, "content.not_published", "It is not published.");
      }
      entry.status = tail === "POST /archive" ? "archived" : "draft";
      entry.has_unpublished_changes = false;
      touch(entry);
      keepRevision(entry, "unpublished");
      return sendEntry(response, 200, entry);
    }
    case "POST /request-review":
    case "DELETE /request-review": {
      if (!versionOk(request, response, entry)) return;
      entry.review_requested_at = request.method === "POST" ? contentNow() : null;
      touch(entry);
      return sendEntry(response, 200, entry);
    }
    case "GET /revisions":
      return send(response, 200, {
        data: contentRevisions
          .filter((r) => r.entry_id === entry.id)
          .map(({ snapshot: _snapshot, ...rest }) => rest),
        pagination: { limit: 30, next_cursor: null },
      } satisfies Schemas["Page_RevisionResponse"]);
    case "GET /schedules":
      return send(response, 200, {
        data: contentSchedules.filter((s) => s.entry_id === entry.id),
      } satisfies Schemas["Data_Vec_ScheduleResponse"]);
    case "POST /schedules": {
      if (!versionOk(request, response, entry)) return;
      const runAt = text(body, "run_at");
      if (!(Date.parse(runAt) > Date.now())) {
        return problem(response, 422, "validation_failed", "The request has invalid fields.", [
          { field: "run_at", code: "schedule_in_past", detail: "must be in the future" },
        ]);
      }
      const created = {
        id: randomUUID(),
        entry_id: entry.id,
        action: body.action === "unpublish" ? "unpublish" : "publish",
        revision_id: null,
        run_at: runAt,
        status: "scheduled",
        error_code: null,
        created_by: null,
        created_at: contentNow(),
        updated_at: contentNow(),
      } satisfies Schemas["ScheduleResponse"];
      contentSchedules.unshift(created);
      return send(response, 201, { data: created });
    }
    case "GET /seo-check": {
      const findings: Schemas["SeoFinding"][] = [];
      if (!entry.meta_title) {
        findings.push({
          code: "seo.meta_title_missing",
          level: "warning",
          field: "meta_title",
          message: "no title for search engines: the title is used",
        });
      }
      if (!entry.excerpt) {
        findings.push({
          code: "seo.excerpt_missing",
          level: "warning",
          field: "excerpt",
          message: "no summary",
        });
      }
      return send(response, 200, { data: { findings } satisfies Schemas["SeoReport"] });
    }
    case "POST /seo-suggestions":
    case "POST /translate":
      return problem(response, 503, "ai.disabled", "AI features are off on this server.");
    case "GET /translation-requests":
      return send(response, 200, {
        data: [],
        pagination: { limit: 10, next_cursor: null },
      } satisfies Schemas["Page_TranslationRequestResponse"]);
    case "POST /preview-token": {
      const token = randomBytes(16).toString("base64url");
      previewTokens.set(token, entry.id);
      return send(response, 200, {
        data: {
          token,
          expires_at: new Date(Date.now() + 600_000).toISOString(),
        } satisfies Schemas["PreviewToken"],
      });
    }
    case "PUT /terms":
      entry.term_ids = Array.isArray(body.term_ids) ? body.term_ids.map(String) : [];
      return send(response, 200, { data: { term_ids: entry.term_ids } });
    case "PUT /authors":
      entry.author_ids = Array.isArray(body.author_ids) ? body.author_ids.map(String) : [];
      return send(response, 200, { data: { author_ids: entry.author_ids } });
    case "POST /translations": {
      const locale = text(body, "locale");
      if (
        contentEntries.some(
          (e) => e.translation_group_id === entry.translation_group_id && e.locale === locale,
        )
      ) {
        return problem(response, 409, "content.translation_exists", "A translation exists.");
      }
      const translation = newEntry({
        title: text(body, "title") || entry.title,
        locale,
        kind: entry.kind,
        translation_group_id: entry.translation_group_id,
        body: entry.body,
      });
      contentEntries.push(translation);
      keepRevision(translation, "initial");
      return sendEntry(response, 201, translation);
    }
  }
  const restore = (match[2] ?? "").match(/^\/revisions\/([^/]+)\/restore$/);
  if (restore && request.method === "POST") {
    if (!versionOk(request, response, entry)) return;
    const revision = contentRevisions.find((r) => r.id === restore[1] && r.entry_id === entry.id);
    if (!revision) return problem(response, 404, "content.revision_not_found", "No revision.");
    const snapshot = (revision.snapshot ?? {}) as Partial<MockEntry>;
    Object.assign(entry, {
      title: snapshot.title ?? entry.title,
      slug: snapshot.slug ?? entry.slug,
      excerpt: snapshot.excerpt ?? entry.excerpt,
      body: snapshot.body ?? entry.body,
    });
    if (entry.status === "published") entry.has_unpublished_changes = true;
    touch(entry);
    keepRevision(entry, "restored");
    return sendEntry(response, 200, entry);
  }
  return problem(response, 404, "not_found", "No such route in the mock core.");
}

/** `POST /__content/bump`: sửa một bài như có người khác vừa sửa (thử xung đột 412). */
async function contentBump(request: IncomingMessage, response: ServerResponse) {
  const body = await json(request);
  const entry = contentEntries.find((e) => e.id === text(body, "id"));
  if (!entry) return problem(response, 404, "content.not_found", "No entry has this id.");
  entry.excerpt = "Changed elsewhere.";
  touch(entry);
  return send(response, 200, { data: view(entry) });
}

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`mock core on http://127.0.0.1:${PORT}\n`);
});
