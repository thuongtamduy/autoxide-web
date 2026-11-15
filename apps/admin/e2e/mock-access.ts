// Phần quản trị người dùng, role và các endpoint công khai của link trong thư, cho core giả.
// Hình dạng theo `openapi.json` (`satisfies` kiểu của SDK). Luật như core:
// - quản trị viên cuối cùng không bị khoá, mất role admin hay bị xoá (`auth.last_admin`);
// - role dựng sẵn `admin` không sửa, không xoá (`auth.role_builtin`);
// - chỉ đặt được mật khẩu đầu tiên (`auth.password_already_set`);
// - đọc một bản ghi trả `ETag`; gửi `If-Match` cũ thì 412 (`precondition_failed`).
//
// Token mẫu trong thư: `verify-ok` (xác minh email của viewer@example.com, dùng một lần),
// `reset-ok` (đặt lại mật khẩu của viewer@example.com, dùng một lần).
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { type Account, empty, json, problem, type Schemas, send, text } from "./mock-http.ts";

export const ADMIN_ROLE = "01a1e000-0000-7000-8000-00000000ad01";
const EDITOR_ROLE = "01a1e000-0000-7000-8000-00000000ed01";

const CATALOG: Schemas["PermissionResponse"][] = [
  { name: "auth.roles.manage", description: "Create, change and delete roles." },
  { name: "auth.roles.read", description: "See roles." },
  { name: "auth.users.manage", description: "Create and change user accounts." },
  { name: "auth.users.read", description: "See user accounts." },
  { name: "kernel.modules.read", description: "See the installed modules." },
  { name: "notes.read", description: "Read notes." },
  { name: "notes.write", description: "Write notes." },
];

type Role = Schemas["RoleResponse"];

function seedRoles(): Role[] {
  return [
    {
      id: ADMIN_ROLE,
      name: "admin",
      description: "Every permission, including permissions added later.",
      all_permissions: true,
      permissions: [],
      created_at: "2026-11-12T00:00:00Z",
      updated_at: "2026-11-12T00:00:00Z",
    },
    {
      id: EDITOR_ROLE,
      name: "editor",
      description: "Writes notes.",
      all_permissions: false,
      permissions: ["notes.read", "notes.write"],
      created_at: "2026-11-12T01:00:00Z",
      updated_at: "2026-11-12T01:00:00Z",
    },
  ];
}

let roles = seedRoles();
const usedTokens = new Set<string>();
/** Email đã xin thư đặt lại (test kiểm trang "Quên mật khẩu?" có gọi core). */
export const resetRequests: string[] = [];

export function resetAccess() {
  roles = seedRoles();
  usedTokens.clear();
  resetRequests.length = 0;
}

function userView(account: Account): Schemas["UserResponse"] {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    disabled_at: account.disabledAt,
    email_verified_at: account.verified ? "2026-11-13T08:00:00Z" : null,
    created_at: account.createdAt,
    updated_at: account.updatedAt,
  };
}

const etagOf = (stamp: string) => `"${Date.parse(stamp)}"`;

function stale(request: IncomingMessage, stamp: string): boolean {
  const match = request.headers["if-match"];
  return typeof match === "string" && match !== etagOf(stamp);
}

function preconditionFailed(response: ServerResponse) {
  problem(response, 412, "precondition_failed", "The record changed since you read it.");
}

