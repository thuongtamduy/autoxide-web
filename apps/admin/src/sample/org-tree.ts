// Dữ liệu mẫu cho màn "Cây tổ chức" (W-006, W-012): ai làm ở nút nào và với độ sâu nào, cài đặt
// kế thừa theo cây, yêu cầu tách nhánh. Nút của cây nằm ở `org.ts` (`listUnits`, `createUnit`) để
// mọi màn dùng chung một cây; file này giữ phần riêng của màn. Hình dạng theo đặc tả bước 34 của
// core (`docs/steps/34-organizations-identity.md`, mục "API REST"); yêu cầu tách nhánh chưa có
// trong đặc tả (bước 38 chỉ có lệnh CLI cho người vận hành), nên là endpoint đề xuất ("mới").
//
// Lệnh ghi đổi một kho trong bộ nhớ của tiến trình máy chủ; khởi động lại thì về ban đầu.
import type { Problem } from "@autoxide/sdk";
import { listUnits, type OrgUnit, SAMPLE_UNIT_IDS, type SampleOutcome } from "./org";

/** Độ sâu của quyền (`Scope` của kernel), hẹp tới rộng. */
export type Scope = "own" | "unit" | "subtree" | "tenant";
export const SCOPES: readonly Scope[] = ["own", "unit", "subtree", "tenant"];

/** Role kèm độ sâu rộng nhất trong các grant của nó (dự kiến API trả kèm để khỏi gọi thêm). */
export interface RoleScope {
  id: string;
  name: string;
  scope: Scope;
}

/** Một người làm ở một nút (`GET /api/v1/auth/memberships?org_id=`). */
export interface Membership {
  id: string;
  user: { id: string; name: string; email: string };
  org_id: string;
  roles: RoleScope[];
  /**
   * Đề xuất (chưa có trong đặc tả): khi hỏi kèm `include_inherited=true`, người được gán ở nút
   * cha với độ sâu `subtree` / `tenant` cũng có mặt; `inherited` cho biết dòng đó đến từ nút cha.
   */
  inherited: boolean;
}

/** Một khoá cài đặt theo nút (`GET /api/v1/organizations/settings`). */
export interface SettingInfo {
  key: string;
  /** Module khai khoá; `tax` là của bước 36. */
  module: string;
  kind: "timezone" | "currency" | "language" | "bool" | "tax_profile";
  default: string;
}

/** Giá trị hiệu lực ở một nút (`GET /api/v1/organizations/units/{id}/settings`). */
export interface EffectiveSetting {
  key: string;
  value: string;
  /** Nút đặt giá trị này; `null` = giá trị mặc định của máy chủ. */
  source_unit_id: string | null;
  inherited: boolean;
}

/** Yêu cầu tách một nhánh thành khách riêng (đề xuất, chưa có trong lộ trình). */
export interface SplitRequest {
  id: string;
  unit_id: string;
  status: "requested" | "scheduled" | "done" | "rejected";
  note: string;
  created_at: string;
}

export const SETTINGS: readonly SettingInfo[] = [
  { key: "organizations.timezone", module: "organizations", kind: "timezone", default: "UTC" },
  { key: "organizations.currency", module: "organizations", kind: "currency", default: "VND" },
  { key: "organizations.language", module: "organizations", kind: "language", default: "en" },
  { key: "auth.customer_registration", module: "auth", kind: "bool", default: "true" },
  { key: "tax.profile", module: "tax", kind: "tax_profile", default: "company_deduction" },
];

/** Giá trị được nhận của khoá có danh sách cố định (ô chọn của giao diện). */
export const SETTING_CHOICES: Readonly<Record<SettingInfo["kind"], readonly string[]>> = {
  timezone: ["UTC", "Asia/Ho_Chi_Minh", "Asia/Bangkok", "Asia/Singapore"],
  currency: ["VND", "USD"],
  language: ["en", "vi"],
  bool: ["true", "false"],
  tax_profile: ["company_deduction", "household_flat", "per_seller"],
};

