// Dữ liệu mẫu của phân hệ Tổ chức, cho bốn tab của màn Phân quyền mà core chưa có API: lời mời,
// uỷ quyền, hồ sơ công khai của nút, quyền vào hỗ trợ. Hình dạng theo đặc tả bước 34 của core
// (`docs/steps/34-organizations-identity.md`, mục "API REST" và "Bổ sung theo D-200"). Nội dung
// mẫu lấy từ bản thiết kế (chuỗi "Bếp Mộc"); mọi email dùng miền `example.com`.
//
// Lệnh ghi đổi một kho trong bộ nhớ của tiến trình máy chủ; khởi động lại thì về ban đầu.
import type { Problem } from "@autoxide/sdk";
import { type SamplePage, samplePage } from "./index";

export type SampleOutcome<T> = { ok: true; data: T } | { ok: false; problem: Problem };

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Tóm tắt một bản ghi của nơi khác (role, người, khách) kèm tên, để hiện mà không gọi thêm. */
export interface Ref {
  id: string;
  name: string;
}

// ---------------------------------------------------------------- Kiểu theo đặc tả bước 34

/**
 * Loại nút (`organizations_unit_type.code`): khách tự đặt thêm được; đây là các loại mẫu của bản
 * thiết kế. `tenant` dành cho gốc; `seller` là người bán trên sàn (bước 34, mô hình sàn).
 */
export type UnitType = "tenant" | "region" | "store" | "warehouse" | "marketplace" | "seller";

export type UnitStatus = "pending" | "active" | "suspended" | "archived";

/** Nút của cây tổ chức (`GET /api/v1/organizations/units`). */
export interface OrgUnit {
  id: string;
  parent_id: string | null;
  unit_type: UnitType;
  name: string;
  status: UnitStatus;
  /** Mã nội bộ (vd mã cửa hàng); duy nhất trong khách khi có. */
  code?: string | null;
}

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

/** Lời mời (`GET /api/v1/auth/invitations`). `expired` tính từ `expires_at` khi đọc. */
export interface Invitation {
  id: string;
  email: string;
  name: string | null;
  org_id: string;
  role_ids: string[];
  /** Dự kiến: API trả kèm tên role và người mời để danh sách không phải gọi thêm. */
  roles: Ref[];
  invited_by: Ref;
  status: InvitationStatus;
  expires_at: string;
  created_at: string;
}

export interface NewInvitation {
  email: string;
  name?: string;
  org_id: string;
  role_ids: string[];
  /** Tên của các role chọn (giao diện lấy từ `GET /auth/roles` thật). */
  roles: Ref[];
}

