// Dữ liệu mẫu của màn "Khách hàng" (module `customers` của core, bước 47, chưa có; cùng tài khoản người
// mua của bước 34 và rủi ro COD của bước 45). Màn dựng hoàn toàn bằng file này (W-006, W-019). Hình dạng
// theo đặc tả `docs/steps/47-customers.md` của core (mục "Hồ sơ và nhận diện", "Nhóm và phân khúc",
// "Điểm thưởng và hạng", "Bảng dữ liệu", "API REST", "Mã lỗi"); trường đặc tả chưa có ghi "dự kiến" và
// nằm trong bảng chỗ thiếu API.
//
// Một bộ dữ liệu cho cả ứng dụng: hồ sơ dựng từ người mua của đơn mẫu (`sample/orders.ts`) — lịch sử
// mua là các đơn thật của bộ mẫu, tính lại mỗi lần đọc nên đơn mới, hoàn tiền hiện ngay; người có giỏ bỏ
// dở cũng có hồ sơ (đã đăng ký, chưa mua). Khách vãng lai tại quầy và người mua qua kênh bán ngoài (SĐT
// do kênh che, đặc tả 48) không có hồ sơ. Đơn trước cửa sổ 30 ngày của bộ mẫu gộp thành một dòng "đơn
// trước đó" như bản thiết kế.
//
// Số điện thoại, email, ngày sinh là mẫu (miền `example.com`, số `0900 0…`); màn luôn che bớt. Điểm là
// nghĩa vụ trong sổ cái (giá trị điểm lúc tích). Giờ lưu UTC. Lệnh ghi đổi một kho trong bộ nhớ của tiến
// trình máy chủ; khởi động lại thì về ban đầu.
import type { Problem } from "@autoxide/sdk";
import { normalizePhone, parseDelays, parseTags } from "@/lib/customers";
import { fold } from "@/lib/fold";
import { type Money, ORG, type Ref } from "./catalog";
import { type SamplePage, samplePage } from "./index";
import { listCarts, num, type Order, ordersState, vnd } from "./orders";
import { listUnits, type OrgUnit } from "./org";
import { listReviews } from "./stores";
import { vietnamDay } from "./tax";

export type SampleOutcome<T> = { ok: true; data: T } | { ok: false; problem: Problem };

const DAY = 86_400_000;
const HOUR = 3_600_000;

// ---------------------------------------------------------------- Kiểu theo đặc tả bước 47

export type TierCode = "member" | "silver" | "gold";

export interface Tier {
  code: TierCode;
  /** Chi tiêu 12 tháng tối thiểu (đồng). */
  threshold: Money;
  earn_multiplier_bp: number;
  group_id: string | null;
  rank: number;
  effective_from: string;
}

/** Hồ sơ khách (`customers_profiles`); số liệu mua tính từ `customers_order_facts`. */
export interface CustomerProfile {
  id: string;
  org_id: string;
  org_name: string;
  /** Tài khoản người mua của khách (bước 34); `null` = hồ sơ chỉ theo số điện thoại. */
  user_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  tags: string[];
  tier_code: TierCode;
  group_ids: string[];
  total_spent: Money;
  orders_count: number;
  first_order_at: string | null;
  last_order_at: string | null;
  /** Dự kiến (`GET /{id}` kèm `points`): số dư, đang giữ, sắp hết hạn trong 30 ngày. */
  points: { balance: number; held: number; expiring_30d: number };
  /** Dự kiến: đồng ý nhận tin quảng cáo theo sổ của `notifications` (bước 37). */
  marketing_consent: { email: boolean; withdrawn_at: string | null };
  referral_code: string;
  /** Nơi tạo hồ sơ: đơn đầu, đăng ký tài khoản, quầy. */
  source: "order" | "account" | "store";
  referred_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Tóm tắt một đơn (`customers_order_facts`, chép từ event của `orders`). */
export interface OrderFact {
  order_id: string;
  number: string;
  channel: string;
  status: string;
  net: Money;
  refunded: Money;
  placed_at: string;
  completed_at: string | null;
}

export interface CustomerNote {
  id: string;
  profile_id: string;
  author: Ref;
  body: string;
  created_at: string;
}

export type PointsKind = "earn" | "redeem" | "expire" | "adjust" | "review" | "referral";

/** Một dòng sổ điểm (`customers_points_entries`, chỉ thêm). */
export interface PointsEntry {
  id: string;
  profile_id: string;
  kind: PointsKind;
  points: number;
  reference: string;
  reason: string | null;
  actor: Ref | null;
  created_at: string;
}

export interface CustomerDetail extends CustomerProfile {
  orders: OrderFact[];
  /** Đơn trước cửa sổ của bộ mẫu, gộp một dòng. */
  earlier: { count: number; amount: Money } | null;
  notes: CustomerNote[];
  entries: PointsEntry[];
  account: BuyerAccount | null;
}

/** Tài khoản người mua (bước 34, module `auth`): dự kiến `GET /api/v1/auth/customers`. */
export interface BuyerAccount {
  id: string;
  profile_id: string;
  name: string;
  email: string;
  phone: string | null;
  registered_on: string;
  email_verified: boolean;
  /** Xác thực SĐT (bước 37, NĐ 147/2024). */
  phone_verified: boolean;
  status: "active" | "locked";
  registered_at: string;
  last_login_at: string | null;
  locked_by: Ref | null;
  locked_at: string | null;
  lock_reason: string | null;
  updated_at: string;
}

/** Quy tắc nhóm (JSON có kiểm của đặc tả 47). Tiền tính bằng đồng. */
export interface GroupRule {
  total_spent_min?: number;
  orders_count_min?: number;
  last_order_within_days?: number;
  tier_in?: TierCode[];
  tags_any?: string[];
  org_in?: string[];
}

export interface CustomerGroup {
  id: string;
  name: string;
  kind: "manual" | "rule";
  rule: GroupRule | null;
  /** Dự kiến: nơi đang dùng nhóm (bảng giá, khuyến mại) — chỉ để hiện, ID mờ với module khác. */
  used_in: string[];
  /** Thành viên thêm tay (`source = manual`). */
  manual_ids: string[];
  member_count: number;
  evaluated_at: string;
  created_at: string;
  updated_at: string;
}

export interface LoyaltyRule {
  id: string;
  earn_per_minor: number;
  points_per_unit: number;
  point_value_minor: number;
  points_valid_months: number;
  min_redeem_points: number;
  max_redeem_ratio_bp: number;
  /** Hệ số theo danh mục (tên danh mục mẫu → phần vạn). */
  category_multipliers: { category: string; multiplier_bp: number }[];
  effective_from: string;
  effective_to: string | null;
  created_by: Ref;
  created_at: string;
}

export type RuleState = "active" | "scheduled" | "closed";

/** Thưởng điểm khi đánh giá (dự kiến, `docs/prompts/ui-phase3-api.md`): không phụ thuộc số sao. */
export interface ReviewRewardRule {
  points: number;
  effective_from: string;
  verified_purchase_only: boolean;
}

export interface ReminderRule {
  id: string;
  enabled: boolean;
  delays_minutes: number[];
  channel: "email" | "sms";
  effective_from: string;
  effective_to: string | null;
}

export interface ReferralRule {
  id: string;
  referrer_points: number;
  referee_points: number;
  min_first_order: Money;
  apply_days: number;
  effective_from: string;
  effective_to: string | null;
}

export type ReferralStatus = "pending" | "qualified" | "rewarded" | "rejected";

export interface Referral {
  id: string;
  referrer_id: string;
  referrer_name: string;
  referrer_code: string;
  referee_id: string | null;
  referee_name: string;
  status: ReferralStatus;
  reason: string | null;
  first_order: { id: string; number: string; status: string; total: Money } | null;
  applied_at: string;
}

export type CodAction = "require_prepayment" | "no_cod";

/** Quy tắc rủi ro COD (bước 45, dự kiến theo bản thiết kế): dữ liệu có ngày hiệu lực. */
export interface CodRule {
  id: string;
  kind: "fail_ratio" | "order_total";
  min_orders: number;
  max_fail_ratio_pct: number;
  order_total_min: Money | null;
  org_id: string;
  org_name: string;
  action: CodAction;
  effective_from: string;
  effective_to: string | null;
}

export const COD_BLOCK_REASONS = ["repeated_refusal", "fake_details", "other"] as const;
export type CodBlockReason = (typeof COD_BLOCK_REASONS)[number];

export interface CodBlock {
  id: string;
  phone: string;
  cod_orders: number;
  reason: CodBlockReason;
  note: string;
  until: string;
  blocked_by: Ref;
  blocked_at: string;
  lifted_at: string | null;
  updated_at: string;
}

export type CodBlockState = "blocked" | "lifted" | "expired";

export interface CodLookup {
  found: boolean;
  delivered: number;
  failed: number;
  refused: number;
  fail_ratio_pct: number;
  rule: CodRule | null;
  blocked: CodBlock | null;
}

// ---------------------------------------------------------------- Đồ dùng chung

const uid = (kind: string, n: number) =>
  `01a1e000-0000-7000-8000-${kind}${String(n).padStart(10, "0")}`;

export const SAMPLE_ACTOR: Ref = { id: "01a1e000-0000-7000-8000-000000000f99", name: "Bạn" };
const THU: Ref = { id: "01a1e000-0000-7000-8000-000000000f21", name: "Trần Thu" };
const HUY: Ref = { id: "01a1e000-0000-7000-8000-000000000f22", name: "Lê Quang Huy" };
const MAI: Ref = { id: "01a1e000-0000-7000-8000-000000000f01", name: "Ngô Mai" };
const SYSTEM: Ref = { id: "00000000-0000-7000-8000-000000000000", name: "Hệ thống" };
const SOUTH = "01a1e000-0000-7000-8000-000000000a02";

function fail(
  status: number,
  code: string,
  detail: string,
  errors?: Problem["errors"],
): SampleOutcome<never> {
  return {
    ok: false,
    problem: {
      type: "about:blank",
      title: detail,
      status,
      code,
      detail,
      ...(errors ? { errors } : {}),
    },
  };
}

function invalid(errors: NonNullable<Problem["errors"]>): SampleOutcome<never> {
  return fail(422, "validation_failed", "The request has invalid fields.", errors);
}

function fieldError(field: string, code: string, detail = code) {
  return { field, code, detail };
}

const notFound = () => fail(404, "customers.profile_not_found", "Customer profile not found.");

/** Băm chữ thành số (FNV-1a): số liệu "đơn trước đó", SĐT mẫu cố định theo tên. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function today(): string {
  return vietnamDay();
}

function addDays(day: string, n: number): string {
  return vietnamDay(Date.parse(`${day}T12:00:00+07:00`) + n * DAY);
}

function parseDay(text: string): string | null {
  const t = text.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return Number.isNaN(Date.parse(`${t}T00:00:00Z`)) ? null : t;
}

function wholeNumber(text: string, min: number, max: number): number | null {
  const clean = text.replace(/[\s.,₫]/g, "");
  if (!/^\d{1,12}$/.test(clean)) return null;
  const n = Number(clean);
  return n >= min && n <= max ? n : null;
}

export function ruleState(from: string, to: string | null, day = today()): RuleState {
  if (from > day) return "scheduled";
  if (to && to < day) return "closed";
  return "active";
}

/** Dòng có ngày hiệu lực, chỉ thêm: dòng sau đóng dòng trước vào ngày trước ngày hiệu lực của nó. */
function closeChain<T extends { effective_from: string; effective_to: string | null }>(
  rows: T[],
): T[] {
  const sorted = [...rows].sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const cur = sorted[i] as T;
    const next = sorted[i + 1] as T;
    cur.effective_to = addDays(next.effective_from, -1);
  }
  return sorted;
}

