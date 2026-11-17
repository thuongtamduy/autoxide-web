// Phần "đội ngũ" của core giả (bước 34 của core): lời mời (D-312), đăng nhập bằng link (D-311), uỷ
// quyền (D-310), quyền vào hỗ trợ phía khách (D-313), hồ sơ và nơi làm việc của chính mình (D-308),
// membership theo nút của một người dùng (D-304). Hình dạng theo `openapi.json`; luật rút gọn.
//
// Token trong thư không gửi đi đâu: test lấy bằng `GET /__team/tokens` (token mới nhất của lời mời và
// link đăng nhập theo email).
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { roleById } from "./mock-access.ts";
import { type Account, empty, json, problem, type Schemas, send, text } from "./mock-http.ts";
import { membershipsOf, ROOT_UNIT, setMembershipsOf, unitOf } from "./mock-org.ts";

type Invitation = Schemas["InvitationResponse"];

export interface TeamDeps {
  accounts: () => Account[];
  /** Tạo tài khoản mới (nhận lời mời khi chưa có tài khoản). */
  create: (email: string, name: string, password: string | null) => Account;
  /** Mở phiên mới cho tài khoản, trả thân `{ data: TokenResponse }`. */
  signIn: (account: Account, method: string) => { data: Schemas["TokenResponse"] };
  /** Tài khoản bật xác thực hai bước: thân `{ data: MfaChallengeResponse }` để sang bước mã. */
  challenge: (account: Account) => { data: Schemas["MfaChallengeResponse"] };
  /** Thân `MeResponse` của tài khoản. */
  me: (account: Account) => Schemas["MeResponse"];
}

let invitations: Invitation[] = [];
/** Token (trong thư) → id lời mời. */
let inviteTokens = new Map<string, string>();
/** Token link đăng nhập → email. */
let linkTokens = new Map<string, string>();
let delegations: Schemas["DelegationResponse"][] = [];
let grants: Schemas["SupportGrantResponse"][] = [];
/** Lần cấp của nhân sự nền tảng vào các khách khác (`/auth/support-grants`). */
let platformGrants: Schemas["SupportGrantResponse"][] = [];
let profiles = new Map<string, { locale: string | null; time_zone: string | null }>();

const DAY = 86_400_000;
const CHILD_TENANT = "00000000-0000-7000-8000-0000000000d1";

export function resetTeam() {
  invitations = [];
  inviteTokens = new Map();
  linkTokens = new Map();
  profiles = new Map();
  platformGrants = [];
  const now = Date.now();
  delegations = [
    {
      id: "01a1e400-0000-7000-8000-0000000000e1",
      parent_tenant_id: ROOT_UNIT,
      child_tenant_id: CHILD_TENANT,
      org_id: CHILD_TENANT,
      role_id: "01a1e000-0000-7000-8000-00000000ed01",
      reason: "Đối soát doanh thu tháng",
      expires_at: null,
      revoked_at: null,
      created_at: new Date(now - 3 * DAY).toISOString(),
    },
  ];
  grants = [
    grant("01a1e400-0000-7000-8000-0000000000f1", "support", "Kiểm tra lỗi đồng bộ đơn hàng", now),
    {
      ...grant("01a1e400-0000-7000-8000-0000000000f2", "legal_request", "Yêu cầu của cơ quan", now),
      legal_reference: "CV 123/2026",
    },
  ];
}
resetTeam();

function grant(
  id: string,
  basis: string,
  reason: string,
  now: number,
): Schemas["SupportGrantResponse"] {
  return {
    id,
    tenant_id: ROOT_UNIT,
    staff_user_id: "01a1e400-0000-7000-8000-0000000000aa",
    role_id: "01a1e400-0000-7000-8000-0000000000ab",
    basis,
    reason,
    legal_reference: null,
    granted_by: null,
    starts_at: new Date(now - 3_600_000).toISOString(),
    expires_at: new Date(now + 4 * 3_600_000).toISOString(),
    first_used_at: null,
    revoked_at: null,
    revoked_by_tenant: false,
    created_at: new Date(now - 3_600_000).toISOString(),
  };
}

/** `GET /__team/tokens`: token mới nhất của từng email (lời mời, link đăng nhập), cho test. */
export function teamTokens(response: ServerResponse) {
  const invites: Record<string, string> = {};
  for (const [token, id] of inviteTokens) {
    const email = invitations.find((i) => i.id === id)?.email;
    if (email) invites[email] = token;
  }
  const links: Record<string, string> = {};
  for (const [token, email] of linkTokens) links[email] = token;
  send(response, 200, { invites, links });
}