/** Uỷ quyền đi: role của khách này dùng được ở một khách con (`GET /api/v1/auth/delegations`). */
export interface Delegation {
  id: string;
  child_tenant: Ref;
  role: Ref;
  /** Nút ở khách con; mặc định gốc. */
  org: Ref;
  reason: string;
  granted_by: Ref;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface NewDelegation {
  child_tenant_id: string;
  role: Ref;
  expires_at: string | null;
  reason: string;
}

/** Địa chỉ theo danh mục đơn vị hành chính sau sáp nhập: tỉnh / thành → xã / phường. */
export interface Address {
  country: "VN";
  province_code: string;
  province_name: string;
  commune_name: string;
  line: string;
}

/** Giờ mở cửa một ngày trong tuần (1 = thứ Hai … 7 = Chủ nhật). */
export interface OpeningHours {
  day: number;
  opens: string;
  closes: string;
}

/** Hồ sơ công khai của một nút (D-200). */
export interface PublicProfile {
  unit_id: string;
  public: boolean;
  display_name: string;
  address: Address | null;
  hours: OpeningHours[];
  pickup: boolean;
  updated_at: string;
}

export interface ProfileInput {
  public: boolean;
  display_name: string;
  province_code: string;
  commune_name: string;
  line: string;
  opens: string;
  closes: string;
  pickup: boolean;
}

/** Một lần cấp quyền vào hỗ trợ cho nhân sự nền tảng (`GET /api/v1/auth/support-access`). */
export interface SupportGrant {
  id: string;
  staff: Ref;
  role: Ref;
  basis: "support" | "legal_request";
  reason: string;
  legal_reference: string | null;
  granted_by: Ref;
  starts_at: string;
  expires_at: string;
  revoked_at: string | null;
  /** Các lần vào và việc đã làm, mới nhất trước. */
  visits: { at: string; text: string }[];
}

export interface SupportAccess {
  /** Cài đặt `auth.support_access` của khách. */
  enabled: boolean;
  grants: SupportGrant[];
}

// ---------------------------------------------------------------- Danh mục mẫu

/** Tỉnh / thành mẫu (mã theo danh mục sau 01/7/2025). Thay bằng `GET /api/v1/address/provinces`. */
export const SAMPLE_PROVINCES: Ref[] = [
  { id: "01", name: "Hà Nội" },
  { id: "79", name: "TP. Hồ Chí Minh" },
];

/** Khách con mẫu cho uỷ quyền. Thay bằng cây khách hàng của bước 33. */
export const SAMPLE_CHILD_TENANTS: Ref[] = [
  { id: "01a1e000-0000-7000-8000-00000000da01", name: "Bếp Mộc Đà Nẵng" },
];

const ROOT = "01a1e000-0000-7000-8000-000000000a01";
const SOUTH = "01a1e000-0000-7000-8000-000000000a02";
const Q3 = "01a1e000-0000-7000-8000-000000000a03";
const TD = "01a1e000-0000-7000-8000-000000000a04";
const WH = "01a1e000-0000-7000-8000-000000000a05";
const CG = "01a1e000-0000-7000-8000-000000000a06";
const NORTH = "01a1e000-0000-7000-8000-000000000a07";
const MARKET = "01a1e000-0000-7000-8000-000000000a08";
/** Id của các nút mẫu, để dữ liệu mẫu của phân hệ khác (tuân thủ, kho…) trỏ đúng nút. */
export const SAMPLE_UNIT_IDS = {
  root: ROOT,
  south: SOUTH,
  q3: Q3,
  thuDuc: TD,
  warehouse: WH,
  cauGiay: CG,
  north: NORTH,
  market: MARKET,
  /** Người bán trên Chợ Bếp Mộc, theo thứ tự của `SAMPLE_SELLERS`. */
  sellers: [
    "01a1e000-0000-7000-8000-000000000a10",
    "01a1e000-0000-7000-8000-000000000a11",
    "01a1e000-0000-7000-8000-000000000a12",
    "01a1e000-0000-7000-8000-000000000a13",
    "01a1e000-0000-7000-8000-000000000a14",
    "01a1e000-0000-7000-8000-000000000a15",
  ],
} as const;

/** Người bán mẫu (tên gian hàng) trên Chợ Bếp Mộc; `suspended` = đang tạm khoá. */
export const SAMPLE_SELLERS: readonly { name: string; status: UnitStatus }[] = [
  { name: "Gia Dụng Nhà Na", status: "active" },
  { name: "Gốm Sứ Bát Tràng Xưa", status: "active" },
  { name: "Bếp Nhà Thỏ", status: "active" },
  { name: "Dao Kéo Đa Sỹ Truyền Thống", status: "active" },
  { name: "Thực Phẩm Sạch An Nhiên", status: "active" },
  { name: "Khăn Bông Hạ Long", status: "suspended" },
];

/** Độ sâu tối đa của cây (`AUTOXIDE_ORGANIZATIONS_MAX_DEPTH`, mặc định 8; gốc = 0). */
export const SAMPLE_MAX_DEPTH = 8;

const MAI: Ref = { id: "01a1e000-0000-7000-8000-000000000f01", name: "Ngô Mai" };
const NAM: Ref = { id: "01a1e000-0000-7000-8000-000000000f02", name: "Hoàng Nam" };
const LAN: Ref = { id: "01a1e000-0000-7000-8000-000000000f03", name: "Lan Phạm" };
const ANH: Ref = { id: "01a1e000-0000-7000-8000-000000000f04", name: "Trương Đức Anh" };
const VY: Ref = { id: "01a1e000-0000-7000-8000-000000000f05", name: "Hà Vy (Autoxide)" };

const role = (id: string, name: string): Ref => ({
  id: `01a1e000-0000-7000-8000-00000009${id}`,
  name,
});
const CASHIER = role("0001", "cashier");
const STOREKEEPER = role("0002", "storekeeper");
const SALES = role("0003", "sales");
const EDITOR = role("0004", "editor");
const ACCOUNTANT = role("0005", "accountant");
const OPERATIONS = role("0006", "operations");
const SUPPORT_RO = role("0007", "support-read-only");

interface Store {
  units: OrgUnit[];
  invitations: Invitation[];
  delegations: Delegation[];
  profiles: PublicProfile[];
  support: SupportAccess;
}

function at(offset: number): string {
  return new Date(Date.now() + offset).toISOString();
}

function hoursEveryDay(opens: string, closes: string): OpeningHours[] {
  return [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, opens, closes }));
}