/** Loại nút tách được thành khách riêng (vùng, cửa hàng, sàn). */
export const SPLITTABLE: readonly OrgUnit["unit_type"][] = ["region", "store", "marketplace"];

const U = SAMPLE_UNIT_IDS;

// Người mẫu: id trùng với người cùng tên trong `org.ts` (lời mời, uỷ quyền); email miền example.com.
const person = (n: string, name: string, email: string) => ({
  id: `01a1e000-0000-7000-8000-000000000${n}`,
  name,
  email,
});
const ANH = person("f04", "Trương Đức Anh", "anh@example.com");
const LAN = person("f03", "Lan Phạm", "lan@example.com");
const THU = person("f06", "Phạm Thu", "thu.ketoan@example.com");
const MINH = person("f07", "Minh Anh", "minhanh@example.com");
const NAM = person("f02", "Hoàng Nam", "nam@example.com");
const MAI = person("f01", "Ngô Mai", "mai.q3@example.com");
const BINH = person("f08", "Trần Bình", "binh.q3@example.com");
const HANG = person("f09", "Lý Hằng", "hang.td@example.com");
const KHAI = person("f0a", "Đỗ Khải", "khai.kho@example.com");
const BAO = person("f0b", "Quốc Bảo", "bao.cg@example.com");
const VULAN = person("f0c", "Vũ Lan", "vulan.cg@example.com");
const CHI = person("f0d", "Mai Chi", "chi.san@example.com");

const role = (n: string, name: string, scope: Scope): RoleScope => ({
  id: `01a1e000-0000-7000-8000-00000009${n}`,
  name,
  scope,
});
// Id trùng với role cùng tên trong `org.ts`; role khác là của riêng màn này.
const OWNER = role("0010", "owner", "tenant");
const OPERATIONS = role("0006", "operations", "subtree");
const ACCOUNTANT = role("0005", "accountant", "tenant");
const EDITOR = role("0004", "editor", "unit");
const REGION_MANAGER = role("0011", "region-manager", "subtree");
const STORE_MANAGER = role("0012", "store-manager", "subtree");
const CASHIER = role("0001", "cashier", "own");
const STOREKEEPER = role("0002", "storekeeper", "unit");
const SALES = role("0003", "sales", "own");
const MARKET_OPS = role("0013", "marketplace-ops", "subtree");

interface Store {
  memberships: Omit<Membership, "inherited">[];
  /** Giá trị đặt riêng: `unit_id` → (khoá → giá trị). */
  values: Map<string, Map<string, string>>;
  splits: SplitRequest[];
}

function seed(): Store {
  let n = 0;
  const member = (user: Membership["user"], org: string, roles: RoleScope[]) => {
    n += 1;
    return {
      id: `01a1e000-0000-7000-8000-0000000c${String(n).padStart(4, "0")}`,
      user,
      org_id: org,
      roles,
    };
  };
  return {
    memberships: [
      member(ANH, U.root, [OWNER]),
      member(LAN, U.root, [OPERATIONS]),
      member(THU, U.root, [ACCOUNTANT]),
      member(MINH, U.root, [EDITOR]),
      member(NAM, U.south, [REGION_MANAGER]),
      member(MAI, U.q3, [STORE_MANAGER]),
      member(BINH, U.q3, [CASHIER]),
      member(HANG, U.thuDuc, [STORE_MANAGER]),
      member(KHAI, U.warehouse, [STOREKEEPER]),
      member(BAO, U.cauGiay, [STORE_MANAGER]),
      member(VULAN, U.cauGiay, [SALES]),
      member(CHI, U.market, [MARKET_OPS]),
    ],
    values: new Map([
      [
        U.root,
        new Map([
          ["organizations.timezone", "Asia/Ho_Chi_Minh"],
          ["organizations.currency", "VND"],
          ["organizations.language", "vi"],
        ]),
      ],
      [U.market, new Map([["tax.profile", "per_seller"]])],
      [U.warehouse, new Map([["auth.customer_registration", "false"]])],
    ]),
    splits: [],
  };
}