// ---------------------------------------------------------------- Kho trong bộ nhớ

interface Base {
  id: string;
  org_id: string;
  user_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  tags: string[];
  consent: boolean;
  withdrawn_at: string | null;
  referral_code: string;
  source: CustomerProfile["source"];
  referred_by: string | null;
  /** Đơn trước cửa sổ của bộ mẫu. */
  earlier: { count: number; amount: number; first_at: string } | null;
  created_at: string;
  updated_at: string;
}

interface Store {
  profiles: Base[];
  notes: CustomerNote[];
  entries: PointsEntry[];
  accounts: BuyerAccount[];
  groups: Omit<CustomerGroup, "member_count">[];
  loyaltyRules: LoyaltyRule[];
  tiers: Tier[];
  reviewReward: ReviewRewardRule;
  reminderRules: ReminderRule[];
  referralRules: ReferralRule[];
  referrals: Omit<Referral, "status" | "first_order" | "referrer_name" | "referrer_code">[];
  rewarded: Set<string>;
  codRules: CodRule[];
  codBlocks: CodBlock[];
  registrationOpen: boolean;
  units: OrgUnit[];
  seq: number;
}

/** Khách tại quầy không khai tên; đơn kênh ngoài không có SĐT thật (đặc tả 48) — không lập hồ sơ. */
function profiled(o: Order): boolean {
  return o.buyer.name !== "Khách tại quầy" && o.channel !== "shopee" && o.channel !== "tiktok_shop";
}

interface Featured {
  tags?: string[];
  earlier?: [count: number, amount: number, firstDay: string];
  birthday?: string;
  consent?: boolean;
  withdrawn?: number;
  code?: string;
  account?: "none" | "locked" | "unverified_phone";
}

/** Khách trong bản thiết kế, khớp người mua của đơn mẫu viết tay. */
const FEATURED: Record<string, Featured> = {
  "Nguyễn Thị Hoa": {
    tags: ["thích đồ gang"],
    earlier: [11, 10_240_000, "2025-12-12"],
    birthday: "1988-03-21",
    consent: true,
    code: "HOA8K2Q",
  },
  "Võ Ngọc Ánh": {
    tags: ["hay mua quà"],
    earlier: [4, 3_040_000, "2026-02-14"],
    consent: true,
    code: "ANH4R7TM",
  },
  "Trần Minh Khoa": {
    consent: false,
    withdrawn: 2,
    code: "KHOA7N3D",
    earlier: [2, 578_000, "2026-07-03"],
  },
  "Đặng Văn Long": { tags: ["khách mới"], consent: true },
  "Lê Thu Trang": { consent: false, account: "unverified_phone" },
  "Bùi Hải Yến": { account: "locked", consent: false },
  "Phạm Quốc Huy": {
    earlier: [3, 2_180_000, "2026-05-30"],
    consent: true,
    tags: ["mua cho bếp nhà hàng"],
  },
  "Trương Mỹ Linh": { earlier: [6, 10_860_000, "2026-01-08"], consent: true },
  "Hà Anh Thư": { earlier: [5, 3_310_000, "2026-03-02"], consent: true },
};

function referralCode(name: string): string {
  const first = fold(name.split(" ").at(-1) ?? "KHACH")
    .replace(/[^a-z]/g, "")
    .toUpperCase();
  const tail = hash(name).toString(36).toUpperCase().slice(0, 4).padEnd(4, "X");
  return `${first}${tail}`;
}