/** Ngôn ngữ và múi giờ ưa thích của một tài khoản (cho `GET /auth/me`). */
export function preferencesOf(id: string): { locale: string | null; time_zone: string | null } {
  return profiles.get(id) ?? { locale: null, time_zone: null };
}

function invalidInvitation(response: ServerResponse) {
  problem(
    response,
    400,
    "auth.invitation_invalid",
    "The invitation is wrong, used, revoked or expired. Ask for a new one.",
  );
}

/** Lời mời còn dùng được của token; `undefined` khi sai, đã dùng, đã thu hồi hay hết hạn. */
function pendingInvitation(token: string): Invitation | undefined {
  const id = inviteTokens.get(token);
  const invitation = invitations.find((i) => i.id === id);
  if (invitation?.status !== "pending") return undefined;
  return Date.parse(invitation.expires_at) > Date.now() ? invitation : undefined;
}

function acceptFor(invitation: Invitation, account: Account, token: string) {
  const rows = membershipsOf(account.id);
  const others = rows.filter((m) => m.org_id !== invitation.org_id);
  const here = rows.find((m) => m.org_id === invitation.org_id)?.role_ids ?? [];
  setMembershipsOf(account.id, [
    ...others,
    { org_id: invitation.org_id, role_ids: [...new Set([...here, ...invitation.role_ids])] },
  ]);
  if (invitation.org_id === ROOT_UNIT) {
    account.roleIds = [...new Set([...account.roleIds, ...invitation.role_ids])];
  }
  invitation.status = "accepted";
  invitation.accepted_user_id = account.id;
  inviteTokens.delete(token);
}

/** Lệnh công khai (không đăng nhập). `true` khi đã trả lời. */
export async function teamPublicRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  route: string,
  deps: TeamDeps,
): Promise<boolean> {
  if (route === "POST /api/v1/auth/invitations/accept" && !request.headers.authorization) {
    const body = await json(request);
    const token = text(body, "token");
    const invitation = pendingInvitation(token);
    if (!invitation) {
      invalidInvitation(response);
      return true;
    }
    if (deps.accounts().some((a) => !a.deleted && a.email === invitation.email)) {
      problem(
        response,
        409,
        "auth.invitation_sign_in_required",
        "This email already has an account: sign in, then accept the invitation.",
      );
      return true;
    }
    const password = text(body, "password");
    if (password && password.length < 12) {
      problem(response, 422, "validation_failed", "The request has invalid fields.", [
        { field: "password", code: "length", detail: "must be 12 to 128 characters" },
      ]);
      return true;
    }
    const account = deps.create(
      invitation.email,
      text(body, "name") || invitation.name,
      password || null,
    );
    account.verified = true;
    acceptFor(invitation, account, token);
    const tokens = deps.signIn(account, "invitation");
    send(response, 200, { data: { user_id: account.id, tokens: tokens.data } });
    return true;
  }
  if (route === "POST /api/v1/auth/login/link") {
    const email = text(await json(request), "email")
      .trim()
      .toLowerCase();
    if (deps.accounts().some((a) => !a.deleted && a.email === email)) {
      linkTokens.set(`link-${randomUUID()}`, email);
    }
    empty(response, 202);
    return true;
  }
  if (route === "POST /api/v1/auth/login/link/confirm") {
    const token = text(await json(request), "token");
    const email = linkTokens.get(token);
    const account = deps.accounts().find((a) => !a.deleted && a.email === email);
    if (!account) {
      problem(
        response,
        401,
        "auth.login_link_invalid",
        "The sign-in link is wrong, used or expired; ask for a new one.",
        undefined,
        "unknown",
      );
      return true;
    }
    linkTokens.delete(token);
    if (account.mfa) {
      send(response, 202, deps.challenge(account));
      return true;
    }
    send(response, 200, deps.signIn(account, "login_link"));
    return true;
  }
  return false;
}