const KEY = Symbol.for("autoxide.sample.org-tree");
type Holder = { [KEY]?: Store };

function store(): Store {
  const holder = globalThis as Holder;
  holder[KEY] ??= seed();
  return holder[KEY];
}

/** Về dữ liệu ban đầu (test). */
export function resetSampleOrgTree(): void {
  (globalThis as Holder)[KEY] = seed();
}

function failed(status: number, code: string, detail: string): SampleOutcome<never> {
  return { ok: false, problem: { type: "about:blank", title: "Error", status, code, detail } };
}

function invalid(errors: NonNullable<Problem["errors"]>): SampleOutcome<never> {
  return {
    ok: false,
    problem: {
      type: "about:blank",
      title: "Unprocessable Entity",
      status: 422,
      code: "validation_failed",
      detail: "The request has invalid fields.",
      errors,
    },
  };
}

/** Các nút từ `id` lên gốc, gần nhất trước, gồm chính nút đó (`GET …/units/{id}/ancestors` + nút). */
export function chainOf(units: readonly OrgUnit[], id: string): OrgUnit[] {
  const out: OrgUnit[] = [];
  let current = units.find((u) => u.id === id);
  while (current) {
    out.push(current);
    const parent = current.parent_id;
    current = parent ? units.find((u) => u.id === parent) : undefined;
  }
  return out;
}

/** Độ sâu chảy xuống nút con: `subtree` và `tenant` có hiệu lực ở mọi nút bên dưới. */
export function flowsDown(scope: Scope): boolean {
  return scope === "subtree" || scope === "tenant";
}

/**
 * Thay bằng GET /api/v1/auth/memberships?org_id={id} (bước 34) khi core có. `include_inherited`
 * là tham số đề xuất (chưa có trong đặc tả): thêm người được gán ở nút cha với độ sâu chảy xuống.
 */
export async function listMemberships(query: {
  org_id: string;
  include_inherited?: boolean;
}): Promise<{ data: Membership[] }> {
  const { data: units } = await listUnits();
  const ancestors = chainOf(units, query.org_id)
    .slice(1)
    .map((u) => u.id);
  const data: Membership[] = [];
  for (const membership of store().memberships) {
    if (membership.org_id === query.org_id) {
      data.push({ ...membership, inherited: false });
    } else if (query.include_inherited && ancestors.includes(membership.org_id)) {
      const roles = membership.roles.filter((r) => flowsDown(r.scope));
      if (roles.length > 0) data.push({ ...membership, roles, inherited: true });
    }
  }
  return { data };
}

/** Số người làm được ở mỗi nút (gồm người từ nút cha), cho cây. */
export async function memberCounts(): Promise<Map<string, number>> {
  const { data: units } = await listUnits();
  const counts = new Map<string, number>();
  for (const unit of units) {
    const { data } = await listMemberships({ org_id: unit.id, include_inherited: true });
    counts.set(unit.id, data.length);
  }
  return counts;
}

/** Thay bằng GET /api/v1/organizations/settings (bước 34) khi core có. */
export async function listSettings(): Promise<{ data: SettingInfo[] }> {
  return { data: [...SETTINGS] };
}

/**
 * Thay bằng GET /api/v1/organizations/units/{id}/settings (bước 34) khi core có: mỗi khoá lấy giá
 * trị của nút gần nhất (gồm chính nút) có đặt, không có thì mặc định của máy chủ.
 */