async function seed(): Promise<Store> {
  const [{ orders }, { data: carts }, { data: units }] = await Promise.all([
    ordersState(),
    listCarts(),
    listUnits(),
  ]);
  const byName = new Map<string, Base>();
  const sorted = [...orders]
    .filter(profiled)
    .sort((a, b) => a.placed_at.localeCompare(b.placed_at));
  let n = 0;
  const make = (
    name: string,
    org: string,
    at: string,
    source: Base["source"],
    pos: boolean,
  ): Base => {
    n += 1;
    const f = FEATURED[name] ?? {};
    const h = hash(name);
    // Đơn trước cửa sổ của bộ mẫu: một phần khách có lịch sử cũ (cố định theo tên).
    const earlierCount = f.earlier?.[0] ?? (h % 5 === 0 ? 1 + (h % 4) : 0);
    const earlier =
      earlierCount > 0
        ? {
            count: earlierCount,
            amount: f.earlier?.[1] ?? earlierCount * (420_000 + (h % 7) * 60_000),
            first_at: new Date(
              f.earlier
                ? Date.parse(`${f.earlier[2]}T03:00:00Z`)
                : Date.parse(at) - (40 + (h % 200)) * DAY,
            ).toISOString(),
          }
        : null;
    const created = earlier?.first_at ?? at;
    return {
      id: uid("81", n),
      org_id: org,
      user_id: pos ? null : uid("82", n),
      full_name: name,
      phone: `090000${String(n).padStart(4, "0")}`,
      email: pos ? null : `${fold(name).replace(/[^a-z0-9]+/g, ".")}@example.com`,
      birthday: f.birthday ?? null,
      tags: f.tags ?? [],
      consent: f.consent ?? h % 3 !== 0,
      withdrawn_at: f.withdrawn ? new Date(Date.now() - f.withdrawn * DAY).toISOString() : null,
      referral_code: f.code ?? referralCode(name),
      source,
      referred_by: null,
      earlier,
      created_at: created,
      updated_at: created,
    };
  };
  for (const o of sorted) {
    if (byName.has(o.buyer.name)) continue;
    const pos = o.channel === "pos";
    const org = o.channel === "marketplace" ? ORG.ROOT : o.org_id;
    byName.set(o.buyer.name, make(o.buyer.name, org, o.placed_at, pos ? "store" : "order", pos));
  }
  for (const c of carts) {
    if (c.buyer_name === "Khách chưa đăng nhập" || byName.has(c.buyer_name)) continue;
    const base = make(c.buyer_name, c.org_id, c.abandoned_at, "account", false);
    base.consent = c.consent;
    byName.set(c.buyer_name, base);
  }
  const profiles = [...byName.values()];
  const find = (name: string) => byName.get(name) ?? null;
  const referee = (name: string, referrer: string) => {
    const p = find(name);
    const r = find(referrer);
    if (p && r) p.referred_by = r.id;
  };
  referee("Lê Thu Trang", "Nguyễn Thị Hoa");
  referee("Đặng Văn Long", "Võ Ngọc Ánh");

  const accounts: BuyerAccount[] = profiles
    .filter((p) => p.user_id)
    .map((p) => {
      const f = FEATURED[p.full_name] ?? {};
      const h = hash(p.full_name);
      const locked = f.account === "locked";
      const firstOrder = sorted.find((o) => o.buyer.name === p.full_name);
      return {
        id: p.user_id ?? "",
        profile_id: p.id,
        name: p.full_name,
        email: p.email ?? "",
        phone: p.phone,
        registered_on: firstOrder?.channel === "marketplace" ? "cho.bepmoc.vn" : "bepmoc.vn",
        email_verified: !locked,
        phone_verified: f.account === "unverified_phone" || locked ? false : h % 7 !== 0,
        status: locked ? "locked" : "active",
        registered_at: p.created_at,
        last_login_at: new Date(Date.now() - (1 + (h % 240)) * HOUR).toISOString(),
        locked_by: locked ? THU : null,
        locked_at: locked ? new Date(Date.now() - 2 * DAY - 3 * HOUR).toISOString() : null,
        lock_reason: locked ? "Nghi giả mạo: nhiều đơn COD với tên khác nhau." : null,
        updated_at: p.updated_at,
      };
    });

  const notes: CustomerNote[] = [];
  const hoa = find("Nguyễn Thị Hoa");
  if (hoa) {
    notes.push({
      id: uid("83", 1),
      profile_id: hoa.id,
      author: THU,
      body: "Khách hỏi bảo hành chảo gang; đã hướng dẫn cách tôi dầu.",
      created_at: new Date(Date.now() - 13 * DAY).toISOString(),
    });
  }
  const entries: PointsEntry[] = [];
  const adjust = (
    name: string,
    points: number,
    ref: string,
    reason: string,
    by: Ref,
    days: number,
  ) => {
    const p = find(name);
    if (!p) return;
    entries.push({
      id: uid("84", entries.length + 1),
      profile_id: p.id,
      kind: "adjust",
      points,
      reference: ref,
      reason,
      actor: by,
      created_at: new Date(Date.now() - days * DAY).toISOString(),
    });
  };
  adjust("Nguyễn Thị Hoa", 200, "CSKH-2611-014", "Bù điểm đơn tích thiếu", THU, 3);
  adjust("Phạm Quốc Huy", -150, "CSKH-2611-011", "Thu hồi điểm tặng nhầm", HUY, 5);

  const groupBase = (
    id: number,
    name: string,
    kind: CustomerGroup["kind"],
    rule: GroupRule | null,
    used: string[],
    manual: string[] = [],
  ): Omit<CustomerGroup, "member_count"> => ({
    id: uid("85", id),
    name,
    kind,
    rule,
    used_in: used,
    manual_ids: manual,
    evaluated_at: new Date(Date.parse(`${today()}T02:00:00+07:00`)).toISOString(),
    created_at: "2026-06-01T03:00:00.000Z",
    updated_at: "2026-10-20T03:00:00.000Z",
  });
  const huy = find("Phạm Quốc Huy");
  const groups = [
    groupBase(1, "Khách Vàng", "rule", { tier_in: ["gold"] }, ["Bảng giá thành viên Vàng"]),
    groupBase(
      2,
      "Khách quen Miền Nam",
      "rule",
      { orders_count_min: 2, last_order_within_days: 90, org_in: [SOUTH] },
      ["Khuyến mại Tri ân 20/11"],
    ),
    groupBase(3, "Chi trên 3 triệu", "rule", { total_spent_min: 3_000_000 }, []),
    groupBase(4, "Khách sỉ nhà hàng", "manual", null, ["Bảng giá sỉ"], huy ? [huy.id] : []),
  ];

  const loyaltyRules: LoyaltyRule[] = closeChain([
    {
      id: uid("86", 1),
      earn_per_minor: 20_000,
      points_per_unit: 1,
      point_value_minor: 100,
      points_valid_months: 6,
      min_redeem_points: 200,
      max_redeem_ratio_bp: 2000,
      category_multipliers: [],
      effective_from: "2025-06-01",
      effective_to: null,
      created_by: MAI,
      created_at: "2025-05-20T03:00:00.000Z",
    },
    {
      id: uid("86", 2),
      earn_per_minor: 10_000,
      points_per_unit: 1,
      point_value_minor: 100,
      points_valid_months: 12,
      min_redeem_points: 100,
      max_redeem_ratio_bp: 3000,
      category_multipliers: [{ category: "Gốm sứ", multiplier_bp: 15_000 }],
      effective_from: "2026-01-01",
      effective_to: null,
      created_by: MAI,
      created_at: "2025-12-10T03:00:00.000Z",
    },
    {
      id: uid("86", 3),
      earn_per_minor: 10_000,
      points_per_unit: 1,
      point_value_minor: 80,
      points_valid_months: 12,
      min_redeem_points: 100,
      max_redeem_ratio_bp: 3000,
      category_multipliers: [{ category: "Gốm sứ", multiplier_bp: 15_000 }],
      effective_from: "2027-01-01",
      effective_to: null,
      created_by: MAI,
      created_at: new Date(Date.now() - 10 * DAY).toISOString(),
    },
  ]);
  const tiers: Tier[] = [
    {
      code: "member",
      threshold: vnd(0),
      earn_multiplier_bp: 10_000,
      group_id: null,
      rank: 0,
      effective_from: "2026-01-01",
    },
    {
      code: "silver",
      threshold: vnd(3_000_000),
      earn_multiplier_bp: 12_000,
      group_id: null,
      rank: 1,
      effective_from: "2026-01-01",
    },
    {
      code: "gold",
      threshold: vnd(10_000_000),
      earn_multiplier_bp: 15_000,
      group_id: uid("85", 1),
      rank: 2,
      effective_from: "2026-01-01",
    },
  ];
  const reminderRules = closeChain<ReminderRule>([
    {
      id: uid("87", 1),
      enabled: true,
      delays_minutes: [60],
      channel: "email",
      effective_from: "2026-08-01",
      effective_to: null,
    },
    {
      id: uid("87", 2),
      enabled: true,
      delays_minutes: [60, 1440],
      channel: "email",
      effective_from: "2026-10-01",
      effective_to: null,
    },
  ]);
  const referralRules = closeChain<ReferralRule>([
    {
      id: uid("88", 1),
      referrer_points: 200,
      referee_points: 100,
      min_first_order: vnd(300_000),
      apply_days: 14,
      effective_from: "2026-10-01",
      effective_to: null,
    },
  ]);

  // Lượt giới thiệu: hai lượt của bản thiết kế (đơn đầu đang làm), một lượt đã đủ điều kiện, một lượt đã
  // thưởng (đơn đầu của người được giới thiệu đã hoàn tất), một lượt bị loại vì cùng SĐT.
  const singles = profiles.filter((p) => {
    const mine = orders.filter((o) => o.buyer.name === p.full_name);
    return p.user_id && !p.earlier && mine.length === 1 && mine[0]?.status === "completed";
  });
  const referrals: Store["referrals"] = [];
  const addReferral = (referrer: Base | null, refereeP: Base | null, daysAgo: number) => {
    if (!referrer || !refereeP) return;
    refereeP.referred_by = referrer.id;
    referrals.push({
      id: uid("89", referrals.length + 1),
      referrer_id: referrer.id,
      referee_id: refereeP.id,
      referee_name: refereeP.full_name,
      reason: null,
      applied_at: new Date(Date.parse(refereeP.created_at) + daysAgo * HOUR).toISOString(),
    });
  };
  addReferral(hoa, find("Lê Thu Trang"), 1);
  addReferral(find("Võ Ngọc Ánh"), find("Đặng Văn Long"), 1);
  addReferral(find("Trương Mỹ Linh"), singles[0] ?? null, 2);
  addReferral(hoa, singles[1] ?? null, 2);
  const khoa = find("Trần Minh Khoa");
  if (khoa) {
    referrals.push({
      id: uid("89", referrals.length + 1),
      referrer_id: khoa.id,
      referee_id: null,
      referee_name: "Trần Minh Khôi",
      reason: "customers.self_referral",
      applied_at: new Date(Date.now() - 4 * DAY).toISOString(),
    });
  }
  const rewarded = new Set<string>();
  const last = referrals.find((r) => r.referee_id === singles[1]?.id);
  if (last) rewarded.add(last.id);

  const yen = find("Bùi Hải Yến");
  const codBlocks: CodBlock[] = [
    {
      id: uid("8a", 1),
      phone: yen?.phone ?? "0900009771",
      cod_orders: 5,
      reason: "repeated_refusal",
      note: "Từ chối nhận 4 lần liên tiếp; đơn BM-2611-0350, 0362, 0371, 0390.",
      until: addDays(today(), 90),
      blocked_by: HUY,
      blocked_at: new Date(Date.now() - 2 * DAY).toISOString(),
      lifted_at: null,
      updated_at: new Date(Date.now() - 2 * DAY).toISOString(),
    },
    {
      id: uid("8a", 2),
      phone: "0900009112",
      cod_orders: 3,
      reason: "fake_details",
      note: "Đặt tên giả, địa chỉ không có.",
      until: addDays(today(), 15),
      blocked_by: THU,
      blocked_at: new Date(Date.now() - 6 * DAY).toISOString(),
      lifted_at: null,
      updated_at: new Date(Date.now() - 6 * DAY).toISOString(),
    },
    {
      id: uid("8a", 3),
      phone: "0900009345",
      cod_orders: 2,
      reason: "repeated_refusal",
      note: "Từ chối nhận 2 lần.",
      until: addDays(today(), -14),
      blocked_by: HUY,
      blocked_at: new Date(Date.now() - 45 * DAY).toISOString(),
      lifted_at: null,
      updated_at: new Date(Date.now() - 45 * DAY).toISOString(),
    },
  ];
  const codRules: CodRule[] = [
    {
      id: uid("8b", 1),
      kind: "fail_ratio",
      min_orders: 3,
      max_fail_ratio_pct: 60,
      order_total_min: null,
      org_id: ORG.ROOT,
      org_name: "Toàn chuỗi",
      action: "no_cod",
      effective_from: "2026-03-01",
      effective_to: "2026-08-31",
    },
    {
      id: uid("8b", 2),
      kind: "fail_ratio",
      min_orders: 2,
      max_fail_ratio_pct: 50,
      order_total_min: null,
      org_id: ORG.ROOT,
      org_name: "Toàn chuỗi",
      action: "require_prepayment",
      effective_from: "2026-09-01",
      effective_to: null,
    },
    {
      id: uid("8b", 3),
      kind: "order_total",
      min_orders: 0,
      max_fail_ratio_pct: 0,
      order_total_min: vnd(3_000_000),
      org_id: ORG.ROOT,
      org_name: "Chợ Bếp Mộc",
      action: "require_prepayment",
      effective_from: "2026-12-01",
      effective_to: null,
    },
  ];
  return {
    profiles,
    notes,
    entries,
    accounts,
    groups,
    loyaltyRules,
    tiers,
    reviewReward: { points: 20, effective_from: "2026-10-01", verified_purchase_only: true },
    reminderRules,
    referralRules,
    referrals,
    rewarded,
    codRules,
    codBlocks,
    registrationOpen: true,
    units,
    seq: 100,
  };
}

