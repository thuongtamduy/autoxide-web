// Dữ liệu mẫu của màn "Tiếp thị liên kết" (module `affiliate` của core, bước 49, chưa có). Màn dựng hoàn
// toàn bằng file này (W-006, W-019). Hình dạng theo đặc tả `docs/steps/49-affiliate.md` của core (mục
// "Người tiếp thị", "Ghi nhận đơn", "Hoa hồng", "Chi trả và khấu trừ thuế", "Phiên livestream", "Bảng dữ
// liệu", "API REST", "Mã lỗi"); trường đặc tả chưa có ghi "dự kiến" và nằm trong bảng chỗ thiếu API.
//
// Một bộ dữ liệu cho cả ứng dụng: đơn được ghi nhận cho người tiếp thị là đơn web thật của
// `sample/orders.ts` (bảng `affiliate_attributions` thuộc module này, khoá theo đơn); hoa hồng tính trên
// từng dòng đơn (tiền sau giảm, chưa thuế — giá và thuế chụp trong dòng đơn), trạng thái đi theo trạng
// thái đơn; quy tắc tra theo ngày đặt; khấu trừ thuế TNCN theo bảng dữ liệu thuế có ngày hiệu lực
// (không viết số trong logic). Sản phẩm, giá gắn vào phiên livestream lấy từ `sample/catalog.ts`.
//
// Tiền hoa hồng là tiền của chính cửa hàng: chi qua đối tác chi có giấy phép hoặc kế toán tự chuyển khoản
// rồi ghi mã giao dịch (D-187). Tài khoản nhận tiền, mã số thuế nằm ở kho secret — không bao giờ ở đây.
// Tên người tiếp thị là mẫu (miền `example.com`). Giờ lưu UTC.
import type { Problem } from "@autoxide/sdk";
import {
  allVariants,
  CATEGORY_ID,
  listCategories,
  type Money,
  ORG,
  pricesAt,
  type Ref,
  variantByCode,
} from "./catalog";
import { num, type Order, ordersState, priceCart, vnd } from "./orders";
import { listUnits } from "./org";
import { vietnamDay } from "./tax";

export type SampleOutcome<T> = { ok: true; data: T } | { ok: false; problem: Problem };

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;

// ---------------------------------------------------------------- Kiểu theo đặc tả bước 49

export type PartnerStatus =
  | "pending_verification"
  | "pending_review"
  | "active"
  | "suspended"
  | "terminated";
export type PartnerRole = "affiliate" | "livestreamer";
export type TaxSubject =
  | "individual_resident"
  | "individual_non_resident"
  | "household_business"
  | "enterprise";

/** Xác thực danh tính theo mục đích (bước 37): có hạn. */
export interface KycPurpose {
  verified_at: string;
  expires_at: string;
}

export interface Partner {
  id: string;
  user_id: string;
  name: string;
  email: string;
  roles: PartnerRole[];
  status: PartnerStatus;
  status_reason: string | null;
  code: string;
  tax_subject: TaxSubject;
  /** Đã khai mã số thuế (giá trị ở kho secret, không trả). */
  tax_code_set: boolean;
  /** Năm có cam kết thu nhập dưới ngưỡng (mẫu của cơ quan thuế). */
  commitment_year: number | null;
  /** Đã khai tài khoản nhận tiền (kho secret, không hiện số). */
  payout_account_set: boolean;
  /** Dự kiến: tóm tắt KYC của bước 37 theo mục đích. */
  kyc: { affiliate: KycPurpose | null; livestream: KycPurpose | null; phone_verified: boolean };
  terms_version: number | null;
  /** Hoa hồng đã duyệt chưa chi (dự kiến, giữ khi tạm khoá). */
  approved_unpaid: Money;
  created_at: string;
  activated_at: string | null;
  updated_at: string;
}

export type RuleScope = "product" | "category" | "default";

export interface CommissionRule {
  id: string;
  scope: RuleScope;
  target_id: string | null;
  target_name: string | null;
  partner_id: string | null;
  partner_name: string | null;
  rate_bp: number;
  cap: Money | null;
  priority: number;
  note: string | null;
  effective_from: string;
  effective_to: string | null;
  created_by: Ref;
  created_at: string;
}

export type CommissionStatus = "pending" | "void" | "approved" | "paid";
export type AttributionSource = "live" | "click" | "code";

export interface Commission {
  id: string;
  order_id: string;
  order_number: string;
  order_status: string;
  order_line_id: string;
  product_name: string;
  partner_id: string;
  partner_name: string;
  source: AttributionSource;
  live_session_id: string | null;
  rule_id: string;
  rule_label: string;
  rate_bp: number;
  capped: boolean;
  base: Money;
  amount: Money;
  status: CommissionStatus;
  placed_at: string;
  approved_at: string | null;
  payout_id: string | null;
}

export interface Adjustment {
  id: string;
  partner_id: string;
  partner_name: string;
  order_number: string;
  amount: Money;
  reason: string;
  payout_id: string | null;
  created_at: string;
}

export type PayoutStatus = "building" | "sent" | "paid" | "failed" | "cancelled";

/** Ảnh chụp tỉ lệ và ngưỡng khấu trừ lúc chi (đặc tả 49: `withholding` text). */
export interface Withholding {
  rule_id: string | null;
  rate_bp: number;
  threshold: Money | null;
  basis: string;
}

export interface Payout {
  id: string;
  partner_id: string;
  partner_name: string;
  tax_subject: TaxSubject;
  period_from: string;
  period_to: string;
  /** Hoa hồng của đơn trước khi có bộ mẫu (dự kiến hiện như một dòng). */
  carried: Money;
  commission_count: number;
  commissions_total: Money;
  adjustments_total: Money;
  gross: Money;
  withheld: Money;
  withholding: Withholding;
  net: Money;
  mode: "gateway" | "manual";
  status: PayoutStatus;
  reference: string;
  bank_reference_set: boolean;
  invoice_number_set: boolean;
  error: string | null;
  certificate_issued_at: string | null;
  sent_at: string | null;
  paid_at: string | null;
}

/** Dữ liệu thuế TNCN khấu trừ thay (của `tax`, gói "vn"): có ngày hiệu lực, cần đối chiếu. */
export interface PitRule {
  id: string;
  subject: TaxSubject | "commitment";
  rate_bp: number;
  threshold: Money | null;
  basis: string;
  verify: boolean;
  effective_from: string;
  effective_to: string | null;
}

export interface Program {
  attribution_days: number;
  live_grace_minutes: number;
  precedence: AttributionSource[];
  commission_base: "net_excl_tax" | "net_incl_tax";
  auto_approve: boolean;
  payout_schedule: "monthly";
  min_payout: Money;
  payout_mode: "manual" | "gateway";
  terms_version: number;
  updated_at: string;
}

export type LivePlatform = "own" | "facebook" | "tiktok" | "youtube" | "zalo" | "other";
export type SessionStatus = "scheduled" | "live" | "ended";

export interface LiveProduct {
  variant_id: string;
  sku: string;
  name: string;
  price_shown: Money;
  promotion_code: string | null;
  pinned_at: string;
  unpinned_at: string | null;
}

export interface LiveLogEntry {
  at: string;
  kind: "started" | "pinned" | "unpinned" | "price_announced" | "ended" | "reported";
  details: string;
  actor: string;
}

export interface LiveSession {
  id: string;
  org_id: string;
  org_name: string;
  title: string;
  host_partner_id: string | null;
  host_name: string;
  host_kind: "partner" | "staff";
  platform: LivePlatform;
  status: SessionStatus;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  products: LiveProduct[];
  log: LiveLogEntry[];
  /** Báo cáo phiên (dự kiến `GET /live-sessions/{id}/report`). */
  report: {
    orders: number;
    revenue: Money;
    commission: Money;
    lines: { sku: string; name: string; quantity: number; revenue: Money }[];
  };
  updated_at: string;
}

export interface PartnerLink {
  id: string;
  partner_id: string;
  code: string;
  target_kind: "product" | "category" | "store";
  target_name: string;
  landing_path: string;
  clicks_30d: number;
  orders: number;
  created_at: string;
  disabled_at: string | null;
}

// ---------------------------------------------------------------- Đồ dùng chung

const uid = (kind: string, n: number) =>
  `01a1e000-0000-7000-8000-${kind}${String(n).padStart(10, "0")}`;

export const SAMPLE_ACTOR: Ref = { id: "01a1e000-0000-7000-8000-000000000f99", name: "Bạn" };
const MAI: Ref = { id: "01a1e000-0000-7000-8000-000000000f01", name: "Ngô Mai" };

export const PARTNER_ID = {
  mebo: uid("91", 1),
  hang: uid("91", 2),
  minh: uid("91", 3),
  bepxanh: uid("91", 4),
  mocan: uid("91", 5),
  tuan: uid("91", 6),
  lanchi: uid("91", 7),
} as const;

/** Người tiếp thị mà màn "Góc người tiếp thị" xem thử (đăng nhập bằng `affiliate.partner`). */
export const PORTAL_PARTNER = PARTNER_ID.hang;

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

const partnerNotFound = () =>
  fail(404, "affiliate.partner_not_found", "Affiliate partner not found.");