function seed(): Store {
  const units: OrgUnit[] = [
    { id: ROOT, parent_id: null, unit_type: "tenant", name: "Trụ sở", status: "active" },
    { id: SOUTH, parent_id: ROOT, unit_type: "region", name: "Miền Nam", status: "active" },
    { id: Q3, parent_id: SOUTH, unit_type: "store", name: "CN Quận 3", status: "active" },
    { id: TD, parent_id: SOUTH, unit_type: "store", name: "CN Thủ Đức", status: "active" },
    { id: WH, parent_id: SOUTH, unit_type: "warehouse", name: "Kho Thủ Đức", status: "active" },
    { id: NORTH, parent_id: ROOT, unit_type: "region", name: "Miền Bắc", status: "active" },
    { id: CG, parent_id: NORTH, unit_type: "store", name: "CN Cầu Giấy", status: "active" },
    {
      id: MARKET,
      parent_id: ROOT,
      unit_type: "marketplace",
      name: "Chợ Bếp Mộc",
      status: "active",
    },
    ...SAMPLE_SELLERS.map(
      (seller, index): OrgUnit => ({
        id: SAMPLE_UNIT_IDS.sellers[index] as string,
        parent_id: MARKET,
        unit_type: "seller",
        name: seller.name,
        status: seller.status,
      }),
    ),
  ];
  for (const [id, code] of [
    [Q3, "CH-Q3"],
    [TD, "CH-TD"],
    [WH, "KHO-TD"],
    [CG, "CH-CG"],
  ] as const) {
    const unit = units.find((u) => u.id === id);
    if (unit) unit.code = code;
  }
  const invitation = (
    n: string,
    email: string,
    org: string,
    roles: Ref[],
    by: Ref,
    status: "pending" | "accepted" | "revoked",
    expires: number,
  ): Invitation => ({
    id: `01a1e000-0000-7000-8000-000000000b${n}`,
    email,
    name: null,
    org_id: org,
    role_ids: roles.map((r) => r.id),
    roles,
    invited_by: by,
    status,
    expires_at: at(expires),
    created_at: at(expires - 7 * DAY),
  });
  return {
    units,
    invitations: [
      invitation("05", "hoa.q3@example.com", Q3, [CASHIER], MAI, "pending", 3 * DAY),
      invitation("04", "kho2@example.com", WH, [STOREKEEPER], NAM, "pending", 1 * DAY),
      invitation("03", "tuan.cg@example.com", CG, [SALES], NAM, "pending", -5 * DAY),
      invitation("02", "minhanh@example.com", ROOT, [EDITOR], LAN, "accepted", -9 * DAY),
      invitation("01", "ctv.noidung@example.com", ROOT, [EDITOR], LAN, "revoked", -12 * DAY),
    ],
    delegations: [
      {
        id: "01a1e000-0000-7000-8000-000000000d03",
        child_tenant: SAMPLE_CHILD_TENANTS[0] as Ref,
        role: ACCOUNTANT,
        org: { id: "root", name: "Gốc" },
        reason: "Kế toán trụ sở đối soát doanh thu nhượng quyền",
        granted_by: ANH,
        expires_at: null,
        revoked_at: null,
        created_at: at(-75 * DAY),
      },
      {
        id: "01a1e000-0000-7000-8000-000000000d02",
        child_tenant: SAMPLE_CHILD_TENANTS[0] as Ref,
        role: OPERATIONS,
        org: { id: "root", name: "Gốc" },
        reason: "Hỗ trợ khai trương cửa hàng thứ hai",
        granted_by: ANH,
        expires_at: at(46 * DAY),
        revoked_at: null,
        created_at: at(-26 * DAY),
      },
      {
        id: "01a1e000-0000-7000-8000-000000000d01",
        child_tenant: SAMPLE_CHILD_TENANTS[0] as Ref,
        role: EDITOR,
        org: { id: "root", name: "Gốc" },
        reason: "Chuyển nội dung sang website mới",
        granted_by: ANH,
        expires_at: at(-46 * DAY),
        revoked_at: null,
        created_at: at(-120 * DAY),
      },
    ],
    profiles: [
      {
        unit_id: Q3,
        public: true,
        display_name: "Bếp Mộc Quận 3",
        address: {
          country: "VN",
          province_code: "79",
          province_name: "TP. Hồ Chí Minh",
          commune_name: "Phường Xuân Hoà",
          line: "[Số nhà, đường mẫu]",
        },
        hours: hoursEveryDay("08:00", "21:00"),
        pickup: true,
        updated_at: at(-3 * DAY),
      },
      {
        unit_id: TD,
        public: true,
        display_name: "Bếp Mộc Thủ Đức",
        address: {
          country: "VN",
          province_code: "79",
          province_name: "TP. Hồ Chí Minh",
          commune_name: "Phường Thủ Đức",
          line: "[Số nhà, đường mẫu]",
        },
        hours: hoursEveryDay("08:00", "21:00"),
        pickup: true,
        updated_at: at(-3 * DAY),
      },
      {
        unit_id: CG,
        public: true,
        display_name: "Bếp Mộc Cầu Giấy",
        address: {
          country: "VN",
          province_code: "01",
          province_name: "Hà Nội",
          commune_name: "Phường Cầu Giấy",
          line: "[Số nhà, đường mẫu]",
        },
        hours: hoursEveryDay("09:00", "21:30"),
        pickup: false,
        updated_at: at(-10 * DAY),
      },
    ],
    support: {
      enabled: true,
      grants: [
        {
          id: "01a1e000-0000-7000-8000-000000000e03",
          staff: VY,
          role: SUPPORT_RO,
          basis: "support",
          reason: "Lỗi in phiếu giao CN Quận 3",
          legal_reference: null,
          granted_by: { id: "ops", name: "Trưởng ca vận hành" },
          starts_at: at(-1 * HOUR),
          expires_at: at(3 * HOUR),
          revoked_at: null,
          visits: [
            { at: at(-20 * 60_000), text: "Xem cấu hình máy in và job in phiếu" },
            { at: at(-55 * 60_000), text: "Bắt đầu phiên vào hỗ trợ" },
          ],
        },
        {
          id: "01a1e000-0000-7000-8000-000000000e02",
          staff: VY,
          role: SUPPORT_RO,
          basis: "support",
          reason: "Khách báo lỗi in phiếu giao",
          legal_reference: null,
          granted_by: { id: "ops", name: "Trưởng ca vận hành" },
          starts_at: at(-DAY - 4 * HOUR),
          expires_at: at(-DAY),
          revoked_at: null,
          visits: [{ at: at(-DAY - 4 * HOUR), text: "Bắt đầu phiên vào hỗ trợ" }],
        },
        {
          id: "01a1e000-0000-7000-8000-000000000e01",
          staff: { id: "legal", name: "Đội pháp chế (Autoxide)" },
          role: SUPPORT_RO,
          basis: "legal_request",
          reason: "Yêu cầu cung cấp thông tin người bán",
          legal_reference: "[SỐ VĂN BẢN MẪU]",
          granted_by: { id: "legal-lead", name: "Trưởng pháp chế" },
          starts_at: at(-44 * DAY),
          expires_at: at(-44 * DAY + 8 * HOUR),
          revoked_at: null,
          visits: [],
        },
      ],
    },
  };
}

