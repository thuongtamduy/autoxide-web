// Hàm đọc / ghi của phân hệ Sàn (W-006, W-018), cùng chữ ký như sẽ gọi API của module `marketplace`
// (bước 46 của core). Kiểu và dữ liệu ban đầu ở `market-data.ts`.
//
// Giữ đúng luật của đặc tả trong hàm mẫu:
// - một hàm duy nhất quyết "người bán này được bán không" (`gateOf`, như `SellerGate::ensure_can_sell`):
//   trạng thái `active` VÀ định danh (KYC) còn hạn VÀ đã chấp nhận bản hiện hành của quy chế sàn và hợp
//   đồng người bán. KYC và văn bản đọc từ phân hệ Tuân thủ mẫu, nên duyệt KYC ở màn Tuân thủ đổi ngay
//   tình trạng người bán ở đây;
// - phí là dữ liệu có ngày hiệu lực, chỉ thêm; tra phí theo ngày đặt đơn, không theo ngày tính;
// - quyết toán: `net = gross + subsidy − phí − khấu trừ thay`, khấu trừ thay chỉ cho hộ / cá nhân kinh
//   doanh (tỉ lệ đọc từ `tax.ts`, NĐ 117/2025); làm tròn nửa lên tới đồng, không qua số thực;
// - lệnh chi gửi lại dùng cùng `reference` để đối tác không chi hai lần; sàn không giữ tiền (D-187).
//
// Việc core làm bằng job (đối tác báo kết quả lệnh chi, tranh chấp quá hạn người bán chuyển sàn phân
// xử, quyết toán qua hạn đổi trả) tiến theo thời gian thật mỗi lần đọc (`sync`).
import type { Problem } from "@autoxide/sdk";
import { type CategorySummary, listCategories, listRestrictionRules, type Money } from "./catalog";
import { type KycProfile, listKycProfiles } from "./compliance";
import { acceptanceOf, type DocumentKind, recordAcceptance } from "./compliance-records";
import { type SamplePage, samplePage } from "./index";
import {
  AUTO_REASONS,
  at,
  type Dispute,
  type DisputeStatus,
  FEE_KINDS,
  type FeeKind,
  type FeeRule,
  type Finding,
  ID,
  type ListingReview,
  type ListingStatus,
  type MarketOrder,
  type MarketStore,
  marketOrderId,
  PAYOUT_SEEDS,
  type Payout,
  type PayoutStatus,
  PENALTY_RULES,
  type Penalty,
  RESOLUTIONS,
  type Resolution,
  SANCTIONS,
  type Sanction,
  SELLER,
  SELLER_TYPES,
  SETTLEMENT_SEEDS,
  type Seller,
  type SellerDocument,
  type SellerInvitation,
  type SellerMetrics,
  type SellerStatus,
  type SellerType,
  type Settlement,
  type SettlementStatus,
  type StatusReason,
  seedMarket,
  vnd,
} from "./market-data";
import { listUnits, SAMPLE_UNIT_IDS, type SampleOutcome } from "./org";
import {
  applyPercent,
  listTaxRates,
  listWithholdingRates,
  rateOn,
  splitInclusive,
  vietnamDay,
} from "./tax";

export * from "./market-data";

const { DAY, HOUR, uid } = ID;

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

const amount = (money: Money) => Number(money.amount);

// ---------------------------------------------------------------- Tính tiền (hàm thuần, có test)