export async function effectiveSettings(
  unitId: string,
): Promise<SampleOutcome<EffectiveSetting[]>> {
  const { data: units } = await listUnits();
  if (!units.some((u) => u.id === unitId)) {
    return failed(404, "organizations.unit_not_found", `No unit ${unitId}.`);
  }
  const chain = chainOf(units, unitId);
  const { values } = store();
  const data = SETTINGS.map((setting): EffectiveSetting => {
    const owner = chain.find((u) => values.get(u.id)?.has(setting.key));
    const value = owner ? values.get(owner.id)?.get(setting.key) : undefined;
    return {
      key: setting.key,
      value: value ?? setting.default,
      source_unit_id: owner?.id ?? null,
      inherited: owner?.id !== unitId,
    };
  });
  return { ok: true, data };
}

/** Thay bằng PUT /api/v1/organizations/units/{id}/settings/{key} (bước 34) khi core có. */
export async function setSetting(
  unitId: string,
  key: string,
  value: string,
): Promise<SampleOutcome<EffectiveSetting>> {
  const { data: units } = await listUnits();
  if (!units.some((u) => u.id === unitId)) {
    return failed(404, "organizations.unit_not_found", `No unit ${unitId}.`);
  }
  const setting = SETTINGS.find((s) => s.key === key);
  if (!setting) {
    return failed(404, "organizations.setting_unknown", `No setting ${key}.`);
  }
  if (!SETTING_CHOICES[setting.kind].includes(value)) {
    return invalid([{ field: "value", code: "unknown", detail: "is not an accepted value" }]);
  }
  const { values } = store();
  const own = values.get(unitId) ?? new Map<string, string>();
  own.set(key, value);
  values.set(unitId, own);
  return { ok: true, data: { key, value, source_unit_id: unitId, inherited: false } };
}

/** Thay bằng DELETE /api/v1/organizations/units/{id}/settings/{key} (bước 34): về kế thừa. */
export async function clearSetting(unitId: string, key: string): Promise<SampleOutcome<undefined>> {
  const own = store().values.get(unitId);
  if (!own?.has(key)) {
    return failed(404, "organizations.setting_unknown", `The unit does not set ${key}.`);
  }
  own.delete(key);
  return { ok: true, data: undefined };
}

/** Đề xuất ("mới"): GET /api/v1/organizations/units/{id}/split-requests. */
export async function listSplitRequests(unitId: string): Promise<{ data: SplitRequest[] }> {
  return { data: store().splits.filter((s) => s.unit_id === unitId) };
}

/**
 * Đề xuất ("mới"): POST /api/v1/organizations/units/{id}/split-requests. Nhân sự vận hành nền tảng
 * chạy thử rồi tách bằng `autoxide tenant split` (bước 38); khách chỉ gửi yêu cầu, không tự tách.
 */
export async function requestSplit(
  unitId: string,
  input: { acknowledged: boolean; note: string },
): Promise<SampleOutcome<SplitRequest>> {
  const { data: units } = await listUnits();
  const unit = units.find((u) => u.id === unitId);
  if (!unit) return failed(404, "organizations.unit_not_found", `No unit ${unitId}.`);
  if (!SPLITTABLE.includes(unit.unit_type) || unit.status !== "active") {
    return failed(
      409,
      "organizations.split_not_allowed",
      "Only an active region, store or marketplace can become a separate customer.",
    );
  }
  if (store().splits.some((s) => s.unit_id === unitId && s.status === "requested")) {
    return failed(409, "organizations.split_request_exists", "A request is already waiting.");
  }
  const errors: NonNullable<Problem["errors"]> = [];
  if (!input.acknowledged) {
    errors.push({ field: "acknowledged", code: "acknowledge", detail: "must be confirmed" });
  }
  if (input.note.length > 500) {
    errors.push({ field: "note", code: "length_0_500", detail: "must be at most 500 characters" });
  }
  if (errors.length > 0) return invalid(errors);
  const request: SplitRequest = {
    id: crypto.randomUUID(),
    unit_id: unitId,
    status: "requested",
    note: input.note.trim(),
    created_at: new Date().toISOString(),
  };
  store().splits.push(request);
  return { ok: true, data: request };
}