const KEY = Symbol.for("autoxide.sample.customers");
type Holder = { [KEY]?: Promise<Store> };

function store(): Promise<Store> {
  const holder = globalThis as Holder;
  holder[KEY] ??= seed();
  return holder[KEY];
}

/** Dựng lại kho mẫu (test). */
export function resetSampleCustomers(): void {
  (globalThis as Holder)[KEY] = seed();
}

// ---------------------------------------------------------------- Tính hồ sơ từ đơn

interface Context {
  s: Store;
  orders: Order[];
  reviews: {
    author_name: string;
    id: string;
    rating: number;
    created_at: string;
    status: string;
  }[];
}

async function context(): Promise<Context> {
  const [s, { orders }, { data: reviews }] = await Promise.all([
    store(),
    ordersState(),
    listReviews(),
  ]);
  return { s, orders, reviews };
}

function factsOf(ctx: Context, p: Base): OrderFact[] {
  return ctx.orders
    .filter((o) => profiled(o) && o.buyer.name === p.full_name)
    .map((o) => ({
      order_id: o.id,
      number: o.number,
      channel: o.channel,
      status: o.status,
      net: o.total,
      refunded: o.refunded,
      placed_at: o.placed_at,
      completed_at: o.completed_at,
    }))
    .sort((a, b) => b.placed_at.localeCompare(a.placed_at));
}

/** Tổng chi = Σ net đơn hoàn tất − hoàn tiền (đặc tả 47), cộng đơn trước cửa sổ của bộ mẫu. */
function spentOf(p: Base, facts: readonly OrderFact[]): number {
  const window = facts
    .filter((f) => f.status === "completed")
    .reduce((s, f) => s + num(f.net) - num(f.refunded), 0);
  return window + (p.earlier?.amount ?? 0);
}

function tierFor(tiers: readonly Tier[], spent: number): TierCode {
  return (
    [...tiers].sort((a, b) => b.rank - a.rank).find((t) => spent >= num(t.threshold))?.code ??
    "member"
  );
}

function pointsValue(s: Store, day = today()): number {
  const rule = s.loyaltyRules.find(
    (r) => ruleState(r.effective_from, r.effective_to, day) === "active",
  );
  return rule?.point_value_minor ?? 100;
}