// Kho giữ trên `globalThis`: Next.js có thể nạp lại module khi chạy thử, kho vẫn còn.
const KEY = Symbol.for("autoxide.sample.org");
type Holder = { [KEY]?: Store };

function store(): Store {
  const holder = globalThis as Holder;
  holder[KEY] ??= seed();
  return holder[KEY];
}

/** Về dữ liệu ban đầu (test). */
export function resetSampleOrg(): void {
  (globalThis as Holder)[KEY] = seed();
}

function newId(): string {
  return crypto.randomUUID();
}

function invalid(errors: Problem["errors"], detail: string): SampleOutcome<never> {
  return {
    ok: false,
    problem: {
      type: "about:blank",
      title: "Unprocessable Entity",
      status: 422,
      code: "validation_failed",
      detail,
      ...(errors ? { errors } : {}),
    },
  };
}

function failed(status: number, code: string, detail: string): SampleOutcome<never> {
  return { ok: false, problem: { type: "about:blank", title: "Error", status, code, detail } };
}

// ---------------------------------------------------------------- Nút tổ chức

/** Thay bằng GET /api/v1/organizations/units (bước 34) khi core có. */
export async function listUnits(): Promise<{ data: OrgUnit[] }> {
  return { data: [...store().units] };
}

/** Loại nút của khách (`GET /api/v1/organizations/unit-types`, bước 34). */
export interface UnitTypeInfo {
  code: UnitType;
  /** Tên khách tự đặt; giao diện hiện tên dịch sẵn cho các loại mẫu. */
  name: string;
}