/** Lệnh cần đăng nhập. `true` khi đã trả lời. */
export async function teamRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  route: string,
  account: Account,
  deps: TeamDeps,
): Promise<boolean> {
  const path = url.pathname;
  const method = request.method ?? "GET";
  // ------------------------------------------------------------ Lời mời
  if (route === "POST /api/v1/auth/invitations/accept") {
    const token = text(await json(request), "token");
    const invitation = pendingInvitation(token);
    if (!invitation) {
      invalidInvitation(response);
      return true;
    }
    if (invitation.email !== account.email) {
      problem(
        response,
        403,
        "auth.invitation_email_mismatch",
        "The invitation was sent to another email than the account you use.",
      );
      return true;
    }
    acceptFor(invitation, account, token);
    send(response, 200, { data: { user_id: account.id, tokens: null } });
    return true;
  }
  if (route === "GET /api/v1/auth/invitations") {
    const status = url.searchParams.get("status");
    const rows = invitations
      .filter((i) => !status || i.status === status)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    send(response, 200, { data: rows, pagination: { limit: 200, next_cursor: null } });
    return true;
  }
  if (route === "POST /api/v1/auth/invitations") {
    const body = (await json(request)) as Schemas["InvitationRequest"];
    const errors: Schemas["ProblemField"][] = [];
    if (!/^[^@\s]+@[^@\s]+$/.test(body.email ?? "")) {
      errors.push({ field: "email", code: "email", detail: "must be an email address" });
    }
    if (!body.role_ids?.length) {
      errors.push({ field: "role_ids", code: "length", detail: "must list at least one role" });
    }
    if (errors.length > 0) {
      problem(response, 422, "validation_failed", "The request has invalid fields.", errors);
      return true;
    }
    const now = new Date();
    const invitation: Invitation = {
      id: randomUUID(),
      email: body.email.trim().toLowerCase(),
      name: body.name ?? "",
      org_id: body.org_id ?? ROOT_UNIT,
      role_ids: body.role_ids,
      reference: body.reference ?? null,
      status: "pending",
      invited_by: account.id,
      accepted_user_id: null,
      expires_at: new Date(now.getTime() + 7 * DAY).toISOString(),
      created_at: now.toISOString(),
    };
    invitations.push(invitation);
    inviteTokens.set(`invite-${randomUUID()}`, invitation.id);
    send(response, 201, { data: invitation });
    return true;
  }
  const invite = /^\/api\/v1\/auth\/invitations\/([^/]+)(\/resend)?$/.exec(path);
  if (invite) {
    const invitation = invitations.find((i) => i.id === invite[1]);
    if (!invitation) {
      problem(response, 404, "auth.invitation_not_found", `No invitation \`${invite[1]}\`.`);
      return true;
    }
    if (invitation.status !== "pending") {
      problem(
        response,
        409,
        "auth.invitation_not_pending",
        `The invitation \`${invitation.id}\` was accepted or revoked.`,
      );
      return true;
    }
    for (const [token, id] of inviteTokens) if (id === invitation.id) inviteTokens.delete(token);
    if (invite[2] && method === "POST") {
      invitation.expires_at = new Date(Date.now() + 7 * DAY).toISOString();
      inviteTokens.set(`invite-${randomUUID()}`, invitation.id);
    } else if (method === "DELETE") {
      invitation.status = "revoked";
    }
    send(response, 200, { data: invitation });
    return true;
  }
  // ------------------------------------------------------------ Uỷ quyền
  if (route === "GET /api/v1/auth/delegations/tenants") {
    // Như core (D-333): mọi khách cấp dưới, chỉ tên / slug / trạng thái.
    send(response, 200, {
      data: [
        {
          id: CHILD_TENANT,
          parent_id: ROOT_UNIT,
          name: "Chi nhánh Đà Nẵng",
          slug: "da-nang",
          status: "active",
        },
      ],
    });
    return true;
  }
  if (route === "GET /api/v1/auth/delegations") {
    const incoming = url.searchParams.get("direction") === "incoming";
    send(response, 200, { data: incoming ? [] : delegations });
    return true;
  }
  if (route === "POST /api/v1/auth/delegations") {
    const body = (await json(request)) as Schemas["DelegationRequest"];
    const errors: Schemas["ProblemField"][] = [];
    if (body.child_tenant_id !== CHILD_TENANT) {
      errors.push({
        field: "child_tenant_id",
        code: "not_child",
        detail: "is not a tenant below this one",
      });
    }
    const reason = (body.reason ?? "").trim();
    if (reason.length < 10 || reason.length > 500) {
      errors.push({ field: "reason", code: "length", detail: "must be 10 to 500 characters" });
    }
    if (errors.length > 0) {
      problem(response, 422, "validation_failed", "The request has invalid fields.", errors);
      return true;
    }
    const delegation = {
      id: randomUUID(),
      parent_tenant_id: ROOT_UNIT,
      child_tenant_id: body.child_tenant_id,
      org_id: body.org_id ?? body.child_tenant_id,
      role_id: body.role_id,
      reason,
      expires_at: body.expires_at ?? null,
      revoked_at: null,
      created_at: new Date().toISOString(),
    };
    delegations.unshift(delegation);
    send(response, 201, { data: delegation });
    return true;
  }
  const delegation = /^\/api\/v1\/auth\/delegations\/([^/]+)$/.exec(path);
  if (delegation && method === "DELETE") {
    const found = delegations.find((d) => d.id === delegation[1]);
    if (!found) {
      problem(response, 404, "auth.delegation_not_found", "No such delegation.");
      return true;
    }
    found.revoked_at = new Date().toISOString();
    send(response, 200, { data: found });
    return true;
  }
  // ------------------------------------------------------------ Cấp quyền vào khách (nền tảng)
  if (path === "/api/v1/auth/support-grants" || path.startsWith("/api/v1/auth/support-grants/")) {
    return platformGrantRoutes(request, response, url, account, deps);
  }
  // ------------------------------------------------------------ Quyền vào hỗ trợ
  if (route === "GET /api/v1/auth/support-access") {
    send(response, 200, { data: grants });
    return true;
  }
  const access = /^\/api\/v1\/auth\/support-access\/([^/]+)$/.exec(path);
  if (access && method === "DELETE") {
    const found = grants.find((g) => g.id === access[1]);
    if (!found) {
      problem(response, 404, "auth.support_grant_not_found", "No such grant.");
      return true;
    }
    if (found.basis === "legal_request") {
      problem(
        response,
        409,
        "auth.support_grant_legal",
        "A grant for a request of a competent authority cannot be revoked by the tenant.",
      );
      return true;
    }
    found.revoked_at = new Date().toISOString();
    found.revoked_by_tenant = true;
    send(response, 200, { data: found });
    return true;
  }
  // ------------------------------------------------------------ Của chính mình
  if (route === "PATCH /api/v1/auth/me") {
    const body = (await json(request)) as Schemas["UpdateMeRequest"];
    const errors: Schemas["ProblemField"][] = [];
    if (body.locale && !["en", "vi"].includes(body.locale)) {
      errors.push({ field: "locale", code: "unsupported", detail: "must be `en` or `vi`" });
    }
    if (body.time_zone && !knownZone(body.time_zone)) {
      errors.push({ field: "time_zone", code: "unknown", detail: "is not an IANA time zone" });
    }
    if (errors.length > 0) {
      problem(response, 422, "validation_failed", "The request has invalid fields.", errors);
      return true;
    }
    if (body.name) account.name = body.name.trim();
    profiles.set(account.id, {
      locale: body.locale ?? null,
      time_zone: body.time_zone ?? null,
    });
    send(response, 200, { data: deps.me(account) });
    return true;
  }
  if (route === "GET /api/v1/auth/me/memberships") {
    send(response, 200, { data: grouped(account.id) });
    return true;
  }
  if (route === "GET /api/v1/auth/me/tenants") {
    send(response, 200, {
      data: [
        { id: ROOT_UNIT, slug: "default", name: "Default", access: "direct", access_id: null },
      ],
    });
    return true;
  }
  // ------------------------------------------------------------ Membership của một người dùng
  const user = /^\/api\/v1\/auth\/users\/([^/]+)\/memberships$/.exec(path);
  if (user) {
    const id = user[1] ?? "";
    if (method === "PUT") {
      const body = (await json(request)) as Schemas["MembershipsRequest"];
      const admin = body.memberships.find(
        (m) => m.org_id !== ROOT_UNIT && m.role_ids.some((r) => roleById(r)?.all_permissions),
      );
      if (admin) {
        problem(response, 422, "validation_failed", "The request has invalid fields.", [
          {
            field: "memberships",
            code: "admin_root_only",
            detail: "the built-in admin role can only be given at the root unit",
          },
        ]);
        return true;
      }
      setMembershipsOf(id, body.memberships);
      const target = deps.accounts().find((a) => a.id === id);
      if (target) {
        target.roleIds = body.memberships.find((m) => m.org_id === ROOT_UNIT)?.role_ids ?? [];
      }
    }
    send(response, 200, { data: grouped(id) });
    return true;
  }
  return false;
}