function today(): string {
  return vietnamDay();
}

function addDays(day: string, n: number): string {
  return vietnamDay(Date.parse(`${day}T12:00:00+07:00`) + n * DAY);
}

function parseDay(text: string): string | null {
  const t = text.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(`${t}T00:00:00Z`)) ? t : null;
}

function wholeNumber(text: string, min: number, max: number): number | null {
  const clean = text.replace(/[\s.,₫%]/g, "");
  if (!/^\d{1,12}$/.test(clean)) return null;
  const n = Number(clean);
  return n >= min && n <= max ? n : null;
}

/** Tỉ lệ phần trăm gõ tay ("8", "7,5") → phần vạn. */
function percentBp(text: string, max: number): number | null {
  const m = /^(\d{1,2})(?:[.,](\d{1,2}))?$/.exec(text.trim().replace("%", ""));
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
  return bp > 0 && bp <= max ? bp : null;
}

export function ruleStateOf(
  r: Pick<CommissionRule, "effective_from" | "effective_to">,
  day = today(),
) {
  if (r.effective_from > day) return "scheduled" as const;
  if (r.effective_to && r.effective_to < day) return "closed" as const;
  return "active" as const;
}

/** Khấu trừ TNCN của một lần chi theo dữ liệu thuế hiệu lực ngày chi (hàm thuần; test kiểm). */
export function withholdingFor(
  rules: readonly PitRule[],
  subject: TaxSubject,
  hasCommitment: boolean,
  gross: number,
  day: string,
): { withheld: number; snapshot: Withholding } {
  const effective = (r: PitRule) =>
    r.effective_from <= day && (!r.effective_to || r.effective_to >= day);
  const rule =
    (hasCommitment ? rules.find((r) => r.subject === "commitment" && effective(r)) : undefined) ??
    rules.find((r) => r.subject === subject && effective(r));
  if (!rule || gross <= 0) {
    return {
      withheld: 0,
      snapshot: {
        rule_id: rule?.id ?? null,
        rate_bp: 0,
        threshold: null,
        basis: rule?.basis ?? "",
      },
    };
  }
  const applies = rule.threshold === null || gross >= num(rule.threshold);
  return {
    withheld: applies ? Math.round((gross * rule.rate_bp) / 10_000) : 0,
    snapshot: {
      rule_id: rule.id,
      rate_bp: applies ? rule.rate_bp : 0,
      threshold: rule.threshold,
      basis: rule.basis,
    },
  };
}

// ---------------------------------------------------------------- Kho trong bộ nhớ

interface Attribution {
  order_id: string;
  partner_id: string;
  source: AttributionSource;
  link_id: string | null;
  live_session_id: string | null;
}

interface PayoutRow {
  id: string;
  partner_id: string;
  period_from: string;
  period_to: string;
  carried: number;
  mode: Payout["mode"];
  status: PayoutStatus;
  bank_reference: string | null;
  invoice_number: string | null;
  error: string | null;
  certificate_issued_at: string | null;
  sent_at: string | null;
  paid_at: string | null;
}

interface Store {
  partners: Omit<Partner, "approved_unpaid">[];
  rules: Omit<CommissionRule, "target_name" | "partner_name">[];
  attributions: Attribution[];
  adjustments: Omit<Adjustment, "partner_name">[];
  payouts: PayoutRow[];
  /** Lần chi trước kỳ tháng 10 trong năm (dự kiến, cho bảng tổng hợp năm): người → [gộp gross, thuế]. */
  earlierPaid: Map<string, { count: number; gross: number; withheld: number }>;
  pit: PitRule[];
  program: Program;
  sessions: Omit<LiveSession, "report" | "host_name" | "org_name">[];
  links: Omit<PartnerLink, "orders">[];
  seq: number;
}

function kyc(daysAgo: number, monthsLeft: number): KycPurpose {
  const now = Date.now();
  return {
    verified_at: new Date(now - daysAgo * DAY).toISOString(),
    expires_at: new Date(now + monthsLeft * 30 * DAY).toISOString(),
  };
}

/** Kỳ chi tháng trước (giờ Việt Nam). */
function lastMonth(): { from: string; to: string } {
  const [y, m] = today().split("-").map(Number) as [number, number];
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const from = `${py}-${String(pm).padStart(2, "0")}-01`;
  const to = addDays(`${y}-${String(m).padStart(2, "0")}-01`, -1);
  return { from, to };
}

