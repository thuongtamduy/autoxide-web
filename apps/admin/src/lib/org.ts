import type { components } from "@autoxide/sdk";

// Cây tổ chức của khách (module `organizations` của core, bước 34, D-303): kiểu và hàm thuần để
// test. Phần gọi core ở `org-server.ts`.

type Schemas = components["schemas"];
export type Unit = Schemas["UnitResponse"];
export type UnitType = Schemas["UnitTypeResponse"];
export type UnitSetting = Schemas["UnitSettingResponse"];
export type SettingInfo = Schemas["SettingResponse"];
export type MembershipRow = Schemas["MembershipRowResponse"];
export type PublicProfile = Schemas["PublicProfileResponse"];
export type Scope = Schemas["RoleGrant"]["scope"];
export type Invitation = Schemas["InvitationResponse"];
export type Delegation = Schemas["DelegationResponse"];
export type SupportGrant = Schemas["SupportGrantResponse"];
export type DelegationStatus = "active" | "expired" | "revoked";
/** Trạng thái hiện của lời mời: ba trạng thái của core, thêm `expired` (đang chờ mà quá hạn). */
export type InvitationStatus = "pending" | "expired" | "accepted" | "revoked";

export const SCOPES: readonly Scope[] = ["own", "unit", "subtree", "tenant"];

/** Cookie giữ nút đang chọn ở bộ chọn góc trên trái. Không phải secret (chỉ là id của nút). */
export const UNIT_COOKIE = "ax_unit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Id nút hợp lệ (UUID chữ thường) hay `null`. Core vẫn là bên quyết nút có tồn tại không. */
export function unitIdOf(value: string | undefined | null): string | null {
  const text = value?.trim().toLowerCase() ?? "";
  return UUID.test(text) ? text : null;
}

/**
 * Thứ tự cây: duyệt sâu từ gốc, con theo thứ tự tạo rồi theo tên. Nút đã lưu trữ không hiện. Nút có
 * cha nằm ngoài danh sách (người xem chỉ thấy một nhánh) thì đứng như gốc của nhánh đó.
 */
export function ordered(units: readonly Unit[]): { unit: Unit; depth: number }[] {
  const live = units.filter((u) => u.status !== "archived");
  const ids = new Set(live.map((u) => u.id));
  const children = new Map<string | null, Unit[]>();
  for (const unit of live) {
    const parent = unit.parent_id && ids.has(unit.parent_id) ? unit.parent_id : null;
    const list = children.get(parent) ?? [];
    list.push(unit);
    children.set(parent, list);
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.name.localeCompare(b.name));
  }
  const out: { unit: Unit; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const unit of children.get(parent) ?? []) {
      if (seen.has(unit.id)) continue;
      seen.add(unit.id);
      out.push({ unit, depth });
      walk(unit.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Chuỗi từ nút lên gốc (gồm chính nút), theo `parent_id` của danh sách đã có. */
export function chainOf(units: readonly Unit[], id: string): Unit[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const out: Unit[] = [];
  let current = byId.get(id);
  while (current && !out.includes(current)) {
    out.push(current);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return out;
}

/** Độ sâu rộng nhất mà một role cấp (`all_permissions` = cả khách). Role không cấp gì: `null`. */
export function widestScope(role: {
  all_permissions: boolean;
  permissions: readonly string[];
  grants: readonly { scope: Scope }[];
}): Scope | null {
  if (role.all_permissions || role.permissions.length > 0) return "tenant";
  let best = -1;
  for (const grant of role.grants) best = Math.max(best, SCOPES.indexOf(grant.scope));
  return best >= 0 ? (SCOPES[best] ?? null) : null;
}

/** Số người (khác nhau) được gán trực tiếp ở mỗi nút. */
export function memberCounts(rows: readonly MembershipRow[]): Map<string, number> {
  const people = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = people.get(row.org_id) ?? new Set<string>();
    set.add(row.user_id);
    people.set(row.org_id, set);
  }
  return new Map([...people].map(([id, set]) => [id, set.size]));
}

/** Một người ở một nút, với mọi role của họ ở đó. */
export interface MemberAt {
  user_id: string;
  org_id: string;
  inherited: boolean;
  roles: { id: string; name: string }[];
}

/** Gom các dòng membership (mỗi dòng một role) thành một dòng mỗi (người, nút). */
export function groupMemberships(rows: readonly MembershipRow[]): MemberAt[] {
  const out = new Map<string, MemberAt>();
  for (const row of rows) {
    const key = `${row.user_id}|${row.org_id}`;
    const entry = out.get(key) ?? {
      user_id: row.user_id,
      org_id: row.org_id,
      inherited: row.inherited,
      roles: [],
    };
    if (!entry.roles.some((r) => r.id === row.role_id)) {
      entry.roles.push({ id: row.role_id, name: row.role_name });
    }
    out.set(key, entry);
  }
  // Người gán trực tiếp ở nút đứng trước người được kế thừa từ nút trên.
  return [...out.values()].sort((a, b) => Number(a.inherited) - Number(b.inherited));
}

/**
 * Giá trị cài đặt (JSON) thành chữ cho ô nhập: chuỗi giữ nguyên, danh sách nối bằng dấu phẩy, giá
 * trị khác thành JSON. `null` / không có: chuỗi rỗng.
 */
export function settingText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) return value.join(", ");
  return JSON.stringify(value);
}

/**
 * Chữ người dùng gõ thành giá trị gửi core. Dạng của giá trị theo thứ tự: chữ bắt đầu bằng `[` / `{`
 * là JSON; giá trị đang có (hay mặc định) là danh sách, hoặc chữ có dấu phẩy, thì tách theo dấu phẩy;
 * giá trị đang có là số / đúng sai thì đọc JSON; còn lại là chuỗi. Core kiểm giá trị và báo lỗi.
 */
export function settingValue(text: string, current: unknown, fallback: unknown = null): unknown {
  const trimmed = text.trim();
  const json = (raw: string): unknown => {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return json(trimmed);
  if (Array.isArray(current) || Array.isArray(fallback) || trimmed.includes(",")) {
    return trimmed
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (typeof current === "number" || typeof current === "boolean") return json(trimmed);
  return trimmed;
}

/**
 * Tên của một loại nút: loại do khách đặt dùng tên khách đặt (core trả); loại gốc `tenant` (core dựng
 * sẵn, tên tiếng Anh) và loại core không trả thì dùng chữ của giao diện (`translate`), không có thì mã.
 */
export function typeLabel(
  types: readonly UnitType[],
  code: string,
  translate: (code: string) => string | null,
): string {
  const own = code === "tenant" ? undefined : types.find((type) => type.code === code)?.name;
  return own || translate(code) || code;
}

/** Trạng thái hiện của một lời mời: `pending` đã quá `expires_at` là `expired`. */
export function invitationStatus(invitation: Invitation, now = Date.now()): InvitationStatus {
  if (invitation.status === "accepted" || invitation.status === "revoked") return invitation.status;
  return Date.parse(invitation.expires_at) <= now ? "expired" : "pending";
}

/** Trạng thái của uỷ quyền hay lần cấp quyền vào hỗ trợ: thu hồi, hết hạn, còn hiệu lực. */
export function delegationStatus(
  grant: { revoked_at?: string | null; expires_at?: string | null },
  now = Date.now(),
): DelegationStatus {
  if (grant.revoked_at) return "revoked";
  if (grant.expires_at && Date.parse(grant.expires_at) <= now) return "expired";
  return "active";
}