/** Membership của một người, gom theo nút, kèm role đầy đủ (hình dạng `MembershipResponse`). */
function grouped(userId: string): Schemas["MembershipResponse"][] {
  return membershipsOf(userId).map((m) => ({
    org_id: m.org_id,
    org_name: unitOf(m.org_id)?.name ?? null,
    org_unit_type: unitOf(m.org_id)?.unit_type ?? null,
    roles: m.role_ids
      .map((id) => roleById(id))
      .filter((r): r is Schemas["RoleResponse"] => Boolean(r)),
  }));
}

/** Tên múi giờ IANA hợp lệ (gồm tên cũ như `Asia/Ho_Chi_Minh`, như `chrono-tz` của core). */
function knownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Trần thời hạn như mặc định của core (`AUTOXIDE_AUTH_SUPPORT_ACCESS_MAX_HOURS`). */
const MAX_SUPPORT_HOURS = 8;

/**
 * `/auth/support-grants` của nhân sự nền tảng (D-313 của core): chỉ người có mọi permission (admin của
 * khách nền tảng) dùng được; lý do 10–500 ký tự, thời hạn 1–8 giờ, `legal_request` cần số văn bản.
 */
async function platformGrantRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  account: Account,
  deps: TeamDeps,
): Promise<boolean> {
  const method = request.method ?? "GET";
  if (!account.canReadModules) {
    problem(response, 403, "permission_denied", "Missing permission `auth.support.grant`.");
    return true;
  }
  const one = /^\/api\/v1\/auth\/support-grants\/([^/]+)$/.exec(url.pathname);
  const tenant = url.searchParams.get("tenant_id");
  if (!one && method === "GET") {
    if (!tenant) {
      problem(response, 422, "validation_failed", "The request has invalid fields.", [
        { field: "tenant_id", code: "required", detail: "is required" },
      ]);
      return true;
    }
    send(response, 200, {
      data: platformGrants
        .filter((g) => g.tenant_id === tenant)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    });
    return true;
  }
  if (!one && method === "POST") {
    const body = (await json(request)) as Schemas["SupportGrantRequest"];
    const errors: Schemas["ProblemField"][] = [];
    const reason = (body.reason ?? "").trim();
    if (reason.length < 10 || reason.length > 500) {
      errors.push({ field: "reason", code: "length", detail: "must be 10 to 500 characters long" });
    }
    if (!["support", "legal_request"].includes(body.basis)) {
      errors.push({ field: "basis", code: "invalid", detail: "must be support or legal_request" });
    }
    if (body.basis === "legal_request" && !(body.legal_reference ?? "").trim()) {
      errors.push({ field: "legal_reference", code: "required", detail: "is required" });
    }
    const staff = deps.accounts().find((a) => a.id === body.staff_user_id && !a.deleted);
    if (!staff) {
      errors.push({ field: "staff_user_id", code: "not_found", detail: "no such staff account" });
    }
    if (errors.length > 0) {
      problem(response, 422, "validation_failed", "The request has invalid fields.", errors);
      return true;
    }
    if (body.hours < 1 || body.hours > MAX_SUPPORT_HOURS) {
      problem(
        response,
        422,
        "auth.support_duration_exceeded",
        `Support access lasts at most ${MAX_SUPPORT_HOURS} hours.`,
      );
      return true;
    }
    const now = new Date();
    const created: Schemas["SupportGrantResponse"] = {
      id: randomUUID(),
      tenant_id: body.tenant_id,
      staff_user_id: body.staff_user_id,
      staff_name: staff?.name || staff?.email || null,
      role_id: body.role_id,
      basis: body.basis,
      reason,
      legal_reference: body.basis === "legal_request" ? (body.legal_reference ?? null) : null,
      starts_at: now.toISOString(),
      expires_at: new Date(now.getTime() + body.hours * 3_600_000).toISOString(),
      first_used_at: null,
      granted_by: account.id,
      revoked_at: null,
      revoked_by_tenant: false,
      created_at: now.toISOString(),
    };
    platformGrants.push(created);
    send(response, 201, { data: created });
    return true;
  }
  if (one && method === "DELETE") {
    const found = platformGrants.find((g) => g.id === one[1] && g.tenant_id === tenant);
    if (!found) {
      problem(
        response,
        404,
        "auth.support_grant_not_found",
        "No grant with this id for this tenant.",
      );
      return true;
    }
    found.revoked_at = new Date().toISOString();
    send(response, 200, { data: found });
    return true;
  }
  return false;
}