async function seed(): Promise<Store> {
  const { orders } = await ordersState();
  const now = Date.now();
  const iso = (t: number) => new Date(t).toISOString();
  const partner = (
    id: string,
    name: string,
    roles: PartnerRole[],
    code: string,
    status: PartnerStatus,
    tax: TaxSubject,
    k: Partner["kyc"],
    extra: Partial<Omit<Partner, "approved_unpaid">> = {},
  ): Omit<Partner, "approved_unpaid"> => ({
    id,
    user_id: id.replace("-8000-91", "-8000-90"),
    name,
    email: `${code.toLowerCase()}@example.com`,
    roles,
    status,
    status_reason: null,
    code,
    tax_subject: tax,
    tax_code_set: tax !== "individual_resident" || code === "NAUMINH",
    commitment_year: null,
    payout_account_set: status !== "pending_verification",
    kyc: k,
    terms_version: 2,
    created_at: iso(now - 120 * DAY),
    activated_at: status === "active" || status === "suspended" ? iso(now - 110 * DAY) : null,
    updated_at: iso(now - 20 * DAY),
    ...extra,
  });
  const partners = [
    partner(
      PARTNER_ID.mebo,
      "Mẹ Bơ Review",
      ["affiliate"],
      "MEBO",
      "pending_review",
      "individual_resident",
      {
        affiliate: kyc(4, 12),
        livestream: null,
        phone_verified: true,
      },
      { created_at: iso(now - 4 * DAY), updated_at: iso(now - 4 * DAY) },
    ),
    partner(
      PARTNER_ID.hang,
      "Hằng Bếp Vui",
      ["affiliate", "livestreamer"],
      "HANGBEP",
      "active",
      "individual_resident",
      {
        affiliate: kyc(60, 10),
        livestream: kyc(60, 10),
        phone_verified: true,
      },
    ),
    partner(
      PARTNER_ID.minh,
      "Nấu Cùng Minh",
      ["affiliate"],
      "NAUMINH",
      "active",
      "individual_resident",
      {
        affiliate: kyc(90, 4),
        livestream: null,
        phone_verified: true,
      },
    ),
    partner(
      PARTNER_ID.bepxanh,
      "Studio Bếp Xanh",
      ["affiliate"],
      "BEPXANH",
      "active",
      "household_business",
      {
        affiliate: kyc(80, 7),
        livestream: null,
        phone_verified: true,
      },
    ),
    partner(
      PARTNER_ID.mocan,
      "Truyền thông Mộc An",
      ["livestreamer"],
      "MOCAN",
      "active",
      "enterprise",
      {
        affiliate: null,
        livestream: kyc(70, 9),
        phone_verified: true,
      },
    ),
    partner(
      PARTNER_ID.tuan,
      "Tuấn Ăn Gì",
      ["livestreamer"],
      "TUANANGI",
      "pending_verification",
      "individual_resident",
      {
        affiliate: null,
        livestream: kyc(3, 12),
        phone_verified: false,
      },
      { created_at: iso(now - 3 * DAY), updated_at: iso(now - 3 * DAY) },
    ),
    partner(
      PARTNER_ID.lanchi,
      "Lan Chi Kitchen",
      ["affiliate"],
      "LANCHI",
      "suspended",
      "individual_resident",
      {
        affiliate: { verified_at: iso(now - 380 * DAY), expires_at: iso(now - 14 * DAY) },
        livestream: null,
        phone_verified: true,
      },
      { status_reason: "affiliate.kyc_expired", updated_at: iso(now - 14 * DAY) },
    ),
  ];

  const { data: dao } = await variantByCode("DB3");
  const rule = (
    n: number,
    scope: RuleScope,
    target: string | null,
    partnerId: string | null,
    rate: number,
    cap: number | null,
    priority: number,
    from: string,
    to: string | null,
    note: string | null = null,
  ): Store["rules"][number] => ({
    id: uid("92", n),
    scope,
    target_id: target,
    partner_id: partnerId,
    rate_bp: rate,
    cap: cap === null ? null : vnd(cap),
    priority,
    note,
    effective_from: from,
    effective_to: to,
    created_by: MAI,
    created_at: `${addDays(from, -7)}T03:00:00.000Z`,
  });
  const rules = [
    rule(1, "product", dao?.product_id ?? null, null, 1000, 60_000, 30, "2026-11-01", null),
    rule(2, "category", CATEGORY_ID.kitchen, null, 800, null, 20, "2026-10-01", null),
    rule(
      3,
      "category",
      CATEGORY_ID.kitchen,
      PARTNER_ID.hang,
      1000,
      null,
      40,
      addDays(today(), 16),
      null,
      "Hợp đồng livestream quý 4",
    ),
    rule(4, "default", null, null, 500, null, 0, "2026-07-01", null),
    rule(5, "default", null, null, 400, null, 0, "2026-03-01", "2026-06-30"),
  ];

  // Ghi nhận đơn: đơn web (cửa hàng tự thu) có số chia 6 dư 0 — qua link của Hằng Bếp Vui, Nấu Cùng Minh, hay
  // mã của Studio Bếp Xanh (thứ tự xoay vòng); cộng các đơn đặt trong phiên livestream đã kết thúc.
  const web = orders
    .filter((o) => o.channel === "web" && o.funds_flow === "self_collect")
    .sort((a, b) => a.placed_at.localeCompare(b.placed_at));
  const attributions: Attribution[] = [];
  const turn: [string, AttributionSource][] = [
    [PARTNER_ID.hang, "click"],
    [PARTNER_ID.minh, "click"],
    [PARTNER_ID.bepxanh, "code"],
    [PARTNER_ID.hang, "click"],
  ];
  let k = 0;
  for (const o of web) {
    if (Number(o.number.slice(-4)) % 6 !== 0) continue;
    const [pid, source] = turn[k % turn.length] ?? [PARTNER_ID.hang, "click"];
    k += 1;
    attributions.push({
      order_id: o.id,
      partner_id: pid,
      source,
      link_id: null,
      live_session_id: null,
    });
  }

  // Phiên đã kết thúc: quanh một đơn web đặt từ 2 ngày trước (giờ phiên lấy theo đơn để bộ mẫu khớp nhau).
  const anchor = [...web]
    .reverse()
    .find(
      (o) =>
        Date.parse(o.placed_at) < now - 2 * DAY && !attributions.some((a) => a.order_id === o.id),
    );
  const endedStart = anchor ? Date.parse(anchor.placed_at) - 25 * MINUTE : now - 3 * DAY;
  const endedEnd = endedStart + 100 * MINUTE;
  const sessionIds = { ended: uid("93", 1), live: uid("93", 2), scheduled: uid("93", 3) };
  for (const o of web) {
    const t = Date.parse(o.placed_at);
    if (t < endedStart || t > endedEnd + 30 * MINUTE) continue;
    const existing = attributions.find((a) => a.order_id === o.id);
    // Livestream ưu tiên hơn lượt bấm (thứ tự mặc định của chương trình).
    if (existing) {
      existing.partner_id = PARTNER_ID.mocan;
      existing.source = "live";
      existing.live_session_id = sessionIds.ended;
    } else {
      attributions.push({
        order_id: o.id,
        partner_id: PARTNER_ID.mocan,
        source: "live",
        link_id: null,
        live_session_id: sessionIds.ended,
      });
    }
  }
  const endedSkus = [
    ...new Set(
      orders
        .filter((o) =>
          attributions.some((a) => a.order_id === o.id && a.live_session_id === sessionIds.ended),
        )
        .flatMap((o) => o.lines.map((l) => l.sku)),
    ),
  ];
  const pin = async (
    sku: string,
    at: number,
    code: string | null = null,
  ): Promise<LiveProduct | null> => {
    const { data: v } = await variantByCode(sku);
    if (!v) return null;
    const price = num(
      (await pricesAt(ORG.Q3, [v.variant_id], iso(at))).get(v.variant_id)?.price?.amount,
    );
    return {
      variant_id: v.variant_id,
      sku,
      name: `${v.name}${v.variant_label ? ` ${v.variant_label}` : ""}`,
      price_shown: vnd(price),
      promotion_code: code,
      pinned_at: iso(at),
      unpinned_at: null,
    };
  };
  const endedProducts = (
    await Promise.all(
      [...new Set([...endedSkus, "NI20", "CG26"])]
        .slice(0, 4)
        .map((sku, i) => pin(sku, endedStart + (4 + i * 6) * MINUTE)),
    )
  ).filter((x): x is LiveProduct => x !== null);
  const liveStart = now - 42 * MINUTE;
  const liveProducts = (
    await Promise.all([
      pin("DB3", liveStart + 4 * MINUTE),
      pin("CG26", liveStart + 22 * MINUTE, "BEPMOC10"),
      pin("TG35", liveStart + 34 * MINUTE),
    ])
  ).filter((x): x is LiveProduct => x !== null);
  const logOf = (
    products: LiveProduct[],
    start: number,
    end: number | null,
    actor: string,
  ): LiveLogEntry[] => [
    { at: iso(start), kind: "started", details: "", actor },
    ...products.flatMap((p) => [
      { at: p.pinned_at, kind: "pinned" as const, details: p.name, actor },
      {
        at: p.pinned_at,
        kind: "price_announced" as const,
        details: `${p.sku} ${p.price_shown.amount}${p.promotion_code ? ` · ${p.promotion_code}` : ""}`,
        actor,
      },
    ]),
    ...(end ? [{ at: iso(end), kind: "ended" as const, details: "", actor }] : []),
  ];
  const scheduledAt = Date.parse(`${addDays(today(), 2)}T20:00:00+07:00`);
  const sessions: Store["sessions"] = [
    {
      id: sessionIds.live,
      org_id: ORG.Q3,
      title: "Mở hộp bộ dao 3 món",
      host_partner_id: PARTNER_ID.hang,
      host_kind: "partner",
      platform: "tiktok",
      status: "live",
      scheduled_at: iso(liveStart),
      started_at: iso(liveStart),
      ended_at: null,
      products: liveProducts,
      log: logOf(liveProducts, liveStart, null, "Hằng Bếp Vui"),
      updated_at: iso(liveStart + 34 * MINUTE),
    },
    {
      id: sessionIds.scheduled,
      org_id: ORG.Q3,
      title: "Chảo gang cho bếp từ",
      host_partner_id: null,
      host_kind: "staff",
      platform: "facebook",
      status: "scheduled",
      scheduled_at: iso(scheduledAt),
      started_at: null,
      ended_at: null,
      products: (
        await Promise.all([pin("CG26", now - 5 * HOUR), pin("CG28", now - 5 * HOUR)])
      ).filter((x): x is LiveProduct => x !== null),
      log: [],
      updated_at: iso(now - 5 * HOUR),
    },
    {
      id: sessionIds.ended,
      org_id: ORG.ROOT,
      title: "Bếp Việt với nồi inox",
      host_partner_id: PARTNER_ID.mocan,
      host_kind: "partner",
      platform: "tiktok",
      status: "ended",
      scheduled_at: iso(endedStart),
      started_at: iso(endedStart),
      ended_at: iso(endedEnd),
      products: endedProducts,
      log: logOf(endedProducts, endedStart, endedEnd, "Truyền thông Mộc An"),
      updated_at: iso(endedEnd),
    },
  ];

  // Link của Hằng Bếp Vui; đơn qua link gán theo sản phẩm của đơn.
  const links: Store["links"] = [
    {
      id: uid("94", 1),
      partner_id: PARTNER_ID.hang,
      code: "hang-chaogang",
      target_kind: "product",
      target_name: "Chảo gang 26 cm",
      landing_path: "/san-pham/chao-gang-26",
      clicks_30d: 2640,
      created_at: iso(now - 44 * DAY),
      disabled_at: null,
    },
    {
      id: uid("94", 2),
      partner_id: PARTNER_ID.hang,
      code: "hang-dao3mon",
      target_kind: "product",
      target_name: "Bộ dao bếp 3 món",
      landing_path: "/san-pham/bo-dao-3-mon",
      clicks_30d: 1120,
      created_at: iso(now - 30 * DAY),
      disabled_at: null,
    },
    {
      id: uid("94", 3),
      partner_id: PARTNER_ID.hang,
      code: "hang-thang10",
      target_kind: "store",
      target_name: "bepmoc.vn",
      landing_path: "/",
      clicks_30d: 450,
      created_at: iso(now - 60 * DAY),
      disabled_at: iso(now - 15 * DAY),
    },
    {
      id: uid("94", 4),
      partner_id: PARTNER_ID.minh,
      code: "naucungminh",
      target_kind: "store",
      target_name: "bepmoc.vn",
      landing_path: "/",
      clicks_30d: 1380,
      created_at: iso(now - 70 * DAY),
      disabled_at: null,
    },
  ];
  for (const a of attributions) {
    if (a.source !== "click") continue;
    const o = orders.find((x) => x.id === a.order_id);
    if (a.partner_id === PARTNER_ID.minh) a.link_id = uid("94", 4);
    else if (o?.lines.some((l) => l.sku === "DB3")) a.link_id = uid("94", 2);
    else if (o && Date.parse(o.placed_at) < now - 15 * DAY) a.link_id = uid("94", 3);
    else a.link_id = uid("94", 1);
  }

  const period = lastMonth();
  const payouts: PayoutRow[] = [
    {
      id: uid("95", 1),
      partner_id: PARTNER_ID.hang,
      period_from: period.from,
      period_to: period.to,
      carried: 5_800_000,
      mode: "manual",
      status: "paid",
      bank_reference: "MẪU-GD-2611-0501",
      invoice_number: null,
      error: null,
      certificate_issued_at: iso(now - 10 * DAY),
      sent_at: null,
      paid_at: iso(now - 10 * DAY),
    },
    {
      id: uid("95", 2),
      partner_id: PARTNER_ID.minh,
      period_from: period.from,
      period_to: period.to,
      carried: 1_100_000,
      mode: "gateway",
      status: "failed",
      bank_reference: null,
      invoice_number: null,
      error: "affiliate.payee_name_mismatch",
      certificate_issued_at: null,
      sent_at: iso(now - 5 * DAY),
      paid_at: null,
    },
    {
      id: uid("95", 3),
      partner_id: PARTNER_ID.bepxanh,
      period_from: period.from,
      period_to: period.to,
      carried: 2_900_000,
      mode: "manual",
      status: "building",
      bank_reference: null,
      invoice_number: "MẪU-HĐ-00000412",
      error: null,
      certificate_issued_at: null,
      sent_at: null,
      paid_at: null,
    },
    {
      id: uid("95", 4),
      partner_id: PARTNER_ID.mocan,
      period_from: period.from,
      period_to: period.to,
      carried: 8_900_000,
      mode: "gateway",
      status: "sent",
      bank_reference: null,
      invoice_number: "MẪU-HĐ-00000977",
      error: null,
      certificate_issued_at: null,
      sent_at: iso(now - 5 * DAY),
      paid_at: null,
    },
  ];
  // Hoàn tiền sau khi đã chi: một dòng âm trừ vào lần chi sau (không sửa dòng đã chi).
  const adjustments: Store["adjustments"] = [];
  const pit: PitRule[] = [
    {
      id: uid("96", 1),
      subject: "individual_resident",
      rate_bp: 1000,
      threshold: vnd(2_000_000),
      basis: "TT 111/2013/TT-BTC, Điều 25",
      verify: true,
      effective_from: "2013-10-01",
      effective_to: null,
    },
    {
      id: uid("96", 2),
      subject: "individual_non_resident",
      rate_bp: 2000,
      threshold: null,
      basis: "Luật Thuế TNCN, cần đối chiếu văn bản gốc",
      verify: true,
      effective_from: "2013-10-01",
      effective_to: null,
    },
    {
      id: uid("96", 3),
      subject: "commitment",
      rate_bp: 0,
      threshold: null,
      basis: "Mẫu cam kết của cơ quan thuế",
      verify: true,
      effective_from: "2013-10-01",
      effective_to: null,
    },
    {
      id: uid("96", 4),
      subject: "household_business",
      rate_bp: 0,
      threshold: null,
      basis: "Hộ kinh doanh xuất hoá đơn, tự kê khai",
      verify: true,
      effective_from: "2013-10-01",
      effective_to: null,
    },
    {
      id: uid("96", 5),
      subject: "enterprise",
      rate_bp: 0,
      threshold: null,
      basis: "Doanh nghiệp xuất hoá đơn GTGT",
      verify: false,
      effective_from: "2013-10-01",
      effective_to: null,
    },
  ];
  return {
    partners,
    rules,
    attributions,
    adjustments,
    payouts,
    earlierPaid: new Map([
      [PARTNER_ID.hang, { count: 5, gross: 17_610_000, withheld: 1_761_000 }],
      [PARTNER_ID.minh, { count: 3, gross: 4_050_000, withheld: 0 }],
    ]),
    pit,
    program: {
      attribution_days: 7,
      live_grace_minutes: 30,
      precedence: ["live", "click", "code"],
      commission_base: "net_excl_tax",
      auto_approve: false,
      payout_schedule: "monthly",
      min_payout: vnd(200_000),
      payout_mode: "manual",
      terms_version: 2,
      updated_at: iso(now - 30 * DAY),
    },
    sessions,
    links,
    seq: 0,
  };
}