/** Sổ điểm của một hồ sơ: tích theo đơn hoàn tất (lô theo đơn), đơn cũ, thưởng đánh giá, giới thiệu, điều chỉnh. */
function entriesOf(
  ctx: Context,
  p: Base,
  facts: readonly OrderFact[],
  tier: TierCode,
): PointsEntry[] {
  const { s } = ctx;
  const mult = (s.tiers.find((t) => t.code === tier)?.earn_multiplier_bp ?? 10_000) / 10_000;
  const out: PointsEntry[] = [];
  const at = (iso: string) => iso;
  if (p.earlier) {
    out.push({
      id: `${p.id}-opening`,
      profile_id: p.id,
      kind: "earn",
      points: Math.floor(p.earlier.amount / 10_000),
      reference: "customers:opening",
      reason: null,
      actor: SYSTEM,
      created_at: at(p.earlier.first_at),
    });
  }
  for (const f of facts) {
    if (f.status !== "completed" || !f.completed_at) continue;
    const pts = Math.floor(((num(f.net) - num(f.refunded)) / 10_000) * mult);
    if (pts <= 0) continue;
    out.push({
      id: `${p.id}-${f.number}`,
      profile_id: p.id,
      kind: "earn",
      points: pts,
      reference: `orders:${f.number}:earn`,
      reason: null,
      actor: SYSTEM,
      created_at: f.completed_at,
    });
  }
  for (const r of ctx.reviews) {
    if (r.author_name !== p.full_name || r.created_at.slice(0, 10) < s.reviewReward.effective_from)
      continue;
    out.push({
      id: `${p.id}-rv-${r.id}`,
      profile_id: p.id,
      kind: "review",
      points: s.reviewReward.points,
      reference: `reviews:${r.id}`,
      reason: null,
      actor: SYSTEM,
      created_at: r.created_at,
    });
  }
  const rule = s.referralRules.at(-1);
  for (const ref of s.referrals) {
    if (!s.rewarded.has(ref.id) || !rule) continue;
    if (ref.referrer_id === p.id || ref.referee_id === p.id) {
      out.push({
        id: `${p.id}-ref-${ref.id}`,
        profile_id: p.id,
        kind: "referral",
        points: ref.referrer_id === p.id ? rule.referrer_points : rule.referee_points,
        reference: `customers:referral:${ref.id}`,
        reason: null,
        actor: SYSTEM,
        created_at: ref.applied_at,
      });
    }
  }
  out.push(...s.entries.filter((e) => e.profile_id === p.id));
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function unitChain(units: readonly OrgUnit[], id: string): string[] {
  const out: string[] = [];
  let cur = units.find((u) => u.id === id);
  while (cur) {
    out.push(cur.id);
    const parent = cur.parent_id;
    cur = parent ? units.find((u) => u.id === parent) : undefined;
  }
  return out;
}

function build(
  ctx: Context,
  p: Base,
): CustomerProfile & { facts: OrderFact[]; entries: PointsEntry[] } {
  const facts = factsOf(ctx, p);
  const spent = spentOf(p, facts);
  const tier = tierFor(ctx.s.tiers, spent);
  const entries = entriesOf(ctx, p, facts, tier);
  const balance = Math.max(
    0,
    entries.reduce((sum, e) => sum + e.points, 0),
  );
  const first = p.earlier?.first_at ?? facts.at(-1)?.placed_at ?? null;
  // Lô đơn cũ hết hạn sau 12 tháng tính từ đơn đầu (cuối ngày giờ Việt Nam).
  const openingExpiry = p.earlier ? Date.parse(p.earlier.first_at) + 365 * DAY : 0;
  const expiring =
    p.earlier && openingExpiry > Date.now() && openingExpiry <= Date.now() + 30 * DAY
      ? Math.min(balance, Math.floor(p.earlier.amount / 10_000))
      : 0;
  const base: CustomerProfile = {
    id: p.id,
    org_id: p.org_id,
    org_name:
      p.org_id === ORG.ROOT
        ? "Chợ Bếp Mộc"
        : (ctx.s.units.find((u) => u.id === p.org_id)?.name ?? p.org_id),
    user_id: p.user_id,
    full_name: p.full_name,
    phone: p.phone,
    email: p.email,
    birthday: p.birthday,
    tags: p.tags,
    tier_code: tier,
    group_ids: [],
    total_spent: vnd(spent),
    orders_count: facts.length + (p.earlier?.count ?? 0),
    first_order_at: first,
    last_order_at: facts[0]?.placed_at ?? p.earlier?.first_at ?? null,
    points: { balance, held: 0, expiring_30d: expiring },
    marketing_consent: { email: p.consent && !p.withdrawn_at, withdrawn_at: p.withdrawn_at },
    referral_code: p.referral_code,
    source: p.source,
    referred_by: p.referred_by,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
  return { ...base, facts, entries };
}

/** Hồ sơ khớp quy tắc nhóm (hàm thuần của đặc tả 47; test kiểm). */
export function matchesRule(
  p: Pick<
    CustomerProfile,
    "total_spent" | "orders_count" | "last_order_at" | "tier_code" | "tags" | "org_id"
  >,
  rule: GroupRule,
  units: readonly OrgUnit[],
  now = Date.now(),
): boolean {
  if (rule.total_spent_min !== undefined && num(p.total_spent) < rule.total_spent_min) return false;
  if (rule.orders_count_min !== undefined && p.orders_count < rule.orders_count_min) return false;
  if (rule.last_order_within_days !== undefined) {
    if (!p.last_order_at || Date.parse(p.last_order_at) < now - rule.last_order_within_days * DAY)
      return false;
  }
  if (rule.tier_in && rule.tier_in.length > 0 && !rule.tier_in.includes(p.tier_code)) return false;
  if (rule.tags_any && rule.tags_any.length > 0) {
    const mine = p.tags.map((t) => t.toLowerCase());
    if (!rule.tags_any.some((t) => mine.includes(t.toLowerCase()))) return false;
  }
  if (rule.org_in && rule.org_in.length > 0) {
    const chain = unitChain(units, p.org_id);
    if (!rule.org_in.some((o) => chain.includes(o))) return false;
  }
  return true;
}

async function everyone(): Promise<{ ctx: Context; all: ReturnType<typeof build>[] }> {
  const ctx = await context();
  const all = ctx.s.profiles.map((p) => build(ctx, p));
  for (const g of ctx.s.groups) {
    for (const p of all) {
      const inGroup =
        g.kind === "manual"
          ? g.manual_ids.includes(p.id)
          : matchesRule(p, g.rule ?? {}, ctx.s.units);
      if (inGroup) p.group_ids.push(g.id);
    }
  }
  return { ctx, all };
}

const strip = (p: ReturnType<typeof build>): CustomerProfile => {
  const { facts: _f, entries: _e, ...rest } = p;
  return rest;
};

// ---------------------------------------------------------------- Hồ sơ

export type ProfileChip = "account" | "phone" | "gold";

export interface ProfileQuery {
  q?: string;
  chip?: ProfileChip | null;
  group?: string | null;
  limit?: number;
  cursor?: string | null;
}

// Thay bằng GET /api/v1/customers?q=&group_id=&tier=&tag= (bước 47) khi core có. Tìm theo tên (không
// dấu), SĐT (core chuẩn hoá rồi băm) hay email. Chi nhiều trước.
export async function listProfiles(query: ProfileQuery = {}): Promise<SamplePage<CustomerProfile>> {
  const { all } = await everyone();
  const needle = query.q ? fold(query.q) : "";
  const phone = query.q ? normalizePhone(query.q) : null;
  const rows = all
    .filter((p) =>
      !query.chip
        ? true
        : query.chip === "account"
          ? p.user_id !== null
          : query.chip === "phone"
            ? p.user_id === null
            : p.tier_code === "gold",
    )
    .filter((p) => !query.group || p.group_ids.includes(query.group))
    .filter((p) =>
      !needle
        ? true
        : phone
          ? p.phone === phone
          : fold(p.full_name).includes(needle) || (p.email ?? "").includes(needle),
    )
    .sort(
      (a, b) => num(b.total_spent) - num(a.total_spent) || a.full_name.localeCompare(b.full_name),
    )
    .map(strip);
  return samplePage(rows, { limit: query.limit ?? 25, cursor: query.cursor ?? null });
}

// Dự kiến (bước 51, số liệu tóm tắt): số ở đầu tab Hồ sơ khách.
export async function customerStats(): Promise<{
  profiles: number;
  with_account: number;
  phone_only: number;
  gold: number;
  repeat_rate_pct: number;
}> {
  const { all } = await everyone();
  const buyers = all.filter((p) => p.orders_count > 0);
  const repeat = buyers.filter(
    (p) =>
      p.orders_count >= 2 &&
      p.last_order_at &&
      Date.parse(p.last_order_at) >= Date.now() - 90 * DAY,
  );
  return {
    profiles: all.length,
    with_account: all.filter((p) => p.user_id).length,
    phone_only: all.filter((p) => !p.user_id).length,
    gold: all.filter((p) => p.tier_code === "gold").length,
    repeat_rate_pct: buyers.length ? Math.round((repeat.length / buyers.length) * 100) : 0,
  };
}

// Thay bằng GET /api/v1/customers/{id} + /{id}/orders + /{id}/notes + /{id}/points (bước 47) khi core có.
export async function getProfile(id: string): Promise<{ data: CustomerDetail } | null> {
  const { ctx, all } = await everyone();
  const p = all.find((x) => x.id === id);
  const base = ctx.s.profiles.find((x) => x.id === id);
  if (!p || !base) return null;
  return {
    data: {
      ...strip(p),
      orders: p.facts,
      earlier: base.earlier
        ? { count: base.earlier.count, amount: vnd(base.earlier.amount) }
        : null,
      notes: ctx.s.notes
        .filter((n) => n.profile_id === id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      entries: p.entries,
      account: ctx.s.accounts.find((a) => a.profile_id === id) ?? null,
    },
  };
}

/** Tên hồ sơ theo ID (để màn khác hiện tên người giới thiệu…). */
export async function profileNames(): Promise<Map<string, string>> {
  const s = await store();
  return new Map(s.profiles.map((p) => [p.id, p.full_name]));
}

// Thay bằng POST /api/v1/customers (bước 47): đăng ký tại quầy theo SĐT; trùng `phone_key` → 409 kèm hồ
// sơ có sẵn. Hồ sơ chưa thuộc tài khoản nào cho tới khi chủ số xác thực.
export async function createProfile(input: {
  phone: string;
  name: string;
  org_id: string;
}): Promise<SampleOutcome<CustomerProfile>> {
  const s = await store();
  const errors: NonNullable<Problem["errors"]>[number][] = [];
  const phone = normalizePhone(input.phone);
  if (!input.phone.trim()) errors.push(fieldError("phone", "required"));
  else if (!phone) errors.push(fieldError("phone", "customers.phone_invalid"));
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length > 80) errors.push(fieldError("name", "too_long"));
  const unit = s.units.find((u) => u.id === input.org_id && u.unit_type === "store");
  if (!unit) errors.push(fieldError("org_id", "unknown"));
  if (errors.length > 0) return invalid(errors);
  const taken = s.profiles.find((p) => p.phone === phone);
  if (taken) {
    return fail(409, "customers.phone_taken", "This phone number already has a customer profile.", [
      fieldError("phone", "customers.phone_taken", taken.full_name),
    ]);
  }
  s.seq += 1;
  const now = new Date().toISOString();
  const base: Base = {
    id: uid("81", 5000 + s.seq),
    org_id: unit?.id ?? ORG.Q3,
    user_id: null,
    full_name: name || "Khách tại quầy",
    phone,
    email: null,
    birthday: null,
    tags: [],
    consent: false,
    withdrawn_at: null,
    referral_code: referralCode(`${name}${s.seq}`),
    source: "store",
    referred_by: null,
    earlier: null,
    created_at: now,
    updated_at: now,
  };
  s.profiles.unshift(base);
  const ctx = await context();
  return { ok: true, data: strip(build(ctx, base)) };
}

// Thay bằng POST /api/v1/customers/{id}/notes (bước 47). Ghi chú là dữ liệu cá nhân (có trong bản xuất,
// xoá khi người mua xoá tài khoản).
export async function addNote(id: string, body: string): Promise<SampleOutcome<CustomerNote>> {
  const s = await store();
  const p = s.profiles.find((x) => x.id === id);
  if (!p) return notFound();
  const text = body.trim();
  if (!text) return invalid([fieldError("body", "required")]);
  if (text.length > 1000) return invalid([fieldError("body", "too_long")]);
  s.seq += 1;
  const note: CustomerNote = {
    id: uid("83", 100 + s.seq),
    profile_id: id,
    author: SAMPLE_ACTOR,
    body: text,
    created_at: new Date().toISOString(),
  };
  s.notes.push(note);
  p.updated_at = note.created_at;
  return { ok: true, data: note };
}

// Thay bằng PUT /api/v1/customers/{id} {tags} (bước 47, `If-Match`).
export async function setTags(id: string, text: string): Promise<SampleOutcome<string[]>> {
  const s = await store();
  const p = s.profiles.find((x) => x.id === id);
  if (!p) return notFound();
  const tags = parseTags(text);
  if (tags.length > 10) return invalid([fieldError("tags", "customers.too_many_tags")]);
  if (tags.some((t) => t.length > 30)) return invalid([fieldError("tags", "too_long")]);
  p.tags = tags;
  p.updated_at = new Date().toISOString();
  return { ok: true, data: tags };
}

// Thay bằng POST /api/v1/customers/{id}/points/adjustments (bước 47, `customers.loyalty.adjust`). Có
// `reference`: gửi lại cùng mã không cộng hai lần (D-184). Không làm số dư âm.
export async function adjustPoints(
  id: string,
  input: { points: string; reference: string; reason: string },
): Promise<SampleOutcome<{ entry: PointsEntry; replayed: boolean }>> {
  const { ctx, all } = await everyone();
  const s = ctx.s;
  const p = all.find((x) => x.id === id);
  if (!p) return notFound();
  const errors: NonNullable<Problem["errors"]>[number][] = [];
  const raw = input.points.replace(/\s/g, "").replace("−", "-");
  const points = /^[+-]?\d{1,6}$/.test(raw) ? Number(raw) : Number.NaN;
  if (!input.points.trim()) errors.push(fieldError("points", "required"));
  else if (!Number.isInteger(points) || points === 0)
    errors.push(fieldError("points", "customers.points_invalid"));
  const reference = input.reference.trim().toUpperCase();
  if (!reference) errors.push(fieldError("reference", "required"));
  else if (!/^[A-Z0-9][A-Z0-9-]{3,39}$/.test(reference))
    errors.push(fieldError("reference", "customers.reference_invalid"));
  const reason = input.reason.trim();
  if (!reason) errors.push(fieldError("reason", "required"));
  else if (reason.length > 300) errors.push(fieldError("reason", "too_long"));
  if (errors.length > 0) return invalid(errors);
  const replay = s.entries.find((e) => e.kind === "adjust" && e.reference === reference);
  if (replay) {
    if (replay.profile_id !== id || replay.points !== points) {
      return invalid([fieldError("reference", "customers.reference_used")]);
    }
    return { ok: true, data: { entry: replay, replayed: true } };
  }
  if (p.points.balance + points < 0) {
    return fail(
      409,
      "customers.insufficient_points",
      `Not enough points (available ${p.points.balance}, requested ${-points}).`,
      [fieldError("points", "customers.insufficient_points", String(p.points.balance))],
    );
  }
  s.seq += 1;
  const entry: PointsEntry = {
    id: uid("84", 100 + s.seq),
    profile_id: id,
    kind: "adjust",
    points,
    reference,
    reason,
    actor: SAMPLE_ACTOR,
    created_at: new Date().toISOString(),
  };
  s.entries.push(entry);
  return { ok: true, data: { entry, replayed: false } };
}

// ---------------------------------------------------------------- Tài khoản người mua (bước 34)

export type AccountChip = "active" | "locked" | "unverified";

// Thay bằng GET /api/v1/auth/customers?status= (bước 34) khi core có.
export async function listBuyerAccounts(
  chip: AccountChip | null = null,
): Promise<{ data: BuyerAccount[] }> {
  const s = await store();
  return {
    data: s.accounts
      .filter((a) => (!chip ? true : chip === "unverified" ? !a.phone_verified : a.status === chip))
      .sort((a, b) => (b.last_login_at ?? "").localeCompare(a.last_login_at ?? "")),
  };
}

// Thay bằng POST /api/v1/auth/customers/{id}/lock | /unlock (bước 34). Khoá thu hồi mọi phiên; đảo được.
export async function setAccountLocked(
  id: string,
  locked: boolean,
  reason = "",
): Promise<SampleOutcome<BuyerAccount>> {
  const s = await store();
  const a = s.accounts.find((x) => x.id === id);
  if (!a) return fail(404, "auth.customer_not_found", "Buyer account not found.");
  const now = new Date().toISOString();
  a.status = locked ? "locked" : "active";
  a.locked_by = locked ? SAMPLE_ACTOR : null;
  a.locked_at = locked ? now : null;
  a.lock_reason = locked ? reason.trim() || null : null;
  a.updated_at = now;
  return { ok: true, data: a };
}

// Thay bằng GET/PUT /api/v1/auth/settings `customer_registration` (bước 34).
export async function registrationOpen(): Promise<boolean> {
  return (await store()).registrationOpen;
}

export async function setRegistrationOpen(open: boolean): Promise<SampleOutcome<boolean>> {
  const s = await store();
  s.registrationOpen = open;
  return { ok: true, data: open };
}

// ---------------------------------------------------------------- Nhóm khách

// Thay bằng GET /api/v1/customers/groups (bước 47). Số thành viên là số đánh giá lại lúc đọc.
export async function listGroups(): Promise<{ data: CustomerGroup[] }> {
  const { ctx, all } = await everyone();
  return {
    data: ctx.s.groups.map((g) => ({
      ...g,
      member_count: all.filter((p) => p.group_ids.includes(g.id)).length,
    })),
  };
}

/** Đọc quy tắc từ các ô của form (ô trống = không xét); lỗi theo ô. */
export function readRule(input: {
  spent: string;
  orders: string;
  days: string;
  tier: string;
  org: string;
}): { ok: true; rule: GroupRule } | { ok: false; errors: NonNullable<Problem["errors"]> } {
  const errors: NonNullable<Problem["errors"]>[number][] = [];
  const rule: GroupRule = {};
  const num_ = (
    name: keyof typeof input,
    key: "total_spent_min" | "orders_count_min" | "last_order_within_days",
    max: number,
  ) => {
    const text = input[name].trim();
    if (!text) return;
    const n = wholeNumber(text, key === "total_spent_min" ? 0 : 1, max);
    if (n === null) errors.push(fieldError(name, "customers.rule_invalid"));
    else rule[key] = n;
  };
  num_("spent", "total_spent_min", 10_000_000_000);
  num_("orders", "orders_count_min", 1000);
  num_("days", "last_order_within_days", 3650);
  if (input.tier) {
    if (!["member", "silver", "gold"].includes(input.tier))
      errors.push(fieldError("tier", "unknown"));
    else rule.tier_in = [input.tier as TierCode];
  }
  if (input.org) rule.org_in = [input.org];
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, rule };
}

// Thay bằng GET /api/v1/customers/groups/{id}/preview (bước 47): số hồ sơ khớp, kèm số đã đồng ý nhận
// tin quảng cáo (dự kiến — dùng nhóm để tiếp thị phải lọc theo đồng ý).
export async function previewRule(
  rule: GroupRule,
): Promise<{ matched: number; consented: number }> {
  const { ctx, all } = await everyone();
  const hit = all.filter((p) => matchesRule(p, rule, ctx.s.units));
  return { matched: hit.length, consented: hit.filter((p) => p.marketing_consent.email).length };
}

// Thay bằng POST /api/v1/customers/groups | PUT /groups/{id} (bước 47).
export async function saveGroup(input: {
  id?: string;
  name: string;
  kind: string;
  rule: GroupRule | null;
}): Promise<SampleOutcome<CustomerGroup>> {
  const s = await store();
  const name = input.name.trim().replace(/\s+/g, " ");
  const errors: NonNullable<Problem["errors"]>[number][] = [];
  if (!name) errors.push(fieldError("name", "required"));
  else if (name.length > 60) errors.push(fieldError("name", "too_long"));
  if (input.kind !== "manual" && input.kind !== "rule") errors.push(fieldError("kind", "unknown"));
  if (input.kind === "rule" && (!input.rule || Object.keys(input.rule).length === 0)) {
    errors.push(fieldError("spent", "customers.rule_empty"));
  }
  if (errors.length > 0) return invalid(errors);
  const clash = s.groups.find(
    (g) => g.name.toLowerCase() === name.toLowerCase() && g.id !== input.id,
  );
  if (clash) {
    return fail(409, "customers.group_name_taken", `A group named ${name} already exists.`, [
      fieldError("name", "customers.group_name_taken", name),
    ]);
  }
  const now = new Date().toISOString();
  let g = input.id ? s.groups.find((x) => x.id === input.id) : undefined;
  if (input.id && !g) return fail(404, "customers.group_not_found", "Group not found.");
  if (g) {
    g.name = name;
    g.kind = input.kind as CustomerGroup["kind"];
    g.rule = input.kind === "rule" ? input.rule : null;
    g.updated_at = now;
    g.evaluated_at = now;
  } else {
    s.seq += 1;
    g = {
      id: uid("85", 100 + s.seq),
      name,
      kind: input.kind as CustomerGroup["kind"],
      rule: input.kind === "rule" ? input.rule : null,
      used_in: [],
      manual_ids: [],
      evaluated_at: now,
      created_at: now,
      updated_at: now,
    };
    s.groups.push(g);
  }
  const { data } = await listGroups();
  const out = data.find((x) => x.id === g?.id);
  return out ? { ok: true, data: out } : fail(404, "customers.group_not_found", "Group not found.");
}

// Thay bằng DELETE /api/v1/customers/groups/{id} (bước 47). Nhóm đang dùng ở bảng giá / khuyến mại thì
// không xoá được (dự kiến `customers.group_in_use`).
export async function deleteGroup(id: string): Promise<SampleOutcome<undefined>> {
  const s = await store();
  const g = s.groups.find((x) => x.id === id);
  if (!g) return fail(404, "customers.group_not_found", "Group not found.");
  if (g.used_in.length > 0) {
    return fail(409, "customers.group_in_use", `The group is used by ${g.used_in.join(", ")}.`);
  }
  s.groups = s.groups.filter((x) => x.id !== id);
  return { ok: true, data: undefined };
}

// Thay bằng POST/DELETE /api/v1/customers/groups/{id}/members/{profile_id} (bước 47). Đảo được.
export async function setGroupMember(
  groupId: string,
  profileId: string,
  member: boolean,
): Promise<SampleOutcome<CustomerGroup>> {
  const s = await store();
  const g = s.groups.find((x) => x.id === groupId);
  if (!g) return fail(404, "customers.group_not_found", "Group not found.");
  if (g.kind !== "manual")
    return fail(409, "customers.group_not_manual", "Only manual groups take members.");
  if (!s.profiles.some((p) => p.id === profileId)) return notFound();
  g.manual_ids = member
    ? [...new Set([...g.manual_ids, profileId])]
    : g.manual_ids.filter((x) => x !== profileId);
  g.updated_at = new Date().toISOString();
  const { data } = await listGroups();
  const out = data.find((x) => x.id === groupId);
  return out ? { ok: true, data: out } : fail(404, "customers.group_not_found", "Group not found.");
}

// ---------------------------------------------------------------- Điểm và hạng

// Thay bằng GET /api/v1/customers/loyalty/rules (bước 47).
export async function listLoyaltyRules(): Promise<{ data: LoyaltyRule[] }> {
  const s = await store();
  return {
    data: [...s.loyaltyRules].sort((a, b) => b.effective_from.localeCompare(a.effective_from)),
  };
}

// Thay bằng POST /api/v1/customers/loyalty/rules (bước 47): chỉ thêm; không thêm quy tắc hiệu lực trong
// quá khứ (`customers.rule_effective_in_past`); quy tắc trước tự đóng vào ngày trước đó.
export async function addLoyaltyRule(input: {
  earn: string;
  value: string;
  months: string;
  min: string;
  max_pct: string;
  from: string;
}): Promise<SampleOutcome<LoyaltyRule>> {
  const s = await store();
  const errors: NonNullable<Problem["errors"]>[number][] = [];
  const earn = wholeNumber(input.earn, 1000, 10_000_000);
  if (earn === null)
    errors.push(fieldError("earn", input.earn.trim() ? "number_invalid" : "required"));
  const value = wholeNumber(input.value, 1, 100_000);
  if (value === null)
    errors.push(fieldError("value", input.value.trim() ? "number_invalid" : "required"));
  const months = wholeNumber(input.months || "12", 1, 60);
  if (months === null) errors.push(fieldError("months", "number_invalid"));
  const min = wholeNumber(input.min || "100", 0, 1_000_000);
  if (min === null) errors.push(fieldError("min", "number_invalid"));
  const maxPct = wholeNumber(input.max_pct || "30", 1, 100);
  if (maxPct === null) errors.push(fieldError("max_pct", "number_invalid"));
  const from = parseDay(input.from);
  if (!from) errors.push(fieldError("from", input.from.trim() ? "date_invalid" : "required"));
  else if (from <= today()) errors.push(fieldError("from", "customers.rule_effective_in_past"));
  if (errors.length > 0) return invalid(errors);
  s.seq += 1;
  const rule: LoyaltyRule = {
    id: uid("86", 100 + s.seq),
    earn_per_minor: earn ?? 10_000,
    points_per_unit: 1,
    point_value_minor: value ?? 100,
    points_valid_months: months ?? 12,
    min_redeem_points: min ?? 100,
    max_redeem_ratio_bp: (maxPct ?? 30) * 100,
    category_multipliers: [],
    effective_from: from ?? today(),
    effective_to: null,
    created_by: SAMPLE_ACTOR,
    created_at: new Date().toISOString(),
  };
  // Cùng ngày hiệu lực: dòng mới thay dòng chưa hiệu lực (dòng đã hiệu lực không bao giờ sửa).
  s.loyaltyRules = closeChain([
    ...s.loyaltyRules.filter((r) => r.effective_from !== rule.effective_from),
    { ...rule },
  ]);
  return { ok: true, data: rule };
}

export interface LoyaltyStats {
  outstanding_points: number;
  holders: number;
  liability: Money;
  expiring_30d: number;
  held: number;
  point_value: Money;
  tiers: {
    code: TierCode;
    threshold: Money;
    earn_multiplier_bp: number;
    group_id: string | null;
    count: number;
  }[];
  adjustments: (PointsEntry & { profile_name: string })[];
  review: ReviewRewardRule & { rewarded: number; low_star_rewarded: number };
}

// Dự kiến: GET /api/v1/customers/loyalty/summary (bước 47) — số dư điểm, nghĩa vụ trong sổ cái
// (điểm × giá trị lúc tích), sắp hết hạn, hạng.
export async function loyaltyStats(): Promise<LoyaltyStats> {
  const { ctx, all } = await everyone();
  const s = ctx.s;
  const value = pointsValue(s);
  const outstanding = all.reduce((sum, p) => sum + p.points.balance, 0);
  const reviews = ctx.reviews.filter(
    (r) =>
      r.created_at.slice(0, 10) >= s.reviewReward.effective_from &&
      all.some((p) => p.full_name === r.author_name),
  );
  return {
    outstanding_points: outstanding,
    holders: all.filter((p) => p.points.balance > 0).length,
    liability: vnd(outstanding * value),
    expiring_30d: all.reduce((sum, p) => sum + p.points.expiring_30d, 0),
    held: 0,
    point_value: vnd(value),
    tiers: s.tiers.map((t) => ({
      code: t.code,
      threshold: t.threshold,
      earn_multiplier_bp: t.earn_multiplier_bp,
      group_id: t.group_id,
      count: all.filter((p) => p.tier_code === t.code).length,
    })),
    adjustments: s.entries
      .filter((e) => e.kind === "adjust")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((e) => ({
        ...e,
        profile_name: all.find((p) => p.id === e.profile_id)?.full_name ?? "",
      })),
    review: {
      ...s.reviewReward,
      rewarded: reviews.length,
      low_star_rewarded: reviews.filter((r) => r.rating <= 2).length,
    },
  };
}

// ---------------------------------------------------------------- Nhắc giỏ bỏ dở (quy tắc)

// Thay bằng GET /api/v1/customers/reminder-rules (bước 47). Danh sách giỏ là của `orders` (màn Đơn hàng).
export async function listReminderRules(): Promise<{ data: ReminderRule[] }> {
  const s = await store();
  return {
    data: [...s.reminderRules].sort((a, b) => b.effective_from.localeCompare(a.effective_from)),
  };
}

// Thay bằng POST /api/v1/customers/reminder-rules (bước 47): có hiệu lực từ ngày mai; giỏ đã lên lịch giữ
// lịch cũ.
export async function addReminderRule(input: {
  enabled: boolean;
  delays: string;
  channel: string;
}): Promise<SampleOutcome<ReminderRule>> {
  const s = await store();
  const errors: NonNullable<Problem["errors"]>[number][] = [];
  const delays = parseDelays(input.delays);
  if (!input.delays.trim()) errors.push(fieldError("delays", "required"));
  else if (!delays) errors.push(fieldError("delays", "customers.delays_invalid"));
  if (input.channel !== "email" && input.channel !== "sms")
    errors.push(fieldError("channel", "unknown"));
  if (errors.length > 0) return invalid(errors);
  s.seq += 1;
  const rule: ReminderRule = {
    id: uid("87", 100 + s.seq),
    enabled: input.enabled,
    delays_minutes: delays ?? [60],
    channel: input.channel as ReminderRule["channel"],
    effective_from: addDays(today(), 1),
    effective_to: null,
  };
  s.reminderRules = closeChain([
    ...s.reminderRules.filter((r) => r.effective_from !== rule.effective_from),
    rule,
  ]);
  return { ok: true, data: rule };
}

// ---------------------------------------------------------------- Giới thiệu bạn

// Thay bằng GET /api/v1/customers/referrals (dự kiến; đặc tả 47 chỉ có `GET /me/referral`) — danh sách
// cho nhân viên. Trạng thái tính từ đơn đầu của người được giới thiệu.
export async function listReferrals(): Promise<{ data: Referral[] }> {
  const { ctx, all } = await everyone();
  const rule = ctx.s.referralRules.at(-1);
  return {
    data: ctx.s.referrals.map((r) => {
      const referrer = all.find((p) => p.id === r.referrer_id);
      const referee = all.find((p) => p.id === r.referee_id);
      const first = referee?.facts.at(-1) ?? null;
      const order = first ? ctx.orders.find((o) => o.id === first.order_id) : undefined;
      const status: ReferralStatus = r.reason
        ? "rejected"
        : ctx.s.rewarded.has(r.id)
          ? "rewarded"
          : first?.status === "completed" && num(first.net) >= num(rule?.min_first_order)
            ? "qualified"
            : "pending";
      return {
        ...r,
        referrer_name: referrer?.full_name ?? "",
        referrer_code: referrer?.referral_code ?? "",
        status,
        first_order: order
          ? { id: order.id, number: order.number, status: order.status, total: order.total }
          : null,
      };
    }),
  };
}

// Thay bằng GET /api/v1/customers/referral-rules (bước 47).
export async function listReferralRules(): Promise<{ data: ReferralRule[] }> {
  const s = await store();
  return {
    data: [...s.referralRules].sort((a, b) => b.effective_from.localeCompare(a.effective_from)),
  };
}

// Thay bằng POST /api/v1/customers/referral-rules (bước 47): dữ liệu có ngày hiệu lực, công khai cho người
// mua (Luật 19/2023).
export async function addReferralRule(input: {
  referrer: string;
  referee: string;
  min: string;
  from: string;
}): Promise<SampleOutcome<ReferralRule>> {
  const s = await store();
  const errors: NonNullable<Problem["errors"]>[number][] = [];
  const a = wholeNumber(input.referrer, 0, 100_000);
  if (a === null)
    errors.push(fieldError("referrer", input.referrer.trim() ? "number_invalid" : "required"));
  const b = wholeNumber(input.referee, 0, 100_000);
  if (b === null)
    errors.push(fieldError("referee", input.referee.trim() ? "number_invalid" : "required"));
  const min = wholeNumber(input.min || "0", 0, 100_000_000);
  if (min === null) errors.push(fieldError("min", "number_invalid"));
  const from = parseDay(input.from);
  if (!from) errors.push(fieldError("from", input.from.trim() ? "date_invalid" : "required"));
  else if (from <= today()) errors.push(fieldError("from", "customers.rule_effective_in_past"));
  if (errors.length > 0) return invalid(errors);
  s.seq += 1;
  const rule: ReferralRule = {
    id: uid("88", 100 + s.seq),
    referrer_points: a ?? 0,
    referee_points: b ?? 0,
    min_first_order: vnd(min ?? 0),
    apply_days: 14,
    effective_from: from ?? today(),
    effective_to: null,
  };
  s.referralRules = closeChain([
    ...s.referralRules.filter((r) => r.effective_from !== rule.effective_from),
    rule,
  ]);
  return { ok: true, data: rule };
}

// ---------------------------------------------------------------- Rủi ro COD (bước 45)

/** Đơn COD tính vào thống kê: không gồm đơn kênh bán ngoài (SĐT do kênh che, đặc tả 48). */
function codOrder(o: Order): boolean {
  return o.payment_method === "cod" && o.funds_flow !== "channel_collect";
}

function refusedOf(o: Order): boolean {
  return o.status === "cancelled" && o.history.some((h) => h.to === "shipping");
}

// Dự kiến (bước 45, `orders.risk`): số liệu COD 30 ngày.
export async function codStats(): Promise<{
  cod_orders: number;
  failed: number;
  fail_ratio_pct: number;
  active_rules: number;
  scheduled_rules: number;
  blocked: number;
}> {
  const [s, { orders }] = await Promise.all([store(), ordersState()]);
  const since = Date.now() - 30 * DAY;
  const cod = orders.filter((o) => codOrder(o) && Date.parse(o.placed_at) >= since);
  const failed = cod.filter((o) => o.status === "delivery_failed" || refusedOf(o)).length;
  return {
    cod_orders: cod.length,
    failed,
    fail_ratio_pct: cod.length ? Math.round((failed / cod.length) * 1000) / 10 : 0,
    active_rules: s.codRules.filter((r) => ruleState(r.effective_from, r.effective_to) === "active")
      .length,
    scheduled_rules: s.codRules.filter(
      (r) => ruleState(r.effective_from, r.effective_to) === "scheduled",
    ).length,
    blocked: s.codBlocks.filter((b) => blockState(b) === "blocked").length,
  };
}

export function blockState(b: Pick<CodBlock, "lifted_at" | "until">, day = today()): CodBlockState {
  if (b.lifted_at) return "lifted";
  return b.until < day ? "expired" : "blocked";
}

// Dự kiến: GET /api/v1/orders/risk/rules (bước 45).
export async function listCodRules(): Promise<{ data: CodRule[] }> {
  const s = await store();
  return { data: [...s.codRules].sort((a, b) => b.effective_from.localeCompare(a.effective_from)) };
}

// Dự kiến: POST /api/v1/orders/risk/rules (bước 45, `orders.risk.manage`).
export async function addCodRule(input: {
  min: string;
  ratio: string;
  action: string;
  from: string;
}): Promise<SampleOutcome<CodRule>> {
  const s = await store();
  const errors: NonNullable<Problem["errors"]>[number][] = [];
  const min = wholeNumber(input.min, 1, 100);
  if (min === null)
    errors.push(fieldError("min", input.min.trim() ? "number_invalid" : "required"));
  const ratio = wholeNumber(input.ratio, 1, 100);
  if (ratio === null)
    errors.push(fieldError("ratio", input.ratio.trim() ? "number_invalid" : "required"));
  if (input.action !== "require_prepayment" && input.action !== "no_cod")
    errors.push(fieldError("action", "unknown"));
  const from = parseDay(input.from);
  if (!from) errors.push(fieldError("from", input.from.trim() ? "date_invalid" : "required"));
  else if (from <= today()) errors.push(fieldError("from", "customers.rule_effective_in_past"));
  if (errors.length > 0) return invalid(errors);
  s.seq += 1;
  // Quy tắc theo tỉ lệ thất bại đang hiệu lực tự đóng vào ngày trước ngày hiệu lực mới.
  const current = s.codRules.find(
    (r) => r.kind === "fail_ratio" && !r.effective_to && r.effective_from < (from ?? ""),
  );
  if (current) current.effective_to = addDays(from ?? today(), -1);
  const rule: CodRule = {
    id: uid("8b", 100 + s.seq),
    kind: "fail_ratio",
    min_orders: min ?? 2,
    max_fail_ratio_pct: ratio ?? 50,
    order_total_min: null,
    org_id: ORG.ROOT,
    org_name: "Toàn chuỗi",
    action: input.action as CodAction,
    effective_from: from ?? today(),
    effective_to: null,
  };
  s.codRules.push(rule);
  return { ok: true, data: rule };
}

// Dự kiến: POST /api/v1/orders/risk/lookup {phone} (bước 45): số được chuẩn hoá và băm; không lưu số tra.
export async function lookupBuyer(phoneText: string): Promise<SampleOutcome<CodLookup>> {
  const phone = normalizePhone(phoneText);
  if (!phoneText.trim()) return invalid([fieldError("phone", "required")]);
  if (!phone) return invalid([fieldError("phone", "customers.phone_invalid")]);
  const [s, { orders }] = await Promise.all([store(), ordersState()]);
  const profile = s.profiles.find((p) => p.phone === phone);
  const mine = profile
    ? orders.filter((o) => codOrder(o) && o.buyer.name === profile.full_name)
    : [];
  const delivered = mine.filter((o) => o.status === "delivered" || o.status === "completed").length;
  const failed = mine.filter((o) => o.status === "delivery_failed").length;
  const refused = mine.filter(refusedOf).length;
  const decided = delivered + failed + refused;
  const ratio = decided ? Math.round(((failed + refused) / decided) * 1000) / 10 : 0;
  const rule =
    s.codRules.find(
      (r) =>
        r.kind === "fail_ratio" &&
        ruleState(r.effective_from, r.effective_to) === "active" &&
        decided >= r.min_orders &&
        ratio > r.max_fail_ratio_pct,
    ) ?? null;
  const blocked = s.codBlocks.find((b) => b.phone === phone && blockState(b) === "blocked") ?? null;
  return {
    ok: true,
    data: {
      found: profile !== undefined,
      delivered,
      failed,
      refused,
      fail_ratio_pct: ratio,
      rule,
      blocked,
    },
  };
}

export type BlockChip = CodBlockState;

// Dự kiến: GET /api/v1/orders/risk/blocks (bước 45).
export async function listCodBlocks(chip: BlockChip | null = null): Promise<{ data: CodBlock[] }> {
  const s = await store();
  return {
    data: s.codBlocks
      .filter((b) => !chip || blockState(b) === chip)
      .sort((a, b) => b.blocked_at.localeCompare(a.blocked_at)),
  };
}

// Dự kiến: POST /api/v1/orders/risk/blocks (bước 45): chặn luôn có hạn và lý do; người bị chặn vẫn mua
// được nếu trả trước.
export async function blockPhone(input: {
  phone: string;
  reason: string;
  until: string;
  note: string;
}): Promise<SampleOutcome<CodBlock>> {
  const s = await store();
  const errors: NonNullable<Problem["errors"]>[number][] = [];
  const phone = normalizePhone(input.phone);
  if (!input.phone.trim()) errors.push(fieldError("phone", "required"));
  else if (!phone) errors.push(fieldError("phone", "customers.phone_invalid"));
  if (!(COD_BLOCK_REASONS as readonly string[]).includes(input.reason))
    errors.push(fieldError("reason", "unknown"));
  const until = parseDay(input.until);
  if (!until) errors.push(fieldError("until", input.until.trim() ? "date_invalid" : "required"));
  else if (until <= today()) errors.push(fieldError("until", "customers.block_until_past"));
  else if (until > addDays(today(), 365))
    errors.push(fieldError("until", "customers.block_too_long"));
  const note = input.note.trim();
  if (!note) errors.push(fieldError("note", "required"));
  else if (note.length > 300) errors.push(fieldError("note", "too_long"));
  if (errors.length > 0) return invalid(errors);
  if (s.codBlocks.some((b) => b.phone === phone && blockState(b) === "blocked")) {
    return invalid([fieldError("phone", "customers.already_blocked")]);
  }
  const { orders } = await ordersState();
  const profile = s.profiles.find((p) => p.phone === phone);
  s.seq += 1;
  const now = new Date().toISOString();
  const block: CodBlock = {
    id: uid("8a", 100 + s.seq),
    phone: phone ?? "",
    cod_orders: profile
      ? orders.filter((o) => codOrder(o) && o.buyer.name === profile.full_name).length
      : 0,
    reason: input.reason as CodBlockReason,
    note,
    until: until ?? today(),
    blocked_by: SAMPLE_ACTOR,
    blocked_at: now,
    lifted_at: null,
    updated_at: now,
  };
  s.codBlocks.unshift(block);
  return { ok: true, data: block };
}

// Dự kiến: POST /api/v1/orders/risk/blocks/{id}/lift (bước 45). Đảo được (`lifted = false` khôi phục).
export async function setBlockLifted(
  id: string,
  lifted: boolean,
): Promise<SampleOutcome<CodBlock>> {
  const s = await store();
  const b = s.codBlocks.find((x) => x.id === id);
  if (!b) return fail(404, "orders.risk_block_not_found", "Block not found.");
  b.lifted_at = lifted ? new Date().toISOString() : null;
  b.updated_at = new Date().toISOString();
  return { ok: true, data: b };
}

/** Các nút "Áp ở" cho quy tắc nhóm (toàn chuỗi, miền, cửa hàng). */
export async function groupOrgOptions(): Promise<OrgUnit[]> {
  const s = await store();
  return s.units.filter((u) => u.unit_type === "region" || u.unit_type === "store");
}