function rolesOf(account: Account): Role[] {
  return roles
    .filter((role) => account.roleIds.includes(role.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Còn ai khác (đang dùng) giữ role admin ngoài `except`. */
function otherAdmin(accounts: Account[], except: Account): boolean {
  return accounts.some(
    (a) => a !== except && !a.deleted && !a.disabledAt && a.roleIds.includes(ADMIN_ROLE),
  );
}

function lastAdmin(response: ServerResponse) {
  problem(
    response,
    409,
    "auth.last_admin",
    "This change would leave no active user with the `admin` role.",
  );
}

const ROLE_NAME = /^[a-z][a-z0-9_-]*$/;

function roleInput(body: Record<string, unknown>): {
  errors: Schemas["ProblemField"][];
  name: string;
  description: string;
  permissions: string[];
} {
  const name = text(body, "name");
  const permissions = Array.isArray(body.permissions) ? body.permissions.map(String) : [];
  const errors: Schemas["ProblemField"][] = [];
  if (!ROLE_NAME.test(name)) {
    errors.push({ field: "name", code: "format", detail: "must be lowercase letters and digits" });
  }
  const unknown = permissions.filter((p) => !CATALOG.some((c) => c.name === p));
  if (unknown.length > 0) {
    errors.push({
      field: "permissions",
      code: "unknown",
      detail: `unknown: ${unknown.join(", ")}`,
    });
  }
  return { errors, name, description: text(body, "description"), permissions };
}

function page<T extends { id: string }>(
  items: T[],
  url: URL,
): { data: T[]; pagination: Schemas["Pagination"] } {
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const cursor = url.searchParams.get("cursor");
  const start = cursor ? items.findIndex((i) => i.id === cursor) + 1 : 0;
  const data = items.slice(start, start + limit);
  return {
    data,
    pagination: {
      limit,
      next_cursor: start + limit < items.length ? (data.at(-1)?.id ?? null) : null,
    },
  };
}

/** Endpoint công khai của link trong thư. Trả `true` khi đã trả lời. */
export async function publicRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  route: string,
  accounts: () => Account[],
): Promise<boolean> {
  if (route === "POST /api/v1/auth/email-verification/confirm") {
    const token = text(await json(request), "token");
    const account = accounts().find((a) => a.email === "viewer@example.com");
    if (token !== "verify-ok" || usedTokens.has(token) || !account) {
      problem(
        response,
        400,
        "auth.invalid_verification_token",
        "The email-verification token is unknown, expired or already used.",
      );
      return true;
    }
    usedTokens.add(token);
    account.verified = true;
    send(response, 200, { data: userView(account) } satisfies Schemas["Data_UserResponse"]);
    return true;
  }
  if (route === "POST /api/v1/auth/password-reset") {
    resetRequests.push(text(await json(request), "email"));
    empty(response, 202);
    return true;
  }
  if (route === "POST /api/v1/auth/password-reset/confirm") {
    const body = await json(request);
    const token = text(body, "token");
    const account = accounts().find((a) => a.email === "viewer@example.com");
    if (token !== "reset-ok" || usedTokens.has(token) || !account) {
      problem(
        response,
        400,
        "auth.invalid_reset_token",
        "The reset token is unknown, expired or used.",
      );
      return true;
    }
    const password = text(body, "password");
    if (password.length < 12 || password.length > 128) {
      problem(response, 422, "validation_failed", "The request has invalid fields.", [
        { field: "password", code: "length", detail: "must be between 12 and 128 characters long" },
      ]);
      return true;
    }
    usedTokens.add(token);
    account.password = password;
    empty(response, 204);
    return true;
  }
  if (route === "GET /__resets") {
    send(response, 200, { emails: resetRequests });
    return true;
  }
  return false;
}

/** `/api/v1/auth/users…`, `/roles…`, `/permissions`. Trả `true` khi đã trả lời. */
export async function accessRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  accounts: () => Account[],
  addAccount: (account: Account) => void,
  endSessionsOf: (account: Account) => number,
): Promise<boolean> {
  const path = url.pathname;
  const method = request.method ?? "GET";
  if (!path.startsWith("/api/v1/auth/users") && !path.startsWith("/api/v1/auth/roles")) {
    if (method === "GET" && path === "/api/v1/auth/permissions") {
      send(response, 200, { data: CATALOG } satisfies Schemas["Data_Vec_PermissionResponse"]);
      return true;
    }
    return false;
  }
  const body = method === "GET" || method === "DELETE" ? {} : await json(request);
  const live = () => accounts().filter((a) => !a.deleted);

  // ------------------------------------------------------------ Người dùng
  if (path === "/api/v1/auth/users") {
    if (method === "GET") {
      const search = (url.searchParams.get("search") ?? "").toLowerCase();
      const list = live()
        .filter((a) => !search || a.email.includes(search) || a.name.toLowerCase().includes(search))
        .reverse()
        .map(userView);
      send(response, 200, page(list, url) satisfies Schemas["Page_UserResponse"]);
      return true;
    }
    const email = text(body, "email").trim().toLowerCase();
    const name = text(body, "name").trim();
    const password = text(body, "password");
    const errors: Schemas["ProblemField"][] = [];
    if (!email.includes("@")) {
      errors.push({ field: "email", code: "email", detail: "is not an email address" });
    }
    if (!name) errors.push({ field: "name", code: "length", detail: "must not be empty" });
    if (password && password.length < 12) {
      errors.push({
        field: "password",
        code: "length",
        detail: "must be between 12 and 128 characters long",
      });
    }
    if (errors.length > 0) {
      problem(response, 422, "validation_failed", "The request has invalid fields.", errors);
      return true;
    }
    if (live().some((a) => a.email === email)) {
      problem(response, 409, "auth.email_taken", "An account has this email.");
      return true;
    }
    const now = new Date().toISOString();
    const account: Account = {
      id: randomUUID(),
      email,
      name,
      password,
      canReadModules: false,
      mfa: false,
      recoveryCodes: [],
      totpPending: false,
      verified: false,
      passkeys: [],
      credentialIds: [],
      deleted: false,
      disabledAt: null,
      roleIds: [],
      hasPassword: Boolean(password),
      createdAt: now,
      updatedAt: now,
    };
    addAccount(account);
    response.setHeader("Location", `/api/v1/auth/users/${account.id}`);
    send(response, 201, { data: userView(account) } satisfies Schemas["Data_UserResponse"]);
    return true;
  }
  const user = /^\/api\/v1\/auth\/users\/([^/]+)(\/[a-z]+)?$/.exec(path);
  if (user) {
    const account = live().find((a) => a.id === user[1]);
    const tail = user[2] ?? "";
    if (!account) {
      problem(response, 404, "auth.user_not_found", "No user has this id.");
      return true;
    }
    const touch = () => {
      account.updatedAt = new Date(
        Math.max(Date.now(), Date.parse(account.updatedAt) + 1),
      ).toISOString();
    };
    if (tail === "" && method === "GET") {
      response.setHeader("ETag", etagOf(account.updatedAt));
      send(response, 200, { data: userView(account) } satisfies Schemas["Data_UserResponse"]);
      return true;
    }
    if (tail === "" && method === "PATCH") {
      if (stale(request, account.updatedAt)) {
        preconditionFailed(response);
        return true;
      }
      if (
        body.disabled === true &&
        account.roleIds.includes(ADMIN_ROLE) &&
        !otherAdmin(accounts(), account)
      ) {
        lastAdmin(response);
        return true;
      }
      if (typeof body.name === "string") {
        if (!body.name.trim()) {
          problem(response, 422, "validation_failed", "The request has invalid fields.", [
            { field: "name", code: "length", detail: "must not be empty" },
          ]);
          return true;
        }
        account.name = body.name.trim();
      }
      if (typeof body.disabled === "boolean") {
        account.disabledAt = body.disabled ? new Date().toISOString() : null;
        if (body.disabled) endSessionsOf(account);
      }
      touch();
      send(response, 200, { data: userView(account) } satisfies Schemas["Data_UserResponse"]);
      return true;
    }
    if (tail === "" && method === "DELETE") {
      if (account.roleIds.includes(ADMIN_ROLE) && !otherAdmin(accounts(), account)) {
        lastAdmin(response);
        return true;
      }
      account.deleted = true;
      endSessionsOf(account);
      empty(response, 204);
      return true;
    }
    if (tail === "/password" && method === "PUT") {
      if (account.hasPassword) {
        problem(response, 409, "auth.password_already_set", "This account already has a password.");
        return true;
      }
      const password = text(body, "password");
      if (password.length < 12) {
        problem(response, 422, "validation_failed", "The request has invalid fields.", [
          {
            field: "password",
            code: "length",
            detail: "must be between 12 and 128 characters long",
          },
        ]);
        return true;
      }
      account.password = password;
      account.hasPassword = true;
      empty(response, 204);
      return true;
    }
    if (tail === "/roles" && method === "GET") {
      send(response, 200, { data: rolesOf(account) } satisfies Schemas["Data_Vec_RoleResponse"]);
      return true;
    }
    if (tail === "/roles" && method === "PUT") {
      const ids = Array.isArray(body.role_ids) ? body.role_ids.map(String) : [];
      if (ids.some((id) => !roles.some((r) => r.id === id))) {
        problem(response, 422, "validation_failed", "The request has invalid fields.", [
          { field: "role_ids", code: "unknown", detail: "has a role that does not exist" },
        ]);
        return true;
      }
      if (
        account.roleIds.includes(ADMIN_ROLE) &&
        !ids.includes(ADMIN_ROLE) &&
        !otherAdmin(accounts(), account)
      ) {
        lastAdmin(response);
        return true;
      }
      account.roleIds = ids;
      send(response, 200, { data: rolesOf(account) } satisfies Schemas["Data_Vec_RoleResponse"]);
      return true;
    }
    if (tail === "/sessions" && method === "DELETE") {
      const ended = endSessionsOf(account);
      send(response, 200, { data: { ended } } satisfies Schemas["Data_EndedSessionsResponse"]);
      return true;
    }
    if (tail === "/mfa" && method === "DELETE") {
      account.mfa = false;
      account.recoveryCodes = [];
      empty(response, 204);
      return true;
    }
  }

  // ------------------------------------------------------------ Role
  if (path === "/api/v1/auth/roles") {
    if (method === "GET") {
      const ordered = url.searchParams.get("order") === "asc" ? [...roles] : [...roles].reverse();
      send(response, 200, page(ordered, url) satisfies Schemas["Page_RoleResponse"]);
      return true;
    }
    const input = roleInput(body);
    if (input.errors.length > 0) {
      problem(response, 422, "validation_failed", "The request has invalid fields.", input.errors);
      return true;
    }
    if (roles.some((r) => r.name === input.name)) {
      problem(
        response,
        409,
        "auth.role_name_taken",
        `A role named \`${input.name}\` already exists.`,
      );
      return true;
    }
    const now = new Date().toISOString();
    const role: Role = {
      id: randomUUID(),
      name: input.name,
      description: input.description,
      all_permissions: false,
      permissions: [...new Set(input.permissions)].sort(),
      created_at: now,
      updated_at: now,
    };
    roles.push(role);
    send(response, 201, { data: role } satisfies Schemas["Data_RoleResponse"]);
    return true;
  }
  const one = /^\/api\/v1\/auth\/roles\/([^/]+)$/.exec(path);
  if (one) {
    const role = roles.find((r) => r.id === one[1]);
    if (!role) {
      problem(response, 404, "auth.role_not_found", "No role has this id.");
      return true;
    }
    if (method === "GET") {
      response.setHeader("ETag", etagOf(role.updated_at));
      send(response, 200, { data: role } satisfies Schemas["Data_RoleResponse"]);
      return true;
    }
    if (role.all_permissions) {
      problem(response, 409, "auth.role_builtin", "The built-in `admin` role cannot be changed.");
      return true;
    }
    if (method === "PUT") {
      if (stale(request, role.updated_at)) {
        preconditionFailed(response);
        return true;
      }
      const input = roleInput(body);
      if (input.errors.length > 0) {
        problem(
          response,
          422,
          "validation_failed",
          "The request has invalid fields.",
          input.errors,
        );
        return true;
      }
      if (roles.some((r) => r !== role && r.name === input.name)) {
        problem(
          response,
          409,
          "auth.role_name_taken",
          `A role named \`${input.name}\` already exists.`,
        );
        return true;
      }
      role.name = input.name;
      role.description = input.description;
      role.permissions = [...new Set(input.permissions)].sort();
      role.updated_at = new Date(
        Math.max(Date.now(), Date.parse(role.updated_at) + 1),
      ).toISOString();
      send(response, 200, { data: role } satisfies Schemas["Data_RoleResponse"]);
      return true;
    }
    if (method === "DELETE") {
      roles = roles.filter((r) => r !== role);
      for (const account of accounts()) {
        account.roleIds = account.roleIds.filter((id) => id !== role.id);
      }
      empty(response, 204);
      return true;
    }
  }
  return false;
}