const KEY = Symbol.for("autoxide.sample.affiliate");
type Holder = { [KEY]?: Promise<Store> };

function store(): Promise<Store> {
  const holder = globalThis as Holder;
  holder[KEY] ??= seed();
  return holder[KEY];
}

/** Dựng lại kho mẫu (test). */
export function resetSampleAffiliate(): void {
  (globalThis as Holder)[KEY] = seed();
}

// ---------------------------------------------------------------- Hoa hồng (tính từ đơn)

interface Ctx {
  s: Store;
  orders: Order[];
  categories: Map<string, string>;
  productCats: Map<string, string[]>;
}

async function ctx(): Promise<Ctx> {
  const [s, { orders }, { data: cats }] = await Promise.all([
    store(),
    ordersState(),
    listCategories(),
  ]);
  const productCats = new Map<string, string[]>();
  for (const o of orders) {
    for (const l of o.lines) {
      if (productCats.has(l.product_id)) continue;
      const { data } = await variantByCode(l.sku);
      productCats.set(l.product_id, data?.category_ids ?? []);
    }
  }
  return { s, orders, categories: new Map(cats.map((c) => [c.id, c.names.vi ?? ""])), productCats };
}

/** Quy tắc áp cho một dòng lúc `day`: phạm vi khớp, đúng người (hay mọi người), ưu tiên cao nhất. */
export function pickRule<
  R extends Pick<
    CommissionRule,
    "scope" | "target_id" | "partner_id" | "priority" | "effective_from" | "effective_to"
  >,
>(
  rules: readonly R[],
  line: { product_id: string; category_ids: readonly string[] },
  partnerId: string,
  day: string,
): R | null {
  const fits = rules.filter(
    (r) =>
      r.effective_from <= day &&
      (!r.effective_to || r.effective_to >= day) &&
      (r.partner_id === null || r.partner_id === partnerId) &&
      (r.scope === "default" ||
        (r.scope === "product" && r.target_id === line.product_id) ||
        (r.scope === "category" &&
          r.target_id !== null &&
          line.category_ids.includes(r.target_id))),
  );
  return [...fits].sort((a, b) => b.priority - a.priority)[0] ?? null;
}

function ruleLabel(c: Ctx, r: Store["rules"][number]): string {
  return r.scope === "default"
    ? "default"
    : (c.categories.get(r.target_id ?? "") ?? r.target_id ?? "");
}

function commissionsOf(c: Ctx): Commission[] {
  const out: Commission[] = [];
  const paidPeriods = c.s.payouts.filter(
    (p) =>
      p.status === "paid" ||
      p.status === "sent" ||
      p.status === "building" ||
      p.status === "failed",
  );
  for (const a of c.s.attributions) {
    const o = c.orders.find((x) => x.id === a.order_id);
    const p = c.s.partners.find((x) => x.id === a.partner_id);
    if (!o || !p) continue;
    const day = vietnamDay(Date.parse(o.placed_at));
    for (const l of o.lines) {
      if (l.gift) continue;
      const tax = l.taxes.reduce((sum, t) => sum + num(t.amount), 0);
      const base = c.s.program.commission_base === "net_excl_tax" ? num(l.net) - tax : num(l.net);
      if (base <= 0) continue;
      const rule = pickRule(
        c.s.rules,
        { product_id: l.product_id, category_ids: c.productCats.get(l.product_id) ?? [] },
        p.id,
        day,
      );
      if (!rule) continue;
      const raw = Math.round((base * rule.rate_bp) / 10_000);
      const amount = rule.cap ? Math.min(raw, num(rule.cap)) : raw;
      const completed = o.completed_at ? vietnamDay(Date.parse(o.completed_at)) : null;
      const payout = completed
        ? paidPeriods.find(
            (x) => x.partner_id === p.id && completed >= x.period_from && completed <= x.period_to,
          )
        : undefined;
      const status: CommissionStatus =
        o.status === "cancelled"
          ? "void"
          : o.status !== "completed"
            ? "pending"
            : payout?.status === "paid"
              ? "paid"
              : "approved";
      out.push({
        id: `cm-${l.id}`,
        order_id: o.id,
        order_number: o.number,
        order_status: o.status,
        order_line_id: l.id,
        product_name: l.name,
        partner_id: p.id,
        partner_name: p.name,
        source: a.source,
        live_session_id: a.live_session_id,
        rule_id: rule.id,
        rule_label: rule.scope === "product" ? l.name : ruleLabel(c, rule),
        rate_bp: rule.rate_bp,
        capped: amount < raw,
        base: vnd(base),
        amount: vnd(amount),
        status,
        placed_at: o.placed_at,
        approved_at: o.completed_at,
        payout_id: status === "void" || status === "pending" ? null : (payout?.id ?? null),
      });
    }
  }
  return out.sort((x, y) => y.placed_at.localeCompare(x.placed_at));
}

function partnerView(
  _c: Ctx,
  p: Store["partners"][number],
  commissions: readonly Commission[],
): Partner {
  const unpaid = commissions
    .filter((x) => x.partner_id === p.id && x.status === "approved")
    .reduce((sum, x) => sum + num(x.amount), 0);
  // Lan Chi bị tạm khoá: hoa hồng đã duyệt giữ lại, chi khi xác thực lại (dự kiến, mẫu).
  const held = p.id === PARTNER_ID.lanchi ? 720_000 : 0;
  return { ...p, approved_unpaid: vnd(unpaid + held) };
}

// ---------------------------------------------------------------- Người tiếp thị

export type PartnerChip = "pending_review" | "pending_verification" | "active" | "suspended";