const UNIT_TYPES: readonly UnitTypeInfo[] = [
  { code: "tenant", name: "Trụ sở" },
  { code: "region", name: "Vùng" },
  { code: "store", name: "Cửa hàng" },
  { code: "warehouse", name: "Kho" },
  { code: "marketplace", name: "Sàn" },
  { code: "seller", name: "Người bán" },
];

/** Thay bằng GET /api/v1/organizations/unit-types (bước 34) khi core có. */
export async function listUnitTypes(): Promise<{ data: UnitTypeInfo[] }> {
  return { data: [...UNIT_TYPES] };
}

/** Khoảng cách từ gốc (gốc = 0), như cột `depth` của `kernel_org_units`. */
export function unitDepth(units: readonly OrgUnit[], id: string): number {
  let depth = 0;
  let current = units.find((u) => u.id === id);
  while (current?.parent_id) {
    depth += 1;
    current = units.find((u) => u.id === current?.parent_id);
  }
  return depth;
}

export interface NewUnit {
  parent_id: string;
  unit_type: string;
  name: string;
  code?: string;
}

const UNIT_CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

/**
 * Thay bằng POST /api/v1/organizations/units (bước 34) khi core có. Nút mới `active` khi người tạo
 * có `organizations.units.manage` ở nút cha, không thì `pending` chờ duyệt.
 */
export async function createUnit(
  input: NewUnit,
  { manage }: { manage: boolean },
): Promise<SampleOutcome<OrgUnit>> {
  const { units } = store();
  const parent = units.find((u) => u.id === input.parent_id);
  if (!parent || parent.status === "archived") {
    return failed(404, "organizations.unit_not_found", `No unit ${input.parent_id}.`);
  }
  const errors: NonNullable<Problem["errors"]> = [];
  const name = input.name.trim();
  if (!name) errors.push({ field: "name", code: "required", detail: "must not be empty" });
  else if (name.length > 120) {
    errors.push({ field: "name", code: "length_1_120", detail: "must be at most 120 characters" });
  }
  if (!UNIT_TYPES.some((type) => type.code === input.unit_type && type.code !== "tenant")) {
    errors.push({ field: "unit_type", code: "unknown", detail: "is not a unit type" });
  }
  const code = input.code?.trim() ?? "";
  if (code && !UNIT_CODE.test(code)) {
    errors.push({ field: "code", code: "unit_code", detail: "use letters, digits, . _ -" });
  } else if (code && units.some((u) => u.code?.toLowerCase() === code.toLowerCase())) {
    errors.push({ field: "code", code: "taken", detail: "is used by another unit" });
  }
  if (errors.length > 0) return invalid(errors, "The request has invalid fields.");
  if (unitDepth(units, parent.id) + 1 > SAMPLE_MAX_DEPTH) {
    return failed(
      422,
      "organizations.depth_exceeded",
      `The organization tree is at most ${SAMPLE_MAX_DEPTH} levels deep.`,
    );
  }
  const unit: OrgUnit = {
    id: newId(),
    parent_id: parent.id,
    unit_type: input.unit_type as UnitType,
    name,
    status: manage ? "active" : "pending",
    code: code || null,
  };
  units.push(unit);
  return { ok: true, data: unit };
}