/** Basis point thành chữ phần trăm cho `applyPercent` ("600" → "6", "550" → "5.5"). */
export function bpPercent(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const rest = String(bp % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return rest ? `${whole}.${rest}` : String(whole);
}

/** Người bán phải bị khấu trừ thay: hộ và cá nhân kinh doanh (doanh nghiệp tự kê khai). */
export function withheldFor(type: SellerType): boolean {
  return type === "household" || type === "individual";
}

export interface SettleInput {
  gross: number;
  subsidy?: number;
  commission_bp: number;
  /** Thuế GTGT của phí sàn (dịch vụ của sàn), vd "10". */
  fee_vat_percent: string;
  seller_type: SellerType;
  /** Tỉ lệ khấu trừ thay GTGT / TNCN (`null` khi không áp). */
  vat_percent: string | null;
  pit_percent: string | null;
}

export interface SettleResult {
  gross: number;
  subsidy: number;
  fees: number;
  fee_vat: number;
  withholding_vat: number;
  withholding_pit: number;
  net: number;
}

/** Bảng quyết toán của một đơn: `net = gross + subsidy − phí − khấu trừ thay`, từng đồng. */
export function settle(input: SettleInput): SettleResult {
  const subsidy = input.subsidy ?? 0;
  const fees = applyPercent(input.gross, bpPercent(input.commission_bp));
  const fee_vat = splitInclusive(fees, input.fee_vat_percent).tax;
  const withhold = withheldFor(input.seller_type);
  const withholding_vat =
    withhold && input.vat_percent ? applyPercent(input.gross, input.vat_percent) : 0;
  const withholding_pit =
    withhold && input.pit_percent ? applyPercent(input.gross, input.pit_percent) : 0;
  return {
    gross: input.gross,
    subsidy,
    fees,
    fee_vat,
    withholding_vat,
    withholding_pit,
    net: input.gross + subsidy - fees - withholding_vat - withholding_pit,
  };
}

/** Dòng phí hiệu lực vào ngày `day` (gồm ngày bắt đầu và ngày kết thúc). */
export function ruleActiveOn(rule: FeeRule, day: string): boolean {
  return rule.effective_from <= day && (rule.effective_to === null || day <= rule.effective_to);
}

/**
 * Hoa hồng áp cho một đơn: dòng của ngành hàng gần nhất (danh mục của sản phẩm rồi danh mục cha) thắng
 * dòng mặc định; dòng theo loại người bán thắng dòng cho mọi loại. Không có dòng nào thì 0 (khuyến nghị
 * của đặc tả: khách tự nhập phí).
 */
export function commissionFor(
  rules: readonly FeeRule[],
  lineage: readonly string[],
  sellerType: SellerType,
  day: string,
): FeeRule | null {
  const candidates = rules.filter(
    (r) =>
      r.fee_kind === "commission" &&
      r.rate_bp !== null &&
      ruleActiveOn(r, day) &&
      (r.seller_type === null || r.seller_type === sellerType),
  );
  const rank = (r: FeeRule) => {
    const depth = r.category_id === null ? lineage.length : lineage.indexOf(r.category_id);
    return (depth < 0 ? 1_000 : depth) * 2 + (r.seller_type === null ? 1 : 0);
  };
  return (
    candidates
      .filter((r) => r.category_id === null || lineage.includes(r.category_id))
      .sort((a, b) => rank(a) - rank(b))[0] ?? null
  );
}

/** Ngày theo giờ Việt Nam của một thời điểm (kỳ báo cáo và ngày hiệu lực cắt theo giờ của khách). */
function dayOf(iso: string): string {
  return vietnamDay(Date.parse(iso));
}

// ---------------------------------------------------------------- Kho

const KEY = Symbol.for("autoxide.sample.market.2");
type Holder = { [KEY]?: Promise<MarketStore> | undefined };

async function lineageOf(categoryId: string): Promise<string[]> {
  const { data } = await listCategories();
  const out: string[] = [];
  let current = data.find((c) => c.id === categoryId);
  while (current) {
    out.push(current.id);
    const parent = current.parent_id;
    current = parent ? data.find((c) => c.id === parent) : undefined;
  }
  return out;
}

interface Rates {
  fee_vat: string;
  vat: string | null;
  pit: string | null;
}

async function ratesOn(day: string): Promise<Rates> {
  const [{ data: standard }, { data: withholding }] = await Promise.all([
    listTaxRates("vat.standard"),
    listWithholdingRates(),
  ]);
  const goods = (kind: "vat" | "pit") =>
    withholding.find(
      (r) =>
        r.business_line === "goods" &&
        r.tax_kind === kind &&
        r.effective_from <= day &&
        (r.effective_to === null || day < r.effective_to),
    )?.rate_percent ?? null;
  return {
    fee_vat: rateOn(standard, "vat.standard", day)?.rate_percent ?? "10",
    vat: goods("vat"),
    pit: goods("pit"),
  };
}

async function settleFor(
  fees: readonly FeeRule[],
  seller: Seller,
  gross: number,
  day: string,
): Promise<{ result: SettleResult; commission_bp: number; rates: Rates }> {
  const [lineage, rates] = await Promise.all([lineageOf(seller.category_id), ratesOn(day)]);
  const rule = commissionFor(fees, lineage, seller.seller_type, day);
  const commission_bp = rule?.rate_bp ?? 0;
  return {
    result: settle({
      gross,
      commission_bp,
      fee_vat_percent: rates.fee_vat,
      seller_type: seller.seller_type,
      vat_percent: rates.vat,
      pit_percent: rates.pit,
    }),
    commission_bp,
    rates,
  };
}

async function seed(): Promise<MarketStore> {
  const base = seedMarket();
  const sellerOf = (org: string) => base.sellers.find((s) => s.org_id === org) as Seller;
  const settlements: Settlement[] = [];
  for (const row of SETTLEMENT_SEEDS) {
    const seller = sellerOf(row.seller);
    const placed = at(row.placed * DAY);
    const { result, commission_bp, rates } = await settleFor(
      base.fees,
      seller,
      row.gross,
      dayOf(placed),
    );
    const withhold = withheldFor(seller.seller_type);
    settlements.push({
      id: uid("d0", row.n),
      order_id: marketOrderId(row.number),
      order_number: row.number,
      seller_org_id: row.seller,
      funds_flow: "partner_collect",
      gross: vnd(result.gross),
      subsidy: vnd(result.subsidy),
      fees: vnd(result.fees),
      fee_vat: vnd(result.fee_vat),
      withholding_vat: vnd(result.withholding_vat),
      withholding_pit: vnd(result.withholding_pit),
      net: vnd(result.net),
      breakdown: {
        commission_bp,
        vat_percent: withhold ? rates.vat : null,
        pit_percent: withhold ? rates.pit : null,
      },
      status: row.status,
      placed_at: placed,
      delivered_at: row.delivered === null ? null : at(row.delivered * DAY),
      completed_at: row.completed === null ? null : at(row.completed * DAY),
      hold_until: row.delivered === null ? null : at((row.delivered + 7) * DAY),
      payout_id: row.payout === null ? null : uid("e0", row.payout),
    });
  }
  const payouts: Payout[] = [];
  for (const row of PAYOUT_SEEDS) {
    const seller = sellerOf(row.seller);
    const { result } = await settleFor(base.fees, seller, row.gross, row.from);
    const id = uid("e0", row.n);
    const created = `${row.to}T17:00:00Z`;
    const ended = row.status === "paid" || row.status === "failed";
    payouts.push({
      id,
      seller_org_id: row.seller,
      period_from: row.from,
      period_to: row.to,
      order_count: row.orders,
      gross: vnd(result.gross),
      fees: vnd(result.fees),
      fee_vat: vnd(result.fee_vat),
      withholding_vat: vnd(result.withholding_vat),
      withholding_pit: vnd(result.withholding_pit),
      adjustments: vnd(0),
      amount: vnd(result.net),
      status: row.status,
      reference: `marketplace:payout:${id}`,
      attempts: ended ? 1 : 0,
      failure: row.failure ?? null,
      withholding_certificate:
        row.status === "paid" && withheldFor(seller.seller_type)
          ? `CTKT-${row.to.slice(2, 4)}${row.to.slice(5, 7)}-${String(row.n).padStart(4, "0")}`
          : null,
      sent_at: ended ? at(-10 * DAY) : null,
      paid_at: row.status === "paid" ? at(-10 * DAY + HOUR) : null,
      failed_at: row.status === "failed" ? at(-10 * DAY + HOUR) : null,
      created_at: created,
      updated_at: ended ? at(-10 * DAY + HOUR) : created,
    });
  }
  return { ...base, settlements, payouts };
}

async function store(): Promise<MarketStore> {
  const holder = globalThis as Holder;
  // Lỗi lúc dựng kho (vd khi máy chủ dev nạp lại giữa chừng) không được giữ lại: lần đọc sau dựng lại.
  holder[KEY] ??= seed().catch((error: unknown) => {
    holder[KEY] = undefined;
    throw error;
  });
  const s = await holder[KEY];
  await sync(s);
  return s;
}

/** Về dữ liệu ban đầu (test). */
export function resetSampleMarket(): void {
  (globalThis as Holder)[KEY] = seed();
}

// ---------------------------------------------------------------- Điều kiện bán (SellerGate)

export type KycState = "verified" | "pending" | "rejected" | "expired" | "none";

export interface KycSummary {
  state: KycState;
  method: KycProfile["method"] | null;
  /** Hồ sơ còn thiếu giấy tờ (cảnh báo của người xét). */
  documents_missing: boolean;
  reason_code: string | null;
  verified_at: string | null;
  expires_at: string | null;
  /** Có hồ sơ mới đang chờ (xác thực lại) trong khi hồ sơ cũ còn hạn. */
  renewal_pending: boolean;
}

/** Định danh để bán của một người bán, từ sổ KYC của Tuân thủ (hoạt động `sell`). */
export function kycOf(
  profiles: readonly KycProfile[],
  orgId: string,
  now = Date.now(),
): KycSummary {
  const own = profiles
    .filter((p) => p.subject_id === orgId && p.activity === "sell")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const live = own.find(
    (p) => p.status === "verified" && p.expires_at !== null && Date.parse(p.expires_at) > now,
  );
  const pending = own.find((p) => p.status === "pending");
  const latest = own[0];
  const summary = (state: KycState, p: KycProfile | undefined): KycSummary => ({
    state,
    method: p?.method ?? null,
    documents_missing: p?.documents_missing ?? false,
    reason_code: p?.reason_code ?? null,
    verified_at: p?.verified_at ?? null,
    expires_at: p?.expires_at ?? null,
    renewal_pending: state === "verified" && pending !== undefined,
  });
  if (live) return summary("verified", live);
  if (pending) return summary("pending", pending);
  if (!latest) return summary("none", undefined);
  if (latest.status === "rejected") return summary("rejected", latest);
  return summary("expired", latest);
}

export type RequirementKey =
  | "kyc"
  | "platform_rules"
  | "seller_agreement"
  | "documents"
  | "payout_account"
  | "review";

export interface Requirement {
  key: RequirementKey;
  ok: boolean;
  /** Tình trạng chi tiết, giao diện dịch ở `market.req.<key>.<state>`. */
  state: string;
  params: Record<string, string>;
  at: string | null;
}

/** Kết quả của "người bán này được bán không" kèm từng điều kiện (dự kiến trả kèm `GET /sellers/{id}`). */
export interface SellerGate {
  can_sell: boolean;
  /** Đủ điều kiện gửi hồ sơ cho sàn duyệt (mọi điều kiện trừ bước duyệt). */
  ready_to_submit: boolean;
  requirements: Requirement[];
  kyc: KycSummary;
}

const AGREEMENTS: readonly [RequirementKey, DocumentKind][] = [
  ["platform_rules", "platform_rules"],
  ["seller_agreement", "seller_agreement"],
];

async function requiredDocuments(categoryId: string): Promise<string[]> {
  const [lineage, { data: categories }, { data: rules }] = await Promise.all([
    lineageOf(categoryId),
    listCategories(),
    listRestrictionRules(),
  ]);
  const today = vietnamDay();
  const codes = new Set(
    categories.filter((c) => lineage.includes(c.id)).flatMap((c) => c.restriction_codes),
  );
  return [
    ...new Set(
      rules
        .filter(
          (r) =>
            codes.has(r.code) &&
            r.level === "conditional" &&
            r.effective_from <= today &&
            (r.effective_to === null || today < r.effective_to),
        )
        .flatMap((r) => r.required_documents),
    ),
  ];
}

async function gateWith(
  s: MarketStore,
  seller: Seller,
  profiles: readonly KycProfile[],
): Promise<SellerGate> {
  const kyc = kycOf(profiles, seller.org_id);
  const requirements: Requirement[] = [
    {
      key: "kyc",
      ok: kyc.state === "verified",
      state: kyc.state,
      params: { method: kyc.method ?? "", reason: kyc.reason_code ?? "" },
      at: kyc.state === "verified" || kyc.state === "expired" ? kyc.expires_at : null,
    },
  ];
  for (const [key, kind] of AGREEMENTS) {
    const accepted = await acceptanceOf(kind, seller.display_name);
    requirements.push({
      key,
      ok: accepted.accepted_at !== null,
      state: accepted.accepted_at ? "accepted" : "missing",
      params: { title: accepted.title, version: String(accepted.version ?? "") },
      at: accepted.accepted_at,
    });
  }
  const needed = await requiredDocuments(seller.category_id);
  const docs = s.documents.filter((d) => d.seller_org_id === seller.org_id);
  const missing = needed.filter(
    (type) => !docs.some((d) => d.doc_type === type && d.status === "approved"),
  );
  const waiting = missing.filter((type) =>
    docs.some((d) => d.doc_type === type && d.status === "submitted"),
  );
  requirements.push({
    key: "documents",
    ok: missing.length === 0,
    state:
      needed.length === 0
        ? "not_needed"
        : missing.length === 0
          ? "approved"
          : waiting.length === missing.length
            ? "submitted"
            : "missing",
    params: { documents: missing.join(",") },
    at: null,
  });
  requirements.push({
    key: "payout_account",
    ok: seller.payout_account !== null,
    state: seller.payout_account ? "set" : "missing",
    params: { last4: seller.payout_account?.number_last4 ?? "" },
    at: seller.payout_account?.updated_at ?? null,
  });
  const reviewed = seller.activated_at !== null;
  requirements.push({
    key: "review",
    ok: reviewed,
    state: reviewed ? "approved" : seller.status === "pending_review" ? "pending" : "not_submitted",
    params: {},
    at: reviewed ? seller.activated_at : seller.submitted_at,
  });
  const before = requirements.filter((r) => r.key !== "review");
  const legal = requirements.filter((r) =>
    ["kyc", "platform_rules", "seller_agreement", "documents"].includes(r.key),
  );
  return {
    can_sell: seller.status === "active" && legal.every((r) => r.ok),
    ready_to_submit: before.every((r) => r.ok),
    requirements,
    kyc,
  };
}

/** Một lần đọc: chạy các việc core làm bằng job hoặc khi nghe event. */
async function sync(s: MarketStore): Promise<void> {
  const now = Date.now();
  const { data: profiles } = await listKycProfiles();
  for (const seller of s.sellers) {
    if (seller.status !== "active" && seller.status !== "suspended") continue;
    const gate = await gateWith(s, seller, profiles);
    const kycOk = gate.requirements.find((r) => r.key === "kyc")?.ok ?? false;
    const docsOk = gate.requirements
      .filter((r) => r.key === "platform_rules" || r.key === "seller_agreement")
      .every((r) => r.ok);
    // Nghe event của `compliance`: KYC hết hạn hay văn bản mới chưa chấp nhận → tự tạm khoá kèm lý do.
    if (seller.status === "active" && (!kycOk || !docsOk)) {
      const reason: StatusReason = kycOk ? "agreement_not_accepted" : "kyc_expired";
      seller.status = "suspended";
      seller.status_reason = reason;
      seller.status_note = null;
      seller.updated_at = new Date(now).toISOString();
      seller.history.unshift({
        at: seller.updated_at,
        kind: "auto_suspended",
        actor: ID.SYSTEM,
        note: reason,
      });
    } else if (
      seller.status === "suspended" &&
      seller.status_reason !== null &&
      AUTO_REASONS.includes(seller.status_reason) &&
      kycOk &&
      docsOk
    ) {
      // Tạm khoá tự động gỡ khi điều kiện đủ lại; tạm khoá do người quyết thì phải "Mở lại".
      seller.status = "active";
      seller.history.unshift({
        at: new Date(now).toISOString(),
        kind: "auto_reinstated",
        actor: ID.SYSTEM,
        note: seller.status_reason,
      });
      seller.status_reason = null;
      seller.updated_at = new Date(now).toISOString();
    }
  }
  // Phát hiện tự động của sản phẩm đang chờ duyệt tính lại mỗi lần đọc: giấy tờ hay tình trạng người
  // bán đổi thì gợi ý đổi theo (bản đã quyết giữ ảnh chụp lúc quyết).
  for (const listing of s.listings) {
    if (listing.status !== "pending") continue;
    const seller = s.sellers.find((x) => x.org_id === listing.seller_org_id);
    if (seller) listing.findings = await findingsFor(s, seller, listing.category_id);
  }
  // Đối tác báo kết quả lệnh chi sau vài giây (webhook / truy vấn trạng thái của `PayoutGateway`).
  for (const payout of s.payouts) {
    if (payout.status !== "sent" || !payout.sent_at) continue;
    if (now - Date.parse(payout.sent_at) < 4_000) continue;
    const seller = s.sellers.find((x) => x.org_id === payout.seller_org_id);
    const fixed =
      payout.failure !== "account_name_mismatch" ||
      (seller?.payout_account && payout.failed_at
        ? Date.parse(seller.payout_account.updated_at) > Date.parse(payout.failed_at)
        : false);
    const doneAt = new Date(Date.parse(payout.sent_at) + 4_000).toISOString();
    if (fixed) {
      payout.status = "paid";
      payout.paid_at = doneAt;
      payout.failure = null;
      if (seller && withheldFor(seller.seller_type)) {
        payout.withholding_certificate ??= `CTKT-${payout.period_to.slice(2, 4)}${payout.period_to.slice(5, 7)}-${payout.id.slice(-4)}`;
      }
      for (const st of s.settlements) if (st.payout_id === payout.id) st.status = "paid";
    } else {
      payout.status = "failed";
      payout.failed_at = doneAt;
      for (const st of s.settlements) {
        if (st.payout_id === payout.id) {
          st.status = "releasable";
          st.payout_id = null;
        }
      }
    }
    payout.updated_at = doneAt;
  }
  // Người bán quá hạn trả lời → sàn phân xử (`marketplace.escalate_disputes`).
  for (const d of s.disputes) {
    if (d.status === "open" && Date.parse(d.seller_due_at) < now) {
      d.status = "escalated";
      d.messages.push({
        id: crypto.randomUUID(),
        author_kind: "platform",
        kind: "escalated",
        body: "",
        media_count: 0,
        at: d.seller_due_at,
      });
      d.updated_at = d.seller_due_at;
    }
  }
  // Qua hạn đổi trả, không có tranh chấp mở → chờ chi (`marketplace.release_settlements`).
  for (const st of s.settlements) {
    if (st.status !== "held" || !st.hold_until || Date.parse(st.hold_until) > now) continue;
    const open = s.disputes.some(
      (d) => d.order_id === st.order_id && d.status !== "resolved" && d.status !== "withdrawn",
    );
    if (!open) {
      st.status = "releasable";
      st.completed_at ??= st.hold_until;
    }
  }
}

// ---------------------------------------------------------------- Người bán

export interface SellerView extends Seller {
  gate: SellerGate;
  documents: SellerDocument[];
  category_name: string;
}

async function view(s: MarketStore, seller: Seller): Promise<SellerView> {
  const [{ data: profiles }, { data: categories }] = await Promise.all([
    listKycProfiles(),
    listCategories(),
  ]);
  return {
    ...structuredClone(seller),
    gate: await gateWith(s, seller, profiles),
    documents: s.documents.filter((d) => d.seller_org_id === seller.org_id).map((d) => ({ ...d })),
    category_name: categories.find((c) => c.id === seller.category_id)?.path ?? "",
  };
}

/** Thay bằng GET /api/v1/marketplace/sellers?status= (bước 46) khi core có. */
export async function listSellers(query: { status?: SellerStatus } = {}): Promise<{
  data: SellerView[];
}> {
  const s = await store();
  const list = s.sellers.filter((x) => !query.status || x.status === query.status);
  return { data: await Promise.all(list.map((x) => view(s, x))) };
}

/** Thay bằng GET /api/v1/marketplace/sellers/{org_id} (bước 46) khi core có. */
export async function getSeller(orgId: string): Promise<{ data: SellerView } | null> {
  const s = await store();
  const seller = s.sellers.find((x) => x.org_id === orgId);
  return seller ? { data: await view(s, seller) } : null;
}

/**
 * Thay bằng GET /api/v1/marketplace/sellers/me (bước 46) khi core có: core biết người đăng nhập là
 * thành viên của nút người bán nào. Giao diện mẫu không biết, nên người bán thật (có `marketplace.sell`)
 * thấy gian hàng mẫu đầu tiên (Gia Dụng Nhà Na).
 */
export async function getMySeller(): Promise<{ data: SellerView } | null> {
  return getSeller(SELLER.nhaNa);
}

/** Số người bán theo trạng thái (cho ô số liệu và chip lọc). */
export async function sellerCounts(): Promise<Record<SellerStatus, number>> {
  const s = await store();
  const out = {
    draft: 0,
    pending_verification: 0,
    pending_review: 0,
    active: 0,
    suspended: 0,
    terminated: 0,
  } satisfies Record<SellerStatus, number>;
  for (const x of s.sellers) out[x.status] += 1;
  return out;
}

export type SellerTransition = "approve" | "reject" | "suspend" | "reinstate" | "terminate";

const TRANSITIONS: Record<SellerTransition, { from: SellerStatus[]; to: SellerStatus }> = {
  approve: { from: ["pending_review"], to: "active" },
  reject: { from: ["pending_review"], to: "pending_verification" },
  suspend: { from: ["active"], to: "suspended" },
  reinstate: { from: ["suspended"], to: "active" },
  terminate: {
    from: ["active", "suspended", "pending_review", "pending_verification"],
    to: "terminated",
  },
};

/**
 * Thay bằng POST /api/v1/marketplace/sellers/{org_id}/transitions `{to, reason}` (bước 46, `If-Match`)
 * khi core có. Duyệt chỉ khi đủ điều kiện (KYC, văn bản, giấy tờ); từ chối, tạm khoá, chấm dứt bắt
 * buộc lý do. Trả trạng thái cũ để Hoàn tác (tạm khoá ↔ mở lại).
 */
export async function transitionSeller(
  orgId: string,
  input: { transition: string; reason: string },
  actor: string,
): Promise<SampleOutcome<{ seller: Seller; previous: SellerStatus }>> {
  const s = await store();
  const seller = s.sellers.find((x) => x.org_id === orgId);
  if (!seller) return failed(404, "marketplace.seller_not_found", "No seller has this id.");
  const rule = TRANSITIONS[input.transition as SellerTransition];
  if (!rule) {
    return invalid([{ field: "transition", code: "unknown", detail: "unknown transition" }]);
  }
  if (!rule.from.includes(seller.status)) {
    return failed(409, "marketplace.invalid_transition", `${seller.status} → ${rule.to}`);
  }
  const reason = input.reason.trim();
  const needsReason = input.transition !== "approve" && input.transition !== "reinstate";
  if (needsReason && (reason.length < 10 || reason.length > 500)) {
    return invalid([{ field: "reason", code: "length_10_500", detail: "10 to 500 characters" }]);
  }
  if (input.transition === "approve" || input.transition === "reinstate") {
    const gate = await gateWith(s, seller, (await listKycProfiles()).data);
    const blocker = gate.requirements.find(
      (r) => r.key !== "review" && r.key !== "payout_account" && !r.ok,
    );
    if (blocker) return blockerProblem(blocker);
  }
  const previous = seller.status;
  const now = new Date().toISOString();
  seller.status = rule.to;
  seller.status_reason =
    input.transition === "suspend"
      ? "manual"
      : input.transition === "reject"
        ? "rejected"
        : input.transition === "terminate"
          ? "terminated"
          : null;
  seller.status_note = needsReason ? reason : null;
  if (input.transition === "approve") seller.activated_at ??= now;
  if (input.transition === "reject") seller.submitted_at = null;
  seller.updated_at = now;
  seller.history.unshift({
    at: now,
    kind: input.transition === "approve" ? "approved" : input.transition,
    actor,
    note: needsReason ? reason : null,
  });
  return { ok: true, data: { seller: structuredClone(seller), previous } };
}

/** Lỗi của điều kiện đầu tiên chưa đủ, theo mã của đặc tả. */
function blockerProblem(req: Requirement): SampleOutcome<never> {
  if (req.key === "kyc") {
    return failed(403, "marketplace.kyc_required", "Identity verification is not complete.");
  }
  if (req.key === "platform_rules" || req.key === "seller_agreement") {
    return failed(
      403,
      "marketplace.agreement_not_accepted",
      `${req.params.title ?? ""} · ${req.params.version ?? ""}`,
    );
  }
  if (req.key === "documents") {
    return failed(422, "marketplace.documents_missing", req.params.documents ?? "");
  }
  return failed(422, "marketplace.payout_account_missing", "No payout account.");
}

/** Thay bằng POST /api/v1/marketplace/documents/{id}/decision (bước 46) khi core có. */
export async function decideDocument(
  id: string,
  input: { decision: string; note: string },
  actor: string,
): Promise<SampleOutcome<SellerDocument>> {
  const s = await store();
  const doc = s.documents.find((d) => d.id === id);
  if (!doc) return failed(404, "marketplace.document_not_found", "No document has this id.");
  if (doc.status !== "submitted") {
    return failed(409, "marketplace.invalid_transition", `${doc.status} → ${input.decision}`);
  }
  if (input.decision !== "approved" && input.decision !== "rejected") {
    return invalid([{ field: "decision", code: "unknown", detail: "unknown decision" }]);
  }
  if (input.decision === "rejected" && input.note.trim().length < 10) {
    return invalid([{ field: "note", code: "length_10_500", detail: "10 to 500 characters" }]);
  }
  doc.status = input.decision;
  doc.review_note = input.note.trim() || null;
  doc.updated_at = new Date().toISOString();
  const seller = s.sellers.find((x) => x.org_id === doc.seller_org_id);
  seller?.history.unshift({
    at: doc.updated_at,
    kind: `document_${input.decision}`,
    actor,
    note: doc.doc_type,
  });
  return { ok: true, data: { ...doc } };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Mới (chưa có trong đặc tả 46): mời người bán bằng lời mời của bước 34 gắn vào nút sàn. Người được
 * mời tự đăng ký (`POST /sellers`), xác thực danh tính và chấp nhận văn bản.
 */
export async function inviteSeller(input: {
  email: string;
  seller_type: string;
  note: string;
}): Promise<SampleOutcome<SellerInvitation>> {
  const s = await store();
  const errors: NonNullable<Problem["errors"]> = [];
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) errors.push({ field: "email", code: "email", detail: "not an email" });
  else if (s.invitations.some((i) => i.email === email)) {
    errors.push({ field: "email", code: "taken", detail: "already invited" });
  }
  if (!SELLER_TYPES.includes(input.seller_type as SellerType)) {
    errors.push({ field: "seller_type", code: "unknown", detail: "unknown type" });
  }
  if (input.note.length > 500) {
    errors.push({ field: "note", code: "length_0_500", detail: "at most 500 characters" });
  }
  if (errors.length > 0) return invalid(errors);
  const invitation: SellerInvitation = {
    id: crypto.randomUUID(),
    email,
    seller_type: input.seller_type as SellerType,
    note: input.note.trim(),
    created_at: new Date().toISOString(),
  };
  s.invitations.unshift(invitation);
  return { ok: true, data: { ...invitation } };
}

export async function listInvitations(): Promise<{ data: SellerInvitation[] }> {
  return { data: (await store()).invitations.map((i) => ({ ...i })) };
}

// ---------------------------------------------------------------- Duyệt sản phẩm

async function findingsFor(s: MarketStore, seller: Seller, categoryId: string): Promise<Finding[]> {
  const [lineage, { data: categories }, { data: rules }] = await Promise.all([
    lineageOf(categoryId),
    listCategories(),
    listRestrictionRules(),
  ]);
  const today = vietnamDay();
  const codes = new Set(
    categories.filter((c) => lineage.includes(c.id)).flatMap((c) => c.restriction_codes),
  );
  const out: Finding[] = [];
  const docs = s.documents.filter(
    (d) => d.seller_org_id === seller.org_id && d.status === "approved",
  );
  for (const rule of rules) {
    if (!codes.has(rule.code) || rule.effective_from > today) continue;
    if (rule.effective_to !== null && today >= rule.effective_to) continue;
    if (rule.level === "prohibited") {
      out.push({
        code: "prohibited",
        params: { rule: rule.names.vi ?? rule.code },
        legal_basis: rule.legal_basis,
      });
      continue;
    }
    const missing = rule.required_documents.filter(
      (type) => !docs.some((d) => d.doc_type === type),
    );
    if (missing.length > 0) {
      out.push({
        code: "documents_missing",
        params: { rule: rule.names.vi ?? rule.code, documents: missing.join(",") },
        legal_basis: rule.legal_basis,
      });
    }
  }
  const gate = await gateWith(s, seller, (await listKycProfiles()).data);
  if (!gate.can_sell) {
    out.push({ code: "seller_not_eligible", params: { status: seller.status }, legal_basis: null });
  }
  return out;
}

export interface ListingView extends ListingReview {
  seller_name: string;
  category_name: string;
}

/** Thay bằng GET /api/v1/marketplace/listing-reviews?status=&seller= (bước 46) khi core có. */
export async function listListingReviews(
  query: { status?: ListingStatus; seller?: string } = {},
): Promise<{ data: ListingView[] }> {
  const s = await store();
  const { data: categories } = await listCategories();
  return {
    data: s.listings
      .filter(
        (l) =>
          (!query.status || l.status === query.status) &&
          (!query.seller || l.seller_org_id === query.seller),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((l) => ({
        ...structuredClone(l),
        seller_name: s.sellers.find((x) => x.org_id === l.seller_org_id)?.display_name ?? "",
        category_name: categoryPath(categories, l.category_id),
      })),
  };
}

function categoryPath(categories: readonly CategorySummary[], id: string): string {
  return categories.find((c) => c.id === id)?.path ?? "";
}

/**
 * Thay bằng POST /api/v1/marketplace/listing-reviews/{id}/decision (bước 46) khi core có. Hàng có điều
 * kiện thiếu giấy tờ hay hàng cấm thì không duyệt được; người bán chưa đủ điều kiện thì vẫn duyệt được
 * nhưng sản phẩm chỉ hiện khi người bán đủ điều kiện (`ListingGate`). `pending` chỉ dùng cho Hoàn tác
 * của "Duyệt" (đề xuất).
 */
export async function decideListing(
  id: string,
  input: { decision: string; reason: string },
  actor: string,
): Promise<SampleOutcome<{ listing: ListingReview; previous: ListingStatus }>> {
  const s = await store();
  const listing = s.listings.find((l) => l.id === id);
  if (!listing)
    return failed(404, "marketplace.listing_not_found", "No listing review has this id.");
  const allowed: Record<string, ListingStatus[]> = {
    approved: ["pending"],
    rejected: ["pending"],
    delisted: ["approved"],
    pending: ["approved"],
  };
  const from = allowed[input.decision];
  if (!from) return invalid([{ field: "decision", code: "unknown", detail: "unknown decision" }]);
  if (!from.includes(listing.status)) {
    return failed(409, "marketplace.invalid_transition", `${listing.status} → ${input.decision}`);
  }
  const reason = input.reason.trim();
  if (
    (input.decision === "rejected" || input.decision === "delisted") &&
    (reason.length < 10 || reason.length > 500)
  ) {
    return invalid([{ field: "reason", code: "length_10_500", detail: "10 to 500 characters" }]);
  }
  if (input.decision === "approved") {
    const seller = s.sellers.find((x) => x.org_id === listing.seller_org_id);
    const fresh = seller ? await findingsFor(s, seller, listing.category_id) : [];
    listing.findings = fresh;
    const blocking = fresh.find((f) => f.code === "documents_missing" || f.code === "prohibited");
    if (blocking?.code === "prohibited") {
      return failed(409, "marketplace.listing_rejected", blocking.params.rule ?? "");
    }
    if (blocking)
      return failed(422, "marketplace.documents_missing", blocking.params.documents ?? "");
  }
  const previous = listing.status;
  listing.status = input.decision as ListingStatus;
  listing.reason = input.decision === "pending" ? null : reason || null;
  listing.decided_by = input.decision === "pending" ? null : actor;
  listing.decided_at = input.decision === "pending" ? null : new Date().toISOString();
  return { ok: true, data: { listing: structuredClone(listing), previous } };
}

// ---------------------------------------------------------------- Phí sàn

export type FeeState = "current" | "scheduled" | "past";

export interface FeeRuleView extends FeeRule {
  state: FeeState;
  category_name: string | null;
}

/** Thay bằng GET /api/v1/marketplace/fee-rules (bước 46) khi core có. Mới hiệu lực trước. */
export async function listFeeRules(): Promise<{ data: FeeRuleView[] }> {
  const s = await store();
  const { data: categories } = await listCategories();
  const today = vietnamDay();
  return {
    data: [...s.fees]
      .sort(
        (a, b) =>
          b.effective_from.localeCompare(a.effective_from) || a.fee_kind.localeCompare(b.fee_kind),
      )
      .map((r) => ({
        ...structuredClone(r),
        state: r.effective_from > today ? "scheduled" : ruleActiveOn(r, today) ? "current" : "past",
        category_name: r.category_id ? categoryPath(categories, r.category_id) : null,
      })),
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function dayBefore(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - DAY).toISOString().slice(0, 10);
}

/**
 * Thay bằng POST /api/v1/marketplace/fee-rules (bước 46) khi core có. Chỉ thêm: dòng cũ cùng loại và
 * phạm vi đang mở tự đóng vào ngày trước ngày hiệu lực của dòng mới; không thêm phí có hiệu lực trong
 * quá khứ; dòng khác cùng phạm vi bắt đầu từ ngày đó trở đi thì báo chồng nhau.
 */
export async function addFeeRule(
  input: {
    fee_kind: string;
    category_id: string;
    seller_type: string;
    rate: string;
    effective_from: string;
  },
  actor: string,
): Promise<SampleOutcome<FeeRule>> {
  const s = await store();
  const errors: NonNullable<Problem["errors"]> = [];
  const today = vietnamDay();
  if (!FEE_KINDS.includes(input.fee_kind as FeeKind) || input.fee_kind === "storage") {
    errors.push({ field: "fee_kind", code: "unknown", detail: "unknown kind" });
  }
  const { data: categories } = await listCategories();
  const category = input.category_id || null;
  if (category && !categories.some((c) => c.id === category)) {
    errors.push({ field: "category_id", code: "unknown", detail: "unknown category" });
  }
  const sellerType = input.seller_type || null;
  if (sellerType && !SELLER_TYPES.includes(sellerType as SellerType)) {
    errors.push({ field: "seller_type", code: "unknown", detail: "unknown type" });
  }
  const bp = parseRateBp(input.rate);
  if (bp === null) errors.push({ field: "rate", code: "rate_percent", detail: "0 to 30%" });
  if (!DATE.test(input.effective_from)) {
    errors.push({ field: "effective_from", code: "required", detail: "must be a date" });
  } else if (input.effective_from <= today) {
    // Ngày hiệu lực sớm nhất là ngày mai: đơn đặt hôm nay đã chụp phí hiện hành.
    errors.push({ field: "effective_from", code: "fee_rule_in_past", detail: dayAfter(today) });
  }
  if (errors.length > 0) return invalid(errors);
  const same = (r: FeeRule) =>
    r.fee_kind === input.fee_kind && r.category_id === category && r.seller_type === sellerType;
  const later = s.fees.find((r) => same(r) && r.effective_from >= input.effective_from);
  if (later) {
    return failed(409, "marketplace.fee_rule_overlap", later.effective_from);
  }
  for (const r of s.fees) {
    if (same(r) && r.effective_to === null) r.effective_to = dayBefore(input.effective_from);
  }
  const rule: FeeRule = {
    id: crypto.randomUUID(),
    fee_kind: input.fee_kind as FeeKind,
    category_id: category,
    seller_type: sellerType as SellerType | null,
    rate_bp: bp,
    fixed: null,
    unit: null,
    includes_vat: true,
    effective_from: input.effective_from,
    effective_to: null,
    created_by: actor,
    created_at: new Date().toISOString(),
  };
  s.fees.push(rule);
  return { ok: true, data: { ...rule } };
}

function dayAfter(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
}

/** "6", "5,5", "6%" → basis point; nhận 0–30% (trần hợp lý cho hoa hồng), tối đa hai số lẻ. */
export function parseRateBp(text: string): number | null {
  const clean = text.trim().replace(/%$/, "").trim().replace(",", ".");
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(clean)) return null;
  const bp = Math.round(Number(clean) * 100);
  return bp >= 0 && bp <= 3_000 ? bp : null;
}

/**
 * Thay bằng POST /api/v1/marketplace/fee-rules/{id}/close (bước 46) khi core có. Chỉ huỷ được dòng chưa
 * tới ngày hiệu lực; dòng cũ đã tự đóng vì dòng này mở lại như trước.
 */
export async function cancelFeeRule(id: string): Promise<SampleOutcome<FeeRule>> {
  const s = await store();
  const rule = s.fees.find((r) => r.id === id);
  if (!rule) return failed(404, "marketplace.fee_rule_not_found", "No fee rule has this id.");
  if (rule.effective_from <= vietnamDay()) {
    return failed(409, "marketplace.fee_rule_in_effect", rule.effective_from);
  }
  s.fees = s.fees.filter((r) => r.id !== id);
  const closed = dayBefore(rule.effective_from);
  for (const r of s.fees) {
    if (
      r.fee_kind === rule.fee_kind &&
      r.category_id === rule.category_id &&
      r.seller_type === rule.seller_type &&
      r.effective_to === closed
    ) {
      r.effective_to = null;
    }
  }
  return { ok: true, data: { ...rule } };
}

export interface FeePreview {
  gross: Money;
  commission_bp: number;
  rule_id: string | null;
  fees: Money;
  fee_vat: Money;
  withholding_vat: Money;
  withholding_pit: Money;
  vat_percent: string | null;
  pit_percent: string | null;
  net: Money;
  day: string;
}

/**
 * Thay bằng GET /api/v1/marketplace/fee-rules/preview?category_id=&price=&seller_type=&date= (bước 46).
 * Chỉ tính, không ghi.
 */
export async function previewFees(input: {
  category_id: string;
  price: string;
  seller_type: string;
  date: string;
}): Promise<SampleOutcome<FeePreview>> {
  const s = await store();
  const errors: NonNullable<Problem["errors"]> = [];
  const { data: categories } = await listCategories();
  if (!categories.some((c) => c.id === input.category_id)) {
    errors.push({ field: "category_id", code: "unknown", detail: "unknown category" });
  }
  const price = Number(input.price.replace(/[\s.,]/g, ""));
  if (!/^[\d\s.,]+$/.test(input.price.trim()) || !Number.isSafeInteger(price) || price <= 0) {
    errors.push({ field: "price", code: "money_vnd", detail: "whole dong" });
  }
  if (!SELLER_TYPES.includes(input.seller_type as SellerType)) {
    errors.push({ field: "seller_type", code: "unknown", detail: "unknown type" });
  }
  const day = DATE.test(input.date) ? input.date : vietnamDay();
  if (errors.length > 0) return invalid(errors);
  const lineage = await lineageOf(input.category_id);
  const rule = commissionFor(s.fees, lineage, input.seller_type as SellerType, day);
  const rates = await ratesOn(day);
  const result = settle({
    gross: price,
    commission_bp: rule?.rate_bp ?? 0,
    fee_vat_percent: rates.fee_vat,
    seller_type: input.seller_type as SellerType,
    vat_percent: rates.vat,
    pit_percent: rates.pit,
  });
  const withhold = withheldFor(input.seller_type as SellerType);
  return {
    ok: true,
    data: {
      gross: vnd(result.gross),
      commission_bp: rule?.rate_bp ?? 0,
      rule_id: rule?.id ?? null,
      fees: vnd(result.fees),
      fee_vat: vnd(result.fee_vat),
      withholding_vat: vnd(result.withholding_vat),
      withholding_pit: vnd(result.withholding_pit),
      vat_percent: withhold ? rates.vat : null,
      pit_percent: withhold ? rates.pit : null,
      net: vnd(result.net),
      day,
    },
  };
}

// ---------------------------------------------------------------- Quyết toán và chi trả

/** Thay bằng GET /api/v1/marketplace/settlements?seller=&status= (bước 46) khi core có. */
export async function listSettlements(
  query: { seller?: string; status?: SettlementStatus } = {},
): Promise<{ data: (Settlement & { seller_name: string })[] }> {
  const s = await store();
  return {
    data: s.settlements
      .filter(
        (x) =>
          (!query.seller || x.seller_org_id === query.seller) &&
          (!query.status || x.status === query.status),
      )
      .sort((a, b) => b.placed_at.localeCompare(a.placed_at))
      .map((x) => ({
        ...structuredClone(x),
        seller_name: s.sellers.find((y) => y.org_id === x.seller_org_id)?.display_name ?? "",
      })),
  };
}

export interface PayoutView extends Payout {
  seller_name: string;
  seller_type: SellerType;
  /** Người bán có được nhận chi trả mới không (trạng thái `active`, đủ điều kiện). */
  seller_can_receive: boolean;
}

/** Thay bằng GET /api/v1/marketplace/payouts?seller=&status= (bước 46) khi core có. Mới trước. */
export async function listPayouts(
  query: { seller?: string; status?: PayoutStatus } = {},
): Promise<{ data: PayoutView[] }> {
  const s = await store();
  const { data: profiles } = await listKycProfiles();
  const out: PayoutView[] = [];
  for (const p of s.payouts) {
    if (
      (query.seller && p.seller_org_id !== query.seller) ||
      (query.status && p.status !== query.status)
    )
      continue;
    const seller = s.sellers.find((x) => x.org_id === p.seller_org_id);
    out.push({
      ...structuredClone(p),
      seller_name: seller?.display_name ?? "",
      seller_type: seller?.seller_type ?? "enterprise",
      seller_can_receive: seller ? (await gateWith(s, seller, profiles)).can_sell : false,
    });
  }
  return {
    data: out.sort(
      (a, b) =>
        b.period_to.localeCompare(a.period_to) || a.seller_name.localeCompare(b.seller_name),
    ),
  };
}

export interface MoneyStats {
  /** Phần của người bán còn nằm ở tài khoản thu hộ của đối tác (chưa hết hạn đổi trả). */
  held: Money;
  held_orders: number;
  /** Đợt chi đang lập (chờ gửi). */
  building: Money;
  building_count: number;
  /** Đã chi trong tháng (theo ngày chi). */
  paid_month: Money;
  paid_count: number;
}

/** Đề xuất (mới): số liệu tổng của chi trả, cho cả sàn hay một người bán. */
export async function moneyStats(seller?: string): Promise<{ data: MoneyStats }> {
  const s = await store();
  const mine = <T extends { seller_org_id: string }>(list: T[]) =>
    list.filter((x) => !seller || x.seller_org_id === seller);
  const held = mine(s.settlements).filter((x) =>
    ["pending", "held", "releasable"].includes(x.status),
  );
  const building = mine(s.payouts).filter((p) => p.status === "building" || p.status === "sent");
  const month = vietnamDay().slice(0, 7);
  const paid = mine(s.payouts).filter(
    (p) => p.status === "paid" && p.paid_at && dayOf(p.paid_at).startsWith(month),
  );
  const sum = (list: { amount: number }[]) => list.reduce((a, b) => a + b.amount, 0);
  return {
    data: {
      held: vnd(sum(held.map((x) => ({ amount: amount(x.net) })))),
      held_orders: held.length,
      building: vnd(sum(building.map((p) => ({ amount: amount(p.amount) })))),
      building_count: building.length,
      paid_month: vnd(sum(paid.map((p) => ({ amount: amount(p.amount) })))),
      paid_count: paid.length,
    },
  };
}

/**
 * Đề xuất (mới, thay cho job `marketplace.send_payout` chạy theo lịch): gửi ngay một đợt chi đang lập.
 * Người bán phải đủ điều kiện nhận chi trả mới (`marketplace.seller_not_active`). Lệnh gửi ngoài
 * transaction; đối tác báo kết quả sau (vài giây ở đây).
 */
export async function sendPayout(id: string): Promise<SampleOutcome<Payout>> {
  return dispatch(id, ["building"]);
}

/** Thay bằng POST /api/v1/marketplace/payouts/{id}/retry (bước 46) khi core có: cùng `reference`. */
export async function retryPayout(id: string): Promise<SampleOutcome<Payout>> {
  return dispatch(id, ["failed"]);
}

async function dispatch(id: string, from: PayoutStatus[]): Promise<SampleOutcome<Payout>> {
  const s = await store();
  const payout = s.payouts.find((p) => p.id === id);
  if (!payout) return failed(404, "marketplace.payout_not_found", "No payout has this id.");
  if (!from.includes(payout.status)) {
    return failed(409, "marketplace.payout_not_retryable", payout.status);
  }
  const seller = s.sellers.find((x) => x.org_id === payout.seller_org_id);
  if (!seller) return failed(404, "marketplace.seller_not_found", "No seller has this id.");
  if (!seller.payout_account) {
    return failed(422, "marketplace.payout_account_missing", seller.display_name);
  }
  const gate = await gateWith(s, seller, (await listKycProfiles()).data);
  if (!gate.can_sell) return failed(409, "marketplace.seller_not_active", seller.display_name);
  const now = new Date().toISOString();
  payout.status = "sent";
  payout.sent_at = now;
  payout.attempts += 1;
  payout.updated_at = now;
  return { ok: true, data: { ...payout } };
}

// ---------------------------------------------------------------- Tranh chấp

export interface DisputeView extends Dispute {
  seller_name: string;
}

/** Thay bằng GET /api/v1/marketplace/disputes?status=&seller= (bước 46) khi core có. */
export async function listDisputes(
  query: { status?: DisputeStatus; seller?: string } = {},
): Promise<{ data: DisputeView[] }> {
  const s = await store();
  return {
    data: s.disputes
      .filter(
        (d) =>
          (!query.status || d.status === query.status) &&
          (!query.seller || d.seller_org_id === query.seller),
      )
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((d) => ({
        ...structuredClone(d),
        seller_name: s.sellers.find((x) => x.org_id === d.seller_org_id)?.display_name ?? "",
      })),
  };
}

function parseDong(text: string): number | null {
  const raw = text.trim().replace(/[\s.,]/g, "");
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Hoàn tiền đi qua `orders` → đối tác thu hộ; phần của người bán trong quyết toán giảm theo. */
function applyRefund(s: MarketStore, d: Dispute, refund: number): void {
  if (refund <= 0) return;
  const st = s.settlements.find((x) => x.order_id === d.order_id);
  if (!st) return;
  if (refund >= amount(st.gross)) {
    st.status = "reversed";
    return;
  }
  // Quyết toán tính lại theo phần còn lại (tỉ lệ ảnh chụp lúc đặt).
  const seller = s.sellers.find((x) => x.org_id === st.seller_org_id);
  const result = settle({
    gross: amount(st.gross) - refund,
    commission_bp: st.breakdown.commission_bp,
    fee_vat_percent: "10",
    seller_type: seller?.seller_type ?? "enterprise",
    vat_percent: st.breakdown.vat_percent,
    pit_percent: st.breakdown.pit_percent,
  });
  st.gross = vnd(result.gross);
  st.fees = vnd(result.fees);
  st.fee_vat = vnd(result.fee_vat);
  st.withholding_vat = vnd(result.withholding_vat);
  st.withholding_pit = vnd(result.withholding_pit);
  st.net = vnd(result.net);
}

/**
 * Thay bằng POST /api/v1/marketplace/disputes/{id}/transitions `{to: resolved, resolution, amount,
 * reason}` (bước 46, `marketplace.disputes.resolve`) khi core có. Chỉ phân xử tranh chấp đang chờ sàn;
 * số hoàn không vượt số người mua đã trả cho phần của người bán. Hoàn tiền không đảo được.
 */
export async function resolveDispute(
  id: string,
  input: { resolution: string; amount: string; reason: string; acknowledged: boolean },
  actor: string,
): Promise<SampleOutcome<Dispute>> {
  const s = await store();
  const d = s.disputes.find((x) => x.id === id);
  if (!d) return failed(404, "marketplace.dispute_not_found", "No dispute has this id.");
  if (d.status !== "escalated") {
    return failed(409, "marketplace.invalid_transition", `${d.status} → resolved`);
  }
  const errors: NonNullable<Problem["errors"]> = [];
  const resolution = input.resolution as Resolution;
  if (!RESOLUTIONS.includes(resolution)) {
    errors.push({ field: "resolution", code: "unknown", detail: "choose a resolution" });
  }
  let refund = 0;
  if (resolution === "refund_full") refund = amount(d.claim);
  if (resolution === "refund_partial") {
    const value = parseDong(input.amount);
    if (value === null) errors.push({ field: "amount", code: "money_vnd", detail: "whole dong" });
    else if (value > amount(d.paid)) {
      errors.push({ field: "amount", code: "resolution_exceeds_order", detail: d.paid.amount });
    } else refund = value;
  }
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 2000) {
    errors.push({ field: "reason", code: "length_10_2000", detail: "10 to 2000 characters" });
  }
  if (!input.acknowledged)
    errors.push({ field: "acknowledged", code: "acknowledge", detail: "confirm" });
  if (errors.length > 0) return invalid(errors);
  const now = new Date().toISOString();
  d.status = "resolved";
  d.resolution = resolution;
  d.resolution_amount = vnd(refund);
  d.resolved_by = actor;
  d.resolved_at = now;
  d.updated_at = now;
  d.messages.push({
    id: crypto.randomUUID(),
    author_kind: "platform",
    kind: "decision",
    body: reason,
    media_count: 0,
    at: now,
  });
  applyRefund(s, d, refund);
  if (refund > 0) {
    const m = s.metrics.get(d.seller_org_id);
    if (m) m.disputes_lost += 1;
  }
  return { ok: true, data: structuredClone(d) };
}

// ---------------------------------------------------------------- Điểm vi phạm

export interface Performance {
  metrics: SellerMetrics | null;
  penalties: Penalty[];
  points: number;
}

/** Thay bằng GET /api/v1/marketplace/sellers/{org_id}/performance (bước 46) khi core có. */
export async function sellerPerformance(orgId: string): Promise<{ data: Performance }> {
  const s = await store();
  const penalties = s.penalties.filter(
    (p) => p.seller_org_id === orgId && Date.parse(p.expires_at) > Date.now(),
  );
  return {
    data: {
      metrics: s.metrics.get(orgId) ? { ...(s.metrics.get(orgId) as SellerMetrics) } : null,
      penalties: penalties.map((p) => ({ ...p })),
      points: penalties.reduce((a, p) => a + p.points, 0),
    },
  };
}

/** Một điểm của xu hướng chỉ số: chỉ số 90 ngày tính tới ngày `day` (giờ Việt Nam). */
export interface SellerMetricPoint {
  day: string;
  on_time_bp: number;
  seller_cancel_bp: number;
}

// Hình dạng 13 tuần của bộ mẫu, lệch so với số hiện tại (basis point, tuần cuối = 0): giao đúng hạn
// nhích dần lên, huỷ do người bán giảm dần — người bán đang cải thiện sau đợt điểm vi phạm.
const ON_TIME_SHAPE = [-130, -110, -120, -90, -80, -70, -60, -40, -50, -30, -20, -10, 0];
const CANCEL_SHAPE = [70, 65, 75, 55, 50, 45, 40, 30, 35, 20, 10, 5, 0];

/**
 * Đề xuất mới: GET /api/v1/marketplace/sellers/{id}/metrics/history?days=90 (bước 46; chỉ số 90 ngày
 * cuốn chiếu, mỗi tuần một điểm, điểm cuối là số hiện tại). Bộ mẫu dựng từ số hiện tại của người bán;
 * chưa có số hiện tại thì không có xu hướng.
 */
export async function sellerMetricHistory(
  orgId: string,
  now = Date.now(),
): Promise<{ data: SellerMetricPoint[] }> {
  const s = await store();
  const current = s.metrics.get(orgId);
  if (!current) return { data: [] };
  const clamp = (bp: number) => Math.max(0, Math.min(10_000, bp));
  const day = 86_400_000;
  return {
    data: ON_TIME_SHAPE.map((onTime, i) => ({
      day: new Date(now + 7 * 3_600_000 - (ON_TIME_SHAPE.length - 1 - i) * 7 * day)
        .toISOString()
        .slice(0, 10),
      on_time_bp: clamp(current.on_time_bp + onTime),
      seller_cancel_bp: clamp(current.seller_cancel_bp + (CANCEL_SHAPE[i] ?? 0)),
    })),
  };
}

/**
 * Thay bằng POST /api/v1/marketplace/penalties (bước 46, `marketplace.sellers.manage`) khi core có. Hạn
 * điểm 90 ngày; tạm khoá theo ngày đổi trạng thái người bán.
 */
export async function addPenalty(
  orgId: string,
  input: { rule_code: string; points: string; sanction: string; reason: string },
  actor: string,
): Promise<SampleOutcome<Penalty>> {
  const s = await store();
  const seller = s.sellers.find((x) => x.org_id === orgId);
  if (!seller) return failed(404, "marketplace.seller_not_found", "No seller has this id.");
  const errors: NonNullable<Problem["errors"]> = [];
  if (!(PENALTY_RULES as readonly string[]).includes(input.rule_code)) {
    errors.push({ field: "rule_code", code: "unknown", detail: "unknown rule" });
  }
  const points = Number(input.points);
  if (!/^\d{1,2}$/.test(input.points.trim()) || points < 1 || points > 10) {
    errors.push({ field: "points", code: "range_1_10", detail: "1 to 10" });
  }
  if (!SANCTIONS.includes(input.sanction as Sanction)) {
    errors.push({ field: "sanction", code: "unknown", detail: "unknown sanction" });
  }
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 500) {
    errors.push({ field: "reason", code: "length_10_500", detail: "10 to 500 characters" });
  }
  if (errors.length > 0) return invalid(errors);
  const now = new Date().toISOString();
  const penalty: Penalty = {
    id: crypto.randomUUID(),
    seller_org_id: orgId,
    rule_code: input.rule_code,
    points,
    sanction: input.sanction as Sanction,
    reason,
    expires_at: at(90 * DAY),
    appealed: false,
    appeal_reason: null,
    created_by: actor,
    created_at: now,
  };
  s.penalties.unshift(penalty);
  seller.penalty_points += points;
  seller.history.unshift({ at: now, kind: "penalty", actor, note: input.rule_code });
  if (penalty.sanction === "suspend_days" && seller.status === "active") {
    seller.status = "suspended";
    seller.status_reason = "penalty";
    seller.status_note = reason;
    seller.updated_at = now;
  }
  return { ok: true, data: { ...penalty } };
}

// ---------------------------------------------------------------- Trung tâm người bán (của mình)

function mine(s: MarketStore, orgId: string): Seller | null {
  return s.sellers.find((x) => x.org_id === orgId) ?? null;
}

/**
 * Thay bằng POST /api/v1/marketplace/sellers/me/submit (bước 46) khi core có: kiểm đủ KYC, văn bản,
 * giấy tờ, tài khoản nhận tiền → chờ sàn duyệt; thiếu thì 422 liệt kê từng thứ.
 */
export async function submitForReview(orgId: string): Promise<SampleOutcome<Seller>> {
  const s = await store();
  const seller = mine(s, orgId);
  if (!seller) return failed(404, "marketplace.seller_not_found", "No seller has this id.");
  if (seller.status !== "pending_verification" && seller.status !== "draft") {
    return failed(409, "marketplace.invalid_transition", `${seller.status} → pending_review`);
  }
  const gate = await gateWith(s, seller, (await listKycProfiles()).data);
  const missing = gate.requirements.filter((r) => r.key !== "review" && !r.ok);
  if (missing.length > 0) {
    return {
      ok: false,
      problem: {
        type: "about:blank",
        title: "Unprocessable Entity",
        status: 422,
        code: "marketplace.not_ready",
        detail: missing.map((r) => r.key).join(","),
        errors: missing.map((r) => ({ field: r.key, code: `missing_${r.key}`, detail: r.key })),
      },
    };
  }
  const now = new Date().toISOString();
  seller.status = "pending_review";
  seller.submitted_at = now;
  seller.updated_at = now;
  seller.history.unshift({ at: now, kind: "submitted", actor: seller.display_name, note: null });
  return { ok: true, data: structuredClone(seller) };
}

/** Người bán chấp nhận bản hiện hành của quy chế sàn / hợp đồng người bán (ghi ở Tuân thủ). */
export async function acceptSellerDocument(
  orgId: string,
  kind: string,
): Promise<SampleOutcome<{ kind: DocumentKind }>> {
  const s = await store();
  const seller = mine(s, orgId);
  if (!seller) return failed(404, "marketplace.seller_not_found", "No seller has this id.");
  if (kind !== "platform_rules" && kind !== "seller_agreement") {
    return invalid([{ field: "kind", code: "unknown", detail: "unknown document" }]);
  }
  const done = await recordAcceptance(kind, seller.display_name);
  if (!done.ok) return done;
  seller.history.unshift({
    at: new Date().toISOString(),
    kind: "accepted",
    actor: seller.display_name,
    note: kind,
  });
  return { ok: true, data: { kind } };
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Thay bằng PUT /api/v1/marketplace/sellers/me (bước 46, `If-Match`) khi core có. */
export async function updateShop(
  orgId: string,
  input: {
    display_name: string;
    slug: string;
    description: string;
    pickup_address: string;
    fulfillment: string;
    cod_enabled: boolean;
  },
): Promise<SampleOutcome<Seller>> {
  const s = await store();
  const seller = mine(s, orgId);
  if (!seller) return failed(404, "marketplace.seller_not_found", "No seller has this id.");
  const errors: NonNullable<Problem["errors"]> = [];
  const name = input.display_name.trim();
  if (name.length < 1 || name.length > 120) {
    errors.push({ field: "display_name", code: "length_1_120", detail: "1 to 120 characters" });
  }
  const slug = input.slug.trim();
  if (!SLUG.test(slug)) errors.push({ field: "slug", code: "slug", detail: "slug" });
  else if (s.sellers.some((x) => x.slug === slug && x.org_id !== orgId)) {
    errors.push({ field: "slug", code: "slug_taken", detail: slug });
  }
  if (input.description.length > 500) {
    errors.push({ field: "description", code: "length_0_500", detail: "at most 500" });
  }
  if (input.pickup_address.trim().length < 5) {
    errors.push({ field: "pickup_address", code: "required", detail: "required" });
  }
  if (input.fulfillment !== "self" && input.fulfillment !== "platform") {
    errors.push({ field: "fulfillment", code: "unknown", detail: "unknown mode" });
  }
  if (errors.length > 0) return invalid(errors);
  const now = new Date().toISOString();
  Object.assign(seller, {
    display_name: name,
    slug,
    description: input.description.trim(),
    pickup_address: input.pickup_address.trim(),
    fulfillment: input.fulfillment,
    cod_enabled: input.cod_enabled,
    updated_at: now,
  });
  seller.history.unshift({ at: now, kind: "shop_updated", actor: seller.display_name, note: null });
  return { ok: true, data: structuredClone(seller) };
}

/**
 * Thay bằng PUT /api/v1/marketplace/sellers/me `{payout_account}` (bước 46) khi core có. Số tài khoản
 * đi thẳng vào kho secret của khách; API và dữ liệu mẫu chỉ giữ 4 số cuối, không điền lại vào form.
 */
export async function setPayoutAccount(
  orgId: string,
  input: { bank_name: string; holder_name: string; account_number: string },
): Promise<SampleOutcome<Seller>> {
  const s = await store();
  const seller = mine(s, orgId);
  if (!seller) return failed(404, "marketplace.seller_not_found", "No seller has this id.");
  const errors: NonNullable<Problem["errors"]> = [];
  if (input.bank_name.trim().length < 2)
    errors.push({ field: "bank_name", code: "required", detail: "required" });
  if (input.holder_name.trim().length < 2)
    errors.push({ field: "holder_name", code: "required", detail: "required" });
  const digits = input.account_number.replace(/\s/g, "");
  if (!/^\d{6,19}$/.test(digits))
    errors.push({ field: "account_number", code: "account_number", detail: "6 to 19 digits" });
  if (errors.length > 0) return invalid(errors);
  const now = new Date().toISOString();
  seller.payout_account = {
    bank_name: input.bank_name.trim(),
    holder_name: input.holder_name.trim().toUpperCase(),
    number_last4: digits.slice(-4),
    updated_at: now,
  };
  seller.updated_at = now;
  seller.history.unshift({
    at: now,
    kind: "account_updated",
    actor: seller.display_name,
    note: null,
  });
  return { ok: true, data: structuredClone(seller) };
}

/** Thay bằng POST /api/v1/marketplace/sellers/me/documents (bước 46; tệp qua `files`) khi core có. */
export async function submitSellerDocument(
  orgId: string,
  input: { doc_type: string; number: string; valid_until: string },
): Promise<SampleOutcome<SellerDocument>> {
  const s = await store();
  const seller = mine(s, orgId);
  if (!seller) return failed(404, "marketplace.seller_not_found", "No seller has this id.");
  const errors: NonNullable<Problem["errors"]> = [];
  const needed = await requiredDocuments(seller.category_id);
  if (!needed.includes(input.doc_type))
    errors.push({ field: "doc_type", code: "unknown", detail: "not needed" });
  if (input.number.trim().length < 3)
    errors.push({ field: "number", code: "required", detail: "required" });
  if (input.valid_until && (!DATE.test(input.valid_until) || input.valid_until <= vietnamDay())) {
    errors.push({ field: "valid_until", code: "past", detail: "future date" });
  }
  if (errors.length > 0) return invalid(errors);
  const now = new Date().toISOString();
  const doc: SellerDocument = {
    id: crypto.randomUUID(),
    seller_org_id: orgId,
    doc_type: input.doc_type as SellerDocument["doc_type"],
    number: input.number.trim(),
    status: "submitted",
    valid_until: input.valid_until || null,
    review_note: null,
    created_at: now,
    updated_at: now,
  };
  s.documents.push(doc);
  return { ok: true, data: { ...doc } };
}

/**
 * Người bán thêm sản phẩm: sản phẩm của nút `seller` vào `catalog` (bước 41) rồi sàn tạo lượt duyệt
 * với phát hiện tự động. Thay bằng POST /api/v1/catalog/products (bước 41) + lượt duyệt của bước 46.
 */
export async function addListing(
  orgId: string,
  input: { name: string; category_id: string; price: string },
): Promise<SampleOutcome<ListingReview>> {
  const s = await store();
  const seller = mine(s, orgId);
  if (!seller) return failed(404, "marketplace.seller_not_found", "No seller has this id.");
  const errors: NonNullable<Problem["errors"]> = [];
  const name = input.name.trim();
  if (name.length < 1 || name.length > 120)
    errors.push({ field: "name", code: "length_1_120", detail: "1 to 120" });
  const { data: categories } = await listCategories();
  if (!categories.some((c) => c.id === input.category_id)) {
    errors.push({ field: "category_id", code: "unknown", detail: "unknown category" });
  }
  const price = parseDong(input.price);
  if (price === null) errors.push({ field: "price", code: "money_vnd", detail: "whole dong" });
  if (errors.length > 0 || price === null) return invalid(errors);
  if (seller.status === "terminated")
    return failed(409, "marketplace.seller_not_active", seller.display_name);
  const n = s.listings.length + 1;
  const listing: ListingReview = {
    id: crypto.randomUUID(),
    seller_org_id: orgId,
    product_id: uid("b1", 100 + n),
    product_name: name,
    category_id: input.category_id,
    revision: 1,
    change: "new",
    price: vnd(price),
    previous_price: null,
    images: 0,
    status: "pending",
    findings: await findingsFor(s, seller, input.category_id),
    reason: null,
    decided_by: null,
    decided_at: null,
    created_at: new Date().toISOString(),
  };
  s.listings.push(listing);
  seller.product_count += 1;
  return { ok: true, data: structuredClone(listing) };
}

/**
 * Thay bằng POST /api/v1/marketplace/disputes/{id}/transitions (bước 46, người bán) khi core có:
 * trả lời kèm bằng chứng (`reply`) hoặc đồng ý hoàn toàn bộ (`agree_refund`, không đảo được).
 */
export async function answerDispute(
  orgId: string,
  id: string,
  input: { answer: string; body: string },
): Promise<SampleOutcome<Dispute>> {
  const s = await store();
  const d = s.disputes.find((x) => x.id === id && x.seller_org_id === orgId);
  if (!d) return failed(404, "marketplace.dispute_not_found", "No dispute has this id.");
  if (d.status !== "open")
    return failed(409, "marketplace.invalid_transition", `${d.status} → ${input.answer}`);
  const now = new Date().toISOString();
  if (input.answer === "agree_refund") {
    d.status = "resolved";
    d.resolution = "refund_full";
    d.resolution_amount = { ...d.claim };
    d.resolved_by = "seller";
    d.resolved_at = now;
    d.messages.push({
      id: crypto.randomUUID(),
      author_kind: "seller",
      kind: "refund_agreed",
      body: "",
      media_count: 0,
      at: now,
    });
    applyRefund(s, d, amount(d.claim));
  } else if (input.answer === "reply") {
    const body = input.body.trim();
    if (body.length < 10 || body.length > 2000) {
      return invalid([{ field: "body", code: "length_10_2000", detail: "10 to 2000 characters" }]);
    }
    d.status = "seller_responded";
    d.messages.push({
      id: crypto.randomUUID(),
      author_kind: "seller",
      kind: "reply",
      body,
      media_count: 0,
      at: now,
    });
    // Người mua có 48 giờ để phản hồi; quá hạn hay không thống nhất thì sàn phân xử.
    d.seller_due_at = at(48 * HOUR);
  } else {
    return invalid([{ field: "answer", code: "unknown", detail: "unknown answer" }]);
  }
  d.updated_at = now;
  return { ok: true, data: structuredClone(d) };
}

/** Thay bằng POST /api/v1/marketplace/penalties/{id}/appeal (bước 46) khi core có. Một lần. */
export async function appealPenalty(
  orgId: string,
  id: string,
  input: { reason: string },
): Promise<SampleOutcome<Penalty>> {
  const s = await store();
  const p = s.penalties.find((x) => x.id === id && x.seller_org_id === orgId);
  if (!p) return failed(404, "marketplace.penalty_not_found", "No penalty has this id.");
  if (p.appealed) return failed(409, "marketplace.penalty_already_appealed", p.rule_code);
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 2000) {
    return invalid([{ field: "reason", code: "length_10_2000", detail: "10 to 2000 characters" }]);
  }
  p.appealed = true;
  p.appeal_reason = reason;
  return { ok: true, data: { ...p } };
}

/** Đơn của người bán (phần nhìn của `orders`, bước 45): mới trước, trang theo con trỏ. */
export async function listSellerOrders(
  orgId: string,
  query: { cursor?: string | null } = {},
): Promise<
  SamplePage<MarketOrder & { settlement: SettlementStatus | null; dispute: DisputeStatus | null }>
> {
  const s = await store();
  const list = s.orders
    .filter((o) => o.seller_org_id === orgId)
    .sort((a, b) => b.placed_at.localeCompare(a.placed_at))
    .map((o) => ({
      ...o,
      settlement: s.settlements.find((x) => x.order_id === o.id)?.status ?? null,
      dispute: s.disputes.find((d) => d.order_id === o.id)?.status ?? null,
    }));
  return samplePage(list, { limit: 25, cursor: query.cursor ?? null });
}

/** Ô CSV an toàn: chặn công thức (`=`, `+`, `-`, `@`) và bọc dấu ngoặc kép. */
function cell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/**
 * Thay bằng GET /api/v1/marketplace/statements?from&to (bước 46, CSV) khi core có: sao kê của người
 * bán, khớp sổ cái. UTF-8 có BOM để Excel đọc đúng tiếng Việt.
 */
export async function statementCsv(orgId: string): Promise<string> {
  const { data } = await listSettlements({ seller: orgId });
  const head = [
    "order",
    "placed_at",
    "gross",
    "platform_fee_incl_vat",
    "fee_vat",
    "withholding_vat",
    "withholding_pit",
    "net",
    "status",
    "payout_reference",
  ];
  const s = await store();
  const rows = data.map((x) => [
    x.order_number,
    x.placed_at,
    x.gross.amount,
    x.fees.amount,
    x.fee_vat.amount,
    x.withholding_vat.amount,
    x.withholding_pit.amount,
    x.net.amount,
    x.status,
    s.payouts.find((p) => p.id === x.payout_id)?.reference ?? "",
  ]);
  return `﻿${[head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`;
}

/** Tên sàn (nút `marketplace` của cây tổ chức mẫu). */
export async function marketName(): Promise<string> {
  const { data } = await listUnits();
  return data.find((u) => u.id === SAMPLE_UNIT_IDS.market)?.name ?? "";
}