// Thay bằng GET /api/v1/affiliate/partners?status= (bước 49).
export async function listPartners(chip: PartnerChip | null = null): Promise<{ data: Partner[] }> {
  const c = await ctx();
  const commissions = commissionsOf(c);
  const rank: Record<PartnerStatus, number> = {
    pending_review: 0,
    pending_verification: 1,
    active: 2,
    suspended: 3,
    terminated: 4,
  };
  return {
    data: c.s.partners
      .filter((p) => !chip || p.status === chip)
      .map((p) => partnerView(c, p, commissions))
      .sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name)),
  };
}

/** Còn thiếu gì để hoạt động (`PartnerGate::ensure_active`): KYC đúng mục đích còn hạn, SĐT, điều khoản. */
export function gateIssues(
  p: Pick<Partner, "roles" | "kyc" | "terms_version">,
  termsVersion: number,
  at = Date.now(),
): string[] {
  const out: string[] = [];
  const valid = (k: KycPurpose | null) => k !== null && Date.parse(k.expires_at) > at;
  if (p.roles.includes("affiliate") && !valid(p.kyc.affiliate)) out.push("affiliate.kyc_required");
  if (p.roles.includes("livestreamer") && !valid(p.kyc.livestream))
    out.push("affiliate.kyc_required");
  if (!p.kyc.phone_verified) out.push("affiliate.phone_verification_required");
  if (p.terms_version !== termsVersion) out.push("affiliate.terms_not_accepted");
  return [...new Set(out)];
}

export type PartnerMove = "approve" | "suspend" | "reopen" | "terminate";

const MOVES: Record<PartnerMove, { from: PartnerStatus[]; to: PartnerStatus }> = {
  approve: { from: ["pending_review"], to: "active" },
  suspend: { from: ["active"], to: "suspended" },
  reopen: { from: ["suspended"], to: "active" },
  terminate: {
    from: ["pending_verification", "pending_review", "active", "suspended"],
    to: "terminated",
  },
};

// Thay bằng POST /api/v1/affiliate/partners/{id}/transitions (bước 49, `If-Match`): duyệt, tạm khoá, mở
// lại, chấm dứt có lý do. Duyệt / mở lại đi qua `PartnerGate` (KYC, SĐT, điều khoản).
export async function transitionPartner(
  id: string,
  move: PartnerMove,
  reason = "",
): Promise<SampleOutcome<{ partner: Partner; previous: PartnerStatus }>> {
  const c = await ctx();
  const p = c.s.partners.find((x) => x.id === id);
  if (!p) return partnerNotFound();
  const rule = MOVES[move];
  if (!rule.from.includes(p.status)) {
    return fail(409, "affiliate.invalid_transition", `Cannot move from ${p.status} to ${rule.to}.`);
  }
  const text = reason.trim();
  if ((move === "suspend" || move === "terminate") && !text)
    return invalid([fieldError("reason", "required")]);
  if (text.length > 300) return invalid([fieldError("reason", "too_long")]);
  if (move === "approve" || move === "reopen") {
    const issues = gateIssues(p, c.s.program.terms_version);
    if (issues.length > 0) {
      const code = issues[0] ?? "affiliate.kyc_required";
      return fail(403, code, `The partner is missing: ${issues.join(", ")}.`);
    }
  }
  const previous = p.status;
  p.status = rule.to;
  p.status_reason = text || null;
  p.updated_at = new Date().toISOString();
  if (rule.to === "active" && !p.activated_at) p.activated_at = p.updated_at;
  return { ok: true, data: { partner: partnerView(c, p, commissionsOf(c)), previous } };
}

// ---------------------------------------------------------------- Quy tắc hoa hồng, chương trình

// Thay bằng GET /api/v1/affiliate/commission-rules (bước 49).
export async function listRules(): Promise<{ data: CommissionRule[] }> {
  const c = await ctx();
  const { data: variants } = await allVariants();
  const productName = (id: string | null) =>
    variants.find((v) => v.product_id === id)?.name ?? null;
  return {
    data: [...c.s.rules]
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from) || b.priority - a.priority)
      .map((r) => ({
        ...r,
        target_name:
          r.scope === "default"
            ? null
            : r.scope === "category"
              ? (c.categories.get(r.target_id ?? "") ?? null)
              : productName(r.target_id),
        partner_name: c.s.partners.find((p) => p.id === r.partner_id)?.name ?? null,
      })),
  };
}

// Thay bằng POST /api/v1/affiliate/commission-rules (bước 49): chỉ thêm; không hiệu lực trong quá khứ
// (`affiliate.rule_in_past`); cùng phạm vi, cùng người, cùng ngày → `affiliate.rule_overlap`.
export async function addRule(input: {
  scope: string;
  target: string;
  partner: string;
  rate: string;
  cap: string;
  priority: string;
  from: string;
}): Promise<SampleOutcome<CommissionRule>> {
  const s = await store();
  const errors: NonNullable<Problem["errors"]>[number][] = [];
  const scope = (["product", "category", "default"] as const).find((x) => x === input.scope);
  if (!scope) errors.push(fieldError("scope", "unknown"));
  let target: string | null = null;
  if (scope === "product") {
    const { data: v } = await variantByCode(input.target.trim());
    if (!input.target.trim()) errors.push(fieldError("target", "required"));
    else if (!v)
      errors.push(fieldError("target", "affiliate.target_not_found", input.target.trim()));
    else target = v.product_id;
  } else if (scope === "category") {
    const { data: cats } = await listCategories();
    const cat = cats.find((x) => x.id === input.target);
    if (!cat)
      errors.push(fieldError("target", input.target ? "affiliate.target_not_found" : "required"));
    else target = cat.id;
  }
  const partnerId = input.partner ? input.partner : null;
  if (partnerId && !s.partners.some((p) => p.id === partnerId))
    errors.push(fieldError("partner", "unknown"));
  const rate = percentBp(input.rate, 5000);
  if (rate === null)
    errors.push(fieldError("rate", input.rate.trim() ? "affiliate.rate_invalid" : "required"));
  const cap = input.cap.trim() ? wholeNumber(input.cap, 1000, 100_000_000) : null;
  if (input.cap.trim() && cap === null) errors.push(fieldError("cap", "number_invalid"));
  const priority = wholeNumber(input.priority || "10", 0, 100);
  if (priority === null) errors.push(fieldError("priority", "number_invalid"));
  const from = parseDay(input.from);
  if (!from) errors.push(fieldError("from", input.from.trim() ? "date_invalid" : "required"));
  else if (from <= today()) errors.push(fieldError("from", "affiliate.rule_in_past"));
  if (errors.length > 0) return invalid(errors);
  const overlap = s.rules.find(
    (r) =>
      r.scope === scope &&
      r.target_id === target &&
      r.partner_id === partnerId &&
      r.effective_from === from,
  );
  if (overlap) {
    return fail(409, "affiliate.rule_overlap", `A rule with the same scope starts on ${from}.`, [
      fieldError("from", "affiliate.rule_overlap", from ?? ""),
    ]);
  }
  s.seq += 1;
  const row: Store["rules"][number] = {
    id: uid("92", 100 + s.seq),
    scope: scope ?? "default",
    target_id: target,
    partner_id: partnerId,
    rate_bp: rate ?? 0,
    cap: cap === null ? null : vnd(cap),
    priority: priority ?? 10,
    note: null,
    effective_from: from ?? today(),
    effective_to: null,
    created_by: SAMPLE_ACTOR,
    created_at: new Date().toISOString(),
  };
  s.rules.push(row);
  const { data } = await listRules();
  const out = data.find((r) => r.id === row.id);
  return out ? { ok: true, data: out } : fail(404, "affiliate.rule_not_found", "Rule not found.");
}

// Thay bằng POST /api/v1/affiliate/commission-rules/{id}/close (bước 49): đóng từ ngày mai (dòng hôm nay
// vẫn tính); đơn đặt trước giữ tỉ lệ đã chụp. Không đảo được.
export async function closeRule(id: string): Promise<SampleOutcome<CommissionRule>> {
  const s = await store();
  const r = s.rules.find((x) => x.id === id);
  if (!r) return fail(404, "affiliate.rule_not_found", "Rule not found.");
  if (ruleStateOf(r) !== "active")
    return fail(409, "affiliate.rule_not_active", "Only active rules can be closed.");
  r.effective_to = today();
  const { data } = await listRules();
  const out = data.find((x) => x.id === id);
  return out ? { ok: true, data: out } : fail(404, "affiliate.rule_not_found", "Rule not found.");
}

export interface CommissionPreview {
  name: string;
  unit_price: Money;
  discount: Money;
  net: Money;
  tax: Money;
  base: Money;
  rule: CommissionRule | null;
  amount: Money;
  capped: boolean;
  codes_applied: string[];
}