const TRANSITIONS: Readonly<Record<UnitStatus, readonly UnitStatus[]>> = {
  pending: ["active"],
  active: ["suspended", "archived"],
  suspended: ["active", "archived"],
  archived: ["active"],
};

/**
 * Thay bằng POST /api/v1/organizations/units/{id}/status (bước 34) khi core có. Chuyển hợp lệ:
 * `pending→active`, `active↔suspended`, `active/suspended→archived`, `archived→active`.
 */
export async function setUnitStatus(
  id: string,
  status: UnitStatus,
): Promise<SampleOutcome<OrgUnit>> {
  const unit = store().units.find((u) => u.id === id);
  if (!unit) return failed(404, "organizations.unit_not_found", `No unit ${id}.`);
  if (unit.parent_id === null) {
    return failed(409, "organizations.root_immutable", "The root unit cannot change status.");
  }
  if (!TRANSITIONS[unit.status].includes(status)) {
    return failed(
      409,
      "organizations.invalid_transition",
      `Cannot move the unit from ${unit.status} to ${status}.`,
    );
  }
  unit.status = status;
  return { ok: true, data: { ...unit } };
}

// ---------------------------------------------------------------- Lời mời

/** Trạng thái lúc đọc: lời mời còn chờ mà quá hạn thì là `expired`. */
export function invitationStatus(invitation: Invitation, now = Date.now()): InvitationStatus {
  if (invitation.status === "pending" && Date.parse(invitation.expires_at) <= now) {
    return "expired";
  }
  return invitation.status;
}

/** Thay bằng GET /api/v1/auth/invitations?status= (bước 34) khi core có. Mới nhất trước. */
export async function listInvitations(
  query: { status?: InvitationStatus; limit?: number; cursor?: string } = {},
): Promise<SamplePage<Invitation>> {
  const now = Date.now();
  const all = store()
    .invitations.map((i) => ({ ...i, status: invitationStatus(i, now) }))
    .filter((i) => !query.status || i.status === query.status)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return samplePage(all, query);
}

/** Thay bằng POST /api/v1/auth/invitations (bước 34) khi core có. Hạn 7 ngày. */
export async function createInvitation(input: NewInvitation): Promise<SampleOutcome<Invitation>> {
  const email = input.email.trim().toLowerCase();
  const errors: NonNullable<Problem["errors"]> = [];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    errors.push({ field: "email", code: "email", detail: "is not an email address" });
  }
  if (!store().units.some((u) => u.id === input.org_id)) {
    errors.push({ field: "org_id", code: "unknown", detail: "is not a unit of this customer" });
  }
  if (input.role_ids.length === 0) {
    errors.push({ field: "role_ids", code: "min_one", detail: "needs at least one role" });
  }
  if (errors.length > 0) return invalid(errors, "The request has invalid fields.");
  const invitation: Invitation = {
    id: newId(),
    email,
    name: input.name?.trim() || null,
    org_id: input.org_id,
    role_ids: input.role_ids,
    roles: input.roles,
    invited_by: { id: "me", name: "—" },
    status: "pending",
    expires_at: at(7 * DAY),
    created_at: at(0),
  };
  store().invitations.push(invitation);
  return { ok: true, data: invitation };
}

function findInvitation(id: string): Invitation | undefined {
  return store().invitations.find((i) => i.id === id);
}