// Thay bằng GET /api/v1/affiliate/commission-rules/preview (bước 49): hoa hồng cho một dòng giả định — giá,
// giảm, thuế như đơn thật (máy chủ tính), quy tắc hiệu lực ngày đặt.
export async function previewCommission(input: {
  sku: string;
  code: string;
  day: string;
  partner: string;
}): Promise<SampleOutcome<CommissionPreview>> {
  const errors: NonNullable<Problem["errors"]>[number][] = [];
  const { data: v } = await variantByCode(input.sku);
  if (!v) errors.push(fieldError("sku", "affiliate.target_not_found", input.sku));
  const day = parseDay(input.day);
  if (!day) errors.push(fieldError("day", input.day.trim() ? "date_invalid" : "required"));
  const code = input.code.trim().toUpperCase();
  if (code && !/^[A-Z0-9-]{3,30}$/.test(code))
    errors.push(fieldError("code", "affiliate.code_format"));
  if (errors.length > 0) return invalid(errors);
  const c = await ctx();
  const priced = await priceCart(
    ORG.Q3,
    [[v?.sku ?? "", 1]],
    code ? [code] : [],
    0,
    Date.parse(`${day}T05:00:00+07:00`),
    "preview",
  );
  if (!priced.ok) return priced;
  const line = priced.data.lines.find((l) => !l.gift);
  if (!line) return invalid([fieldError("sku", "affiliate.target_not_found", input.sku)]);
  const tax = line.taxes.reduce((sum, t) => sum + num(t.amount), 0);
  const base = c.s.program.commission_base === "net_excl_tax" ? num(line.net) - tax : num(line.net);
  const partnerId = input.partner || "__all__";
  const rule = pickRule(
    c.s.rules,
    { product_id: line.product_id, category_ids: v?.category_ids ?? [] },
    partnerId,
    day ?? today(),
  );
  const raw = rule ? Math.round((base * rule.rate_bp) / 10_000) : 0;
  const amount = rule?.cap ? Math.min(raw, num(rule.cap)) : raw;
  const { data: rules } = await listRules();
  return {
    ok: true,
    data: {
      name: line.name,
      unit_price: line.unit_price,
      discount: line.discount,
      net: line.net,
      tax: vnd(tax),
      base: vnd(base),
      rule: rules.find((r) => r.id === rule?.id) ?? null,
      amount: vnd(amount),
      capped: amount < raw,
      codes_applied: priced.data.promotions
        .map((p) => p.code)
        .filter((x): x is string => x !== null),
    },
  };
}

// Thay bằng GET /api/v1/affiliate/programs/{org_id} (bước 49).
export async function getProgram(): Promise<Program> {
  return { ...(await store()).program };
}

// Thay bằng PUT /api/v1/affiliate/programs/{org_id} (bước 49): thời hạn ghi nhận mới áp cho lượt bấm từ
// lúc lưu.
export async function saveProgram(input: {
  days: string;
  precedence: string;
  base: string;
  auto: boolean;
  mode: string;
  min: string;
}): Promise<SampleOutcome<Program>> {
  const s = await store();
  const errors: NonNullable<Problem["errors"]>[number][] = [];
  const days = wholeNumber(input.days, 1, 90);
  if (days === null)
    errors.push(fieldError("days", input.days.trim() ? "affiliate.days_invalid" : "required"));
  const order: Record<string, AttributionSource[]> = {
    live_click_code: ["live", "click", "code"],
    click_code_live: ["click", "code", "live"],
  };
  const precedence = order[input.precedence];
  if (!precedence) errors.push(fieldError("precedence", "unknown"));
  if (input.base !== "net_excl_tax" && input.base !== "net_incl_tax")
    errors.push(fieldError("base", "unknown"));
  if (input.mode !== "manual" && input.mode !== "gateway")
    errors.push(fieldError("mode", "unknown"));
  const min = wholeNumber(input.min || "0", 0, 100_000_000);
  if (min === null) errors.push(fieldError("min", "number_invalid"));
  if (errors.length > 0) return invalid(errors);
  s.program = {
    ...s.program,
    attribution_days: days ?? 7,
    precedence: precedence ?? ["live", "click", "code"],
    commission_base: input.base as Program["commission_base"],
    auto_approve: input.auto,
    payout_mode: input.mode as Program["payout_mode"],
    min_payout: vnd(min ?? 0),
    updated_at: new Date().toISOString(),
  };
  return { ok: true, data: { ...s.program } };
}

// ---------------------------------------------------------------- Hoa hồng, chi trả

export type CommissionChip = CommissionStatus;

// Thay bằng GET /api/v1/affiliate/commissions?status=&partner_id= (bước 49).
export async function listCommissions(
  query: { chip?: CommissionChip | null; partner?: string | null } = {},
): Promise<{ data: Commission[] }> {
  const c = await ctx();
  return {
    data: commissionsOf(c)
      .filter((x) => !query.chip || x.status === query.chip)
      .filter((x) => !query.partner || x.partner_id === query.partner),
  };
}

// Dự kiến: GET /api/v1/affiliate/commissions/summary (bước 49).
export async function commissionStats(): Promise<{
  pending: Money;
  pending_lines: number;
  approved: Money;
  paid_year: Money;
  void_month: Money;
}> {
  const c = await ctx();
  const all = commissionsOf(c);
  const sum = (list: Commission[]) => vnd(list.reduce((t, x) => t + num(x.amount), 0));
  const month = today().slice(0, 7);
  const payouts = await listPayouts();
  const year = today().slice(0, 4);
  const earlier = [...c.s.earlierPaid.values()].reduce((t, x) => t + x.gross, 0);
  return {
    pending: sum(all.filter((x) => x.status === "pending")),
    pending_lines: all.filter((x) => x.status === "pending").length,
    approved: sum(all.filter((x) => x.status === "approved")),
    paid_year: vnd(
      earlier +
        payouts.data
          .filter((p) => p.status === "paid" && (p.paid_at ?? "").startsWith(year))
          .reduce((t, p) => t + num(p.gross), 0),
    ),
    void_month: sum(all.filter((x) => x.status === "void" && x.placed_at.startsWith(month))),
  };
}

// Thay bằng GET /api/v1/affiliate/commissions?kind=adjustment (dự kiến; đặc tả có bảng
// `affiliate_adjustments` nhưng chưa có endpoint đọc).
export async function listAdjustments(): Promise<{ data: Adjustment[] }> {
  const s = await store();
  return {
    data: s.adjustments.map((a) => ({
      ...a,
      partner_name: s.partners.find((p) => p.id === a.partner_id)?.name ?? "",
    })),
  };
}

// Thay bằng GET /api/v1/affiliate/payouts (bước 49). Khấu trừ tính trên cả lệnh chi (sau điều chỉnh âm),
// theo dữ liệu thuế hiệu lực ngày chi; ảnh chụp lưu trên lệnh.
export async function listPayouts(): Promise<{ data: Payout[] }> {
  const c = await ctx();
  const all = commissionsOf(c);
  return {
    data: c.s.payouts.map((p) => {
      const partner = c.s.partners.find((x) => x.id === p.partner_id);
      const mine = all.filter(
        (x) =>
          x.partner_id === p.partner_id &&
          x.payout_id === p.id &&
          (x.status === "approved" || x.status === "paid"),
      );
      const commissions = mine.reduce((t, x) => t + num(x.amount), 0);
      const adjustments = c.s.adjustments
        .filter((a) => a.partner_id === p.partner_id && a.payout_id === p.id)
        .reduce((t, a) => t + num(a.amount), 0);
      const gross = p.carried + commissions + adjustments;
      const subject = partner?.tax_subject ?? "individual_resident";
      const commitment = partner?.commitment_year === Number(p.period_to.slice(0, 4));
      const day = vietnamDay(Date.parse(p.paid_at ?? p.sent_at ?? new Date().toISOString()));
      const { withheld, snapshot } = withholdingFor(c.s.pit, subject, commitment, gross, day);
      return {
        id: p.id,
        partner_id: p.partner_id,
        partner_name: partner?.name ?? "",
        tax_subject: subject,
        period_from: p.period_from,
        period_to: p.period_to,
        carried: vnd(p.carried),
        commission_count: mine.length,
        commissions_total: vnd(commissions),
        adjustments_total: vnd(adjustments),
        gross: vnd(gross),
        withheld: vnd(withheld),
        withholding: snapshot,
        net: vnd(gross - withheld),
        mode: p.mode,
        status: p.status,
        reference: `affiliate:payout:${p.id}`,
        bank_reference_set: p.bank_reference !== null,
        invoice_number_set: p.invoice_number !== null,
        error: p.error,
        certificate_issued_at: p.certificate_issued_at,
        sent_at: p.sent_at,
        paid_at: p.paid_at,
      };
    }),
  };
}

// Thay bằng POST /api/v1/affiliate/payouts/{id}/mark-paid (bước 49, chế độ `manual`, có `bank_reference`,
// D-184): ghi sổ cái và lập chứng từ khấu trừ (job). Không đảo được; gửi lại cùng mã giao dịch không ghi
// hai lần.
export async function markPayoutPaid(
  id: string,
  input: { bank_reference: string; date: string },
): Promise<SampleOutcome<Payout>> {
  const s = await store();
  const p = s.payouts.find((x) => x.id === id);
  if (!p) return fail(404, "affiliate.payout_not_found", "Payout not found.");
  const errors: NonNullable<Problem["errors"]>[number][] = [];
  const ref = input.bank_reference.trim();
  if (!ref) errors.push(fieldError("bank_reference", "required"));
  else if (ref.length < 6 || ref.length > 40)
    errors.push(fieldError("bank_reference", "affiliate.bank_reference_invalid"));
  const day = parseDay(input.date);
  if (!day) errors.push(fieldError("date", input.date.trim() ? "date_invalid" : "required"));
  else if (day > today()) errors.push(fieldError("date", "affiliate.date_in_future"));
  else if (day <= p.period_to) errors.push(fieldError("date", "affiliate.date_before_period"));
  if (errors.length > 0) return invalid(errors);
  if (p.status === "paid" && p.bank_reference === ref) {
    const { data } = await listPayouts();
    const out = data.find((x) => x.id === id);
    if (out) return { ok: true, data: out };
  }
  if (p.status !== "building" || p.mode !== "manual") {
    return fail(409, "affiliate.payout_not_retryable", `The payout is ${p.status}.`);
  }
  const partner = s.partners.find((x) => x.id === p.partner_id);
  if (!partner?.payout_account_set)
    return fail(422, "affiliate.payout_account_missing", "No payout account.");
  p.status = "paid";
  p.bank_reference = ref;
  p.paid_at = new Date(`${day}T10:00:00+07:00`).toISOString();
  p.certificate_issued_at = partner.tax_subject.startsWith("individual")
    ? new Date().toISOString()
    : null;
  const { data } = await listPayouts();
  const out = data.find((x) => x.id === id);
  return out
    ? { ok: true, data: out }
    : fail(404, "affiliate.payout_not_found", "Payout not found.");
}

// Thay bằng POST /api/v1/affiliate/payouts/{id}/retry (bước 49): gửi lại cùng `reference`, đối tác chi không
// chi trùng. Không đảo được.
export async function retryPayout(id: string): Promise<SampleOutcome<Payout>> {
  const s = await store();
  const p = s.payouts.find((x) => x.id === id);
  if (!p) return fail(404, "affiliate.payout_not_found", "Payout not found.");
  if (p.status !== "failed")
    return fail(409, "affiliate.payout_not_retryable", `The payout is ${p.status}.`);
  p.status = "sent";
  p.error = null;
  p.sent_at = new Date().toISOString();
  const { data } = await listPayouts();
  const out = data.find((x) => x.id === id);
  return out
    ? { ok: true, data: out }
    : fail(404, "affiliate.payout_not_found", "Payout not found.");
}

// Thay bằng dữ liệu thuế của `tax` (bước 36, gói "vn"): tỉ lệ, ngưỡng khấu trừ TNCN có ngày hiệu lực.
export async function listPitRules(): Promise<{ data: PitRule[] }> {
  return { data: [...(await store()).pit] };
}

// ---------------------------------------------------------------- Livestream

function reportOf(
  c: Ctx,
  sessionId: string,
  commissions: readonly Commission[],
): LiveSession["report"] {
  const ids = c.s.attributions
    .filter((a) => a.live_session_id === sessionId)
    .map((a) => a.order_id);
  const orders = c.orders.filter((o) => ids.includes(o.id) && o.status !== "cancelled");
  const lines = new Map<string, { sku: string; name: string; quantity: number; revenue: number }>();
  for (const o of orders) {
    for (const l of o.lines) {
      if (l.gift) continue;
      const cur = lines.get(l.sku) ?? { sku: l.sku, name: l.name, quantity: 0, revenue: 0 };
      cur.quantity += l.quantity;
      cur.revenue += num(l.net);
      lines.set(l.sku, cur);
    }
  }
  return {
    orders: orders.length,
    revenue: vnd(orders.reduce((t, o) => t + num(o.total) - num(o.refunded), 0)),
    commission: vnd(
      commissions
        .filter((x) => x.live_session_id === sessionId && x.status !== "void")
        .reduce((t, x) => t + num(x.amount), 0),
    ),
    lines: [...lines.values()].map((l) => ({ ...l, revenue: vnd(l.revenue) })),
  };
}

// Thay bằng GET /api/v1/affiliate/live-sessions + /{id}/log + /{id}/report (bước 49).
export async function listSessions(): Promise<{ data: LiveSession[] }> {
  const c = await ctx();
  const commissions = commissionsOf(c);
  const { data: units } = await listUnits();
  const rank: Record<SessionStatus, number> = { live: 0, scheduled: 1, ended: 2 };
  return {
    data: c.s.sessions
      .map((x) => ({
        ...x,
        org_name: units.find((u) => u.id === x.org_id)?.name ?? "",
        host_name:
          x.host_kind === "staff"
            ? "Lê Quang Huy"
            : (c.s.partners.find((p) => p.id === x.host_partner_id)?.name ?? ""),
        report: reportOf(c, x.id, commissions),
      }))
      .sort(
        (a, b) =>
          rank[a.status] - rank[b.status] ||
          (b.scheduled_at ?? "").localeCompare(a.scheduled_at ?? ""),
      ),
  };
}

/** Người phát được chọn khi lên lịch: người tiếp thị vai livestream, và nhân sự cửa hàng. */
export async function hostOptions(): Promise<{ value: string; label: string }[]> {
  const s = await store();
  return [
    ...s.partners
      .filter((p) => p.roles.includes("livestreamer") && p.status !== "terminated")
      .map((p) => ({ value: p.id, label: p.name })),
    { value: "staff", label: "Lê Quang Huy" },
  ];
}

function hostGate(s: Store, hostId: string): SampleOutcome<never> | null {
  if (hostId === "staff") return null; // Nhân sự của cửa hàng: KYC mục đích livestream đã có (mẫu).
  const p = s.partners.find((x) => x.id === hostId);
  if (!p) return partnerNotFound();
  if (!p.kyc.phone_verified) {
    return fail(
      403,
      "affiliate.phone_verification_required",
      "Phone verification is required before livestreaming.",
    );
  }
  if (!p.kyc.livestream || Date.parse(p.kyc.livestream.expires_at) <= Date.now()) {
    return fail(
      403,
      "affiliate.kyc_required",
      "Identity verification for livestreaming is required.",
    );
  }
  if (p.status !== "active") {
    return fail(409, "affiliate.partner_not_active", `The partner is ${p.status}.`);
  }
  return null;
}

export const PLATFORMS: readonly LivePlatform[] = [
  "own",
  "facebook",
  "tiktok",
  "youtube",
  "zalo",
  "other",
];

// Thay bằng POST /api/v1/affiliate/live-sessions (bước 49).
export async function scheduleSession(input: {
  title: string;
  host: string;
  platform: string;
  at: string;
}): Promise<SampleOutcome<LiveSession>> {
  const s = await store();
  const errors: NonNullable<Problem["errors"]>[number][] = [];
  const title = input.title.trim();
  if (!title) errors.push(fieldError("title", "required"));
  else if (title.length > 120) errors.push(fieldError("title", "too_long"));
  const platform = PLATFORMS.find((p) => p === input.platform);
  if (!platform) errors.push(fieldError("platform", "unknown"));
  const at = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.at.trim())
    ? Date.parse(`${input.at.trim()}:00+07:00`)
    : Number.NaN;
  if (!input.at.trim()) errors.push(fieldError("at", "required"));
  else if (Number.isNaN(at)) errors.push(fieldError("at", "date_invalid"));
  else if (at <= Date.now()) errors.push(fieldError("at", "affiliate.time_in_past"));
  if (!input.host) errors.push(fieldError("host", "required"));
  if (errors.length > 0) return invalid(errors);
  const blocked = hostGate(s, input.host);
  if (blocked) return blocked;
  s.seq += 1;
  const id = uid("93", 100 + s.seq);
  s.sessions.push({
    id,
    org_id: ORG.Q3,
    title,
    host_partner_id: input.host === "staff" ? null : input.host,
    host_kind: input.host === "staff" ? "staff" : "partner",
    platform: platform ?? "other",
    status: "scheduled",
    scheduled_at: new Date(at).toISOString(),
    started_at: null,
    ended_at: null,
    products: [],
    log: [],
    updated_at: new Date().toISOString(),
  });
  const { data } = await listSessions();
  const out = data.find((x) => x.id === id);
  return out
    ? { ok: true, data: out }
    : fail(404, "affiliate.session_not_found", "Session not found.");
}

// Thay bằng POST /api/v1/affiliate/live-sessions/{id}/start | /end (bước 49): bắt đầu qua `PartnerGate`
// (mục đích livestream); mỗi việc ghi vào nhật ký phiên (chỉ thêm). Không đảo được.
export async function changeSession(
  id: string,
  to: "live" | "ended",
): Promise<SampleOutcome<LiveSession>> {
  const s = await store();
  const x = s.sessions.find((y) => y.id === id);
  if (!x) return fail(404, "affiliate.session_not_found", "Session not found.");
  if ((to === "live" && x.status !== "scheduled") || (to === "ended" && x.status !== "live")) {
    return fail(
      409,
      "affiliate.session_not_live",
      "The session has not started or has already ended.",
    );
  }
  if (to === "live") {
    const blocked = hostGate(s, x.host_partner_id ?? "staff");
    if (blocked) return blocked;
  }
  const now = new Date().toISOString();
  x.status = to;
  if (to === "live") x.started_at = now;
  else x.ended_at = now;
  x.log.push({
    at: now,
    kind: to === "live" ? "started" : "ended",
    details: "",
    actor: SAMPLE_ACTOR.name,
  });
  x.updated_at = now;
  const { data } = await listSessions();
  const out = data.find((y) => y.id === id);
  return out
    ? { ok: true, data: out }
    : fail(404, "affiliate.session_not_found", "Session not found.");
}