/** Thay bằng POST /api/v1/auth/invitations/{id}/resend (bước 34): link cũ hết hiệu lực, hạn mới. */
export async function resendInvitation(id: string): Promise<SampleOutcome<Invitation>> {
  const invitation = findInvitation(id);
  if (!invitation) return failed(404, "auth.invitation_not_found", `No invitation ${id}.`);
  if (invitation.status !== "pending") {
    return failed(400, "auth.invitation_invalid", "The invitation was used or revoked.");
  }
  invitation.expires_at = at(7 * DAY);
  return { ok: true, data: invitation };
}

/** Thay bằng DELETE /api/v1/auth/invitations/{id} (bước 34): link không dùng được nữa. */
export async function revokeInvitation(id: string): Promise<SampleOutcome<undefined>> {
  const invitation = findInvitation(id);
  if (!invitation) return failed(404, "auth.invitation_not_found", `No invitation ${id}.`);
  if (invitationStatus(invitation) !== "pending") {
    return failed(400, "auth.invitation_invalid", "Only a pending invitation can be revoked.");
  }
  invitation.status = "revoked";
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------- Uỷ quyền

export type DelegationStatus = "active" | "revoked" | "expired";

export function delegationStatus(delegation: Delegation, now = Date.now()): DelegationStatus {
  if (delegation.revoked_at) return "revoked";
  if (delegation.expires_at && Date.parse(delegation.expires_at) <= now) return "expired";
  return "active";
}

/** Thay bằng GET /api/v1/auth/delegations?direction=outgoing (bước 34) khi core có. */
export async function listDelegations(): Promise<SamplePage<Delegation>> {
  const all = [...store().delegations].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return samplePage(all);
}

/** Thay bằng POST /api/v1/auth/delegations (bước 34) khi core có. */
export async function createDelegation(input: NewDelegation): Promise<SampleOutcome<Delegation>> {
  const child = SAMPLE_CHILD_TENANTS.find((c) => c.id === input.child_tenant_id);
  const errors: NonNullable<Problem["errors"]> = [];
  if (!child) {
    errors.push({ field: "child_tenant_id", code: "unknown", detail: "is not a child customer" });
  }
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 500) {
    errors.push({
      field: "reason",
      code: "length_10_500",
      detail: "must be between 10 and 500 characters long",
    });
  }
  if (input.expires_at && Date.parse(input.expires_at) <= Date.now()) {
    errors.push({ field: "expires_at", code: "past", detail: "must be in the future" });
  }
  if (errors.length > 0 || !child) return invalid(errors, "The request has invalid fields.");
  const delegation: Delegation = {
    id: newId(),
    child_tenant: child,
    role: input.role,
    org: { id: "root", name: "Gốc" },
    reason,
    granted_by: { id: "me", name: "—" },
    expires_at: input.expires_at,
    revoked_at: null,
    created_at: at(0),
  };
  store().delegations.push(delegation);
  return { ok: true, data: delegation };
}

/** Thay bằng DELETE /api/v1/auth/delegations/{id} (bước 34) khi core có. */
export async function revokeDelegation(id: string): Promise<SampleOutcome<undefined>> {
  const delegation = store().delegations.find((d) => d.id === id);
  if (!delegation) return failed(404, "auth.delegation_not_found", `No delegation ${id}.`);
  if (delegationStatus(delegation) !== "active") {
    return failed(409, "auth.delegation_not_active", "The delegation is no longer active.");
  }
  delegation.revoked_at = at(0);
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------- Hồ sơ công khai

/** Thay bằng GET /api/v1/organizations/units/{id} (phần hồ sơ công khai, bước 34) khi core có. */
export async function listProfiles(): Promise<{ data: PublicProfile[] }> {
  const { units, profiles } = store();
  // Mọi nút trừ gốc đều có hồ sơ (mặc định không công khai). Gian hàng của người bán trên sàn là
  // việc của module sàn (bước 46), không nằm ở đây.
  const data = units
    .filter(
      (u) => u.parent_id !== null && u.unit_type !== "marketplace" && u.unit_type !== "seller",
    )
    .map(
      (unit) =>
        profiles.find((p) => p.unit_id === unit.id) ?? {
          unit_id: unit.id,
          public: false,
          display_name: unit.name,
          address: null,
          hours: [],
          pickup: false,
          updated_at: at(0),
        },
    );
  return { data };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Thay bằng PATCH /api/v1/organizations/units/{id} (hồ sơ công khai, bước 34) khi core có. */
export async function updateProfile(
  unitId: string,
  input: ProfileInput,
): Promise<SampleOutcome<PublicProfile>> {
  if (!store().units.some((u) => u.id === unitId && u.parent_id !== null)) {
    return failed(404, "organizations.unit_not_found", `No unit ${unitId}.`);
  }
  const province = SAMPLE_PROVINCES.find((p) => p.id === input.province_code);
  const errors: NonNullable<Problem["errors"]> = [];
  const need = (field: string, value: string) => {
    if (!value.trim()) errors.push({ field, code: "required", detail: "must not be empty" });
  };
  need("display_name", input.display_name);
  if (input.public) {
    // Nút công khai cần đủ địa chỉ và giờ mở cửa để hiện trên website.
    if (!province) {
      errors.push({ field: "province_code", code: "unknown", detail: "is not a province" });
    }
    need("commune_name", input.commune_name);
    need("line", input.line);
  }
  for (const field of ["opens", "closes"] as const) {
    if (input[field] && !TIME.test(input[field])) {
      errors.push({ field, code: "time", detail: "must be a time such as 08:00" });
    }
  }
  if (errors.length > 0) return invalid(errors, "The request has invalid fields.");
  const profile: PublicProfile = {
    unit_id: unitId,
    public: input.public,
    display_name: input.display_name.trim(),
    address: province
      ? {
          country: "VN",
          province_code: province.id,
          province_name: province.name,
          commune_name: input.commune_name.trim(),
          line: input.line.trim(),
        }
      : null,
    hours: input.opens && input.closes ? hoursEveryDay(input.opens, input.closes) : [],
    pickup: input.pickup,
    updated_at: at(0),
  };
  const { profiles } = store();
  const index = profiles.findIndex((p) => p.unit_id === unitId);
  if (index >= 0) profiles[index] = profile;
  else profiles.push(profile);
  return { ok: true, data: profile };
}

// ---------------------------------------------------------------- Quyền vào hỗ trợ

export type GrantStatus = "active" | "expired" | "revoked";

export function grantStatus(grant: SupportGrant, now = Date.now()): GrantStatus {
  if (grant.revoked_at) return "revoked";
  return Date.parse(grant.expires_at) <= now ? "expired" : "active";
}

/** Thay bằng GET /api/v1/auth/support-access (bước 34) khi core có. */
export async function getSupportAccess(): Promise<{ data: SupportAccess }> {
  const { support } = store();
  return {
    data: {
      enabled: support.enabled,
      grants: [...support.grants].sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
    },
  };
}

/**
 * Thay bằng PUT /api/v1/organizations/units/{gốc}/settings/auth.support_access (bước 34) khi core
 * có. Tắt thì chỉ yêu cầu của cơ quan có thẩm quyền mới được cấp.
 */
export async function setSupportAccess(enabled: boolean): Promise<SampleOutcome<SupportAccess>> {
  store().support.enabled = enabled;
  return { ok: true, data: (await getSupportAccess()).data };
}

/**
 * Khách tự thu hồi một lần cấp còn hạn. Đặc tả bước 34 chỉ cho nhà vận hành thu hồi
 * (`DELETE /support-grants/{id}`); đây là endpoint đề xuất cho phía khách (chỗ thiếu API "mới").
 */
export async function revokeSupportGrant(id: string): Promise<SampleOutcome<undefined>> {
  const grant = store().support.grants.find((g) => g.id === id);
  if (!grant) return failed(404, "auth.support_grant_not_found", `No support grant ${id}.`);
  if (grantStatus(grant) !== "active") {
    return failed(409, "auth.support_grant_not_active", "The grant is no longer active.");
  }
  grant.revoked_at = at(0);
  return { ok: true, data: undefined };
}