// Thay bằng POST /api/v1/affiliate/live-sessions/{id}/products (bước 49): chỉ biến thể đang bán; giá đang
// niêm yết lúc gắn được ghi vào nhật ký (giá người mua trả vẫn do `orders` tính).
export async function pinProduct(
  id: string,
  input: { sku: string; code: string },
): Promise<SampleOutcome<LiveSession>> {
  const s = await store();
  const x = s.sessions.find((y) => y.id === id);
  if (!x) return fail(404, "affiliate.session_not_found", "Session not found.");
  if (x.status === "ended")
    return fail(409, "affiliate.session_not_live", "The session has ended.");
  const errors: NonNullable<Problem["errors"]>[number][] = [];
  const { data: v } = await variantByCode(input.sku.trim());
  if (!input.sku.trim()) errors.push(fieldError("sku", "required"));
  else if (!v) errors.push(fieldError("sku", "affiliate.target_not_found", input.sku.trim()));
  const code = input.code.trim().toUpperCase();
  if (code && !/^[A-Z0-9-]{3,30}$/.test(code))
    errors.push(fieldError("code", "affiliate.code_format"));
  if (errors.length > 0) return invalid(errors);
  if (v?.status !== "active" || !v.variant_active) {
    return fail(422, "affiliate.variant_not_sellable", `${input.sku} is not on sale.`, [
      fieldError("sku", "affiliate.variant_not_sellable", input.sku.trim()),
    ]);
  }
  if (x.products.some((p) => p.variant_id === v.variant_id && !p.unpinned_at)) {
    return invalid([fieldError("sku", "affiliate.already_pinned")]);
  }
  const now = new Date().toISOString();
  const price = num(
    (await pricesAt(x.org_id === ORG.ROOT ? ORG.Q3 : x.org_id, [v.variant_id])).get(v.variant_id)
      ?.price?.amount,
  );
  const product: LiveProduct = {
    variant_id: v.variant_id,
    sku: v.sku,
    name: `${v.name}${v.variant_label ? ` ${v.variant_label}` : ""}`,
    price_shown: vnd(price),
    promotion_code: code || null,
    pinned_at: now,
    unpinned_at: null,
  };
  x.products.push(product);
  if (x.status === "live") {
    x.log.push({ at: now, kind: "pinned", details: product.name, actor: SAMPLE_ACTOR.name });
    x.log.push({
      at: now,
      kind: "price_announced",
      details: `${product.sku} ${price}${code ? ` · ${code}` : ""}`,
      actor: SAMPLE_ACTOR.name,
    });
  }
  x.updated_at = now;
  const { data } = await listSessions();
  const out = data.find((y) => y.id === id);
  return out
    ? { ok: true, data: out }
    : fail(404, "affiliate.session_not_found", "Session not found.");
}

// ---------------------------------------------------------------- Góc người tiếp thị (của chính mình)

export interface PortalStats {
  partner: Partner;
  clicks_30d: number;
  orders_30d: number;
  by_link: number;
  by_live: number;
  pending: Money;
  received_year: Money;
  year: { payouts: number; gross: Money; withheld: Money; net: Money; certificates: number };
}

// Thay bằng GET /api/v1/affiliate/partners/me/stats + /me/tax-statement?year= (bước 49, phạm vi `Own`).
export async function portalStats(partnerId: string = PORTAL_PARTNER): Promise<PortalStats | null> {
  const c = await ctx();
  const p = c.s.partners.find((x) => x.id === partnerId);
  if (!p) return null;
  const commissions = commissionsOf(c).filter((x) => x.partner_id === partnerId);
  const since = Date.now() - 30 * DAY;
  const recent = c.s.attributions.filter((a) => {
    const o = c.orders.find((x) => x.id === a.order_id);
    return a.partner_id === partnerId && o && Date.parse(o.placed_at) >= since;
  });
  const { data: payouts } = await listPayouts();
  const year = today().slice(0, 4);
  const paid = payouts.filter(
    (x) => x.partner_id === partnerId && x.status === "paid" && (x.paid_at ?? "").startsWith(year),
  );
  const earlier = c.s.earlierPaid.get(partnerId) ?? { count: 0, gross: 0, withheld: 0 };
  const gross = earlier.gross + paid.reduce((t, x) => t + num(x.gross), 0);
  const withheld = earlier.withheld + paid.reduce((t, x) => t + num(x.withheld), 0);
  return {
    partner: partnerView(c, p, commissionsOf(c)),
    clicks_30d: c.s.links
      .filter((l) => l.partner_id === partnerId)
      .reduce((t, l) => t + l.clicks_30d, 0),
    orders_30d: recent.length,
    by_link: recent.filter((a) => a.source !== "live").length,
    by_live: recent.filter((a) => a.source === "live").length,
    pending: vnd(
      commissions.filter((x) => x.status === "pending").reduce((t, x) => t + num(x.amount), 0),
    ),
    received_year: vnd(gross - withheld),
    year: {
      payouts: earlier.count + paid.length,
      gross: vnd(gross),
      withheld: vnd(withheld),
      net: vnd(gross - withheld),
      certificates:
        (earlier.withheld > 0 ? earlier.count : 0) + paid.filter((x) => num(x.withheld) > 0).length,
    },
  };
}

// Thay bằng GET /api/v1/affiliate/partners/me/links (bước 49).
export async function listLinks(
  partnerId: string = PORTAL_PARTNER,
): Promise<{ data: PartnerLink[] }> {
  const s = await store();
  return {
    data: s.links
      .filter((l) => l.partner_id === partnerId)
      .map((l) => ({ ...l, orders: s.attributions.filter((a) => a.link_id === l.id).length }))
      .sort(
        (a, b) =>
          Number(a.disabled_at !== null) - Number(b.disabled_at !== null) ||
          b.clicks_30d - a.clicks_30d,
      ),
  };
}

// Thay bằng POST /api/v1/affiliate/partners/me/links (bước 49): qua `PartnerGate`; mã duy nhất trong khách
// (`affiliate.code_taken`).
export async function createLink(
  input: { code: string; target_kind: string; sku: string },
  partnerId: string = PORTAL_PARTNER,
): Promise<SampleOutcome<PartnerLink>> {
  const s = await store();
  const p = s.partners.find((x) => x.id === partnerId);
  if (!p) return partnerNotFound();
  const errors: NonNullable<Problem["errors"]>[number][] = [];
  const code = input.code.trim().toLowerCase();
  if (!code) errors.push(fieldError("code", "required"));
  else if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(code))
    errors.push(fieldError("code", "affiliate.link_code_format"));
  const kind = (["product", "category", "store"] as const).find((k) => k === input.target_kind);
  if (!kind) errors.push(fieldError("target_kind", "unknown"));
  let targetName = "bepmoc.vn";
  let landing = "/";
  if (kind === "product") {
    const { data: v } = await variantByCode(input.sku.trim());
    if (!input.sku.trim()) errors.push(fieldError("sku", "required"));
    else if (!v) errors.push(fieldError("sku", "affiliate.target_not_found", input.sku.trim()));
    else {
      targetName = v.name;
      landing = `/san-pham/${v.sku.toLowerCase()}`;
    }
  }
  if (errors.length > 0) return invalid(errors);
  if (p.status !== "active")
    return fail(409, "affiliate.partner_not_active", `The partner is ${p.status}.`);
  if (
    s.links.some((l) => l.code === code) ||
    s.partners.some((x) => x.code.toLowerCase() === code)
  ) {
    return fail(409, "affiliate.code_taken", `The code ${code} is taken.`, [
      fieldError("code", "affiliate.code_taken", code),
    ]);
  }
  s.seq += 1;
  const link: Store["links"][number] = {
    id: uid("94", 100 + s.seq),
    partner_id: partnerId,
    code,
    target_kind: kind ?? "store",
    target_name: targetName,
    landing_path: landing,
    clicks_30d: 0,
    created_at: new Date().toISOString(),
    disabled_at: null,
  };
  s.links.push(link);
  return { ok: true, data: { ...link, orders: 0 } };
}

// Thay bằng DELETE /api/v1/affiliate/partners/me/links/{id} (bước 49): tắt link; lượt bấm cũ còn hạn vẫn
// được ghi nhận. Không đảo được.
export async function disableLink(
  id: string,
  partnerId: string = PORTAL_PARTNER,
): Promise<SampleOutcome<PartnerLink>> {
  const s = await store();
  const l = s.links.find((x) => x.id === id && x.partner_id === partnerId);
  if (!l) return fail(404, "affiliate.link_not_found", "Link not found or disabled.");
  if (l.disabled_at) return fail(404, "affiliate.link_not_found", "Link not found or disabled.");
  l.disabled_at = new Date().toISOString();
  return {
    ok: true,
    data: { ...l, orders: s.attributions.filter((a) => a.link_id === l.id).length },
  };
}

/** Danh mục và sản phẩm để chọn trong form (quy tắc, xem trước, gắn vào phiên). */
export async function categoryOptions(): Promise<{ value: string; label: string }[]> {
  const { data } = await listCategories();
  return data.map((c) => ({ value: c.id, label: c.names.vi ?? c.id }));
}
