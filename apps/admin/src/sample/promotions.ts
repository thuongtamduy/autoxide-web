// Dữ liệu mẫu của màn "Khuyến mại" (module `promotions` của core, bước 43, chưa có). Màn dựng hoàn
// toàn bằng file này (W-006). Hình dạng theo đặc tả `docs/steps/43-promotions.md` của core (mục "Kiểu
// và trait", "Bảng dữ liệu", "API REST", "Mã lỗi"); trường đặc tả chưa có ghi "dự kiến" và nằm trong
// bảng chỗ thiếu API. Sản phẩm, biến thể, giá lấy từ `sample/catalog.ts` (ID cố định), cửa hàng từ
// `sample/org.ts`.
//
// Luật (D-186 của core): trần mức giảm và quy tắc thông báo là DỮ LIỆU có ngày hiệu lực
// (`promotions_legal_limits`, `promotions_notice_rules`), không viết cứng trong hàm tính. Căn cứ chưa
// chắc ghi `needs_review` ("cần đối chiếu văn bản gốc").
//
// Tiền là `Money` như JSON của core (`amount` là chuỗi số nguyên đồng); phần trăm là basis point (1% =
// 100). Giờ lưu UTC. Lệnh ghi đổi một kho trong bộ nhớ của tiến trình máy chủ; khởi động lại thì về
// ban đầu.
import type { Problem } from "@autoxide/sdk";
import { fold } from "@/lib/fold";
import {
  allocate,
  applyBp,
  CODE_ALPHABET,
  CODE_JOB_THRESHOLD,
  codeKey,
  lowestAllowed,
  MAX_CODES_PER_BATCH,
  MAX_CODES_PER_CART,
  parseCartLines,
  parseCodes,
  parsePercentBp,
} from "@/lib/promotions";
import {
  allVariants,
  CATEGORY_ID,
  listCategories,
  type Money,
  ORG,
  PRODUCT_ID,
  pricesAt,
  type Ref,
  VARIANT_ID,
  type VariantSnapshot,
  variantByCode,
  variants,
} from "./catalog";
import { type SamplePage, samplePage } from "./index";
import { listUnits, type OrgUnit } from "./org";
import { vietnamDay } from "./tax";

export type SampleOutcome<T> = { ok: true; data: T } | { ok: false; problem: Problem };

const DAY = 86_400_000;
const HOUR = 3_600_000;

// ---------------------------------------------------------------- Kiểu theo đặc tả bước 43

export type PromotionKind =
  | "percent_off"
  | "amount_off"
  | "fixed_price"
  | "buy_x_get_y"
  | "free_shipping"
  | "flash_sale";
export const PROMOTION_KINDS: readonly PromotionKind[] = [
  "percent_off",
  "amount_off",
  "fixed_price",
  "buy_x_get_y",
  "free_shipping",
  "flash_sale",
];
export type PromotionScope = "items" | "order" | "shipping";
export type PromotionTrigger = "automatic" | "code";
export type PromotionStatus = "draft" | "scheduled" | "active" | "paused" | "ended" | "cancelled";
export type ProgramKind = "regular" | "national_focus";
export type NoticeStatus = "not_required" | "pending" | "submitted";
/** Loại khuyến mại theo luật (cột `promotion_kind` của bảng dữ liệu luật). */
export type LegalKind = "price_reduction" | "gift_value" | "shipping_discount";

export interface PromotionTarget {
  target_type: "product" | "variant" | "category";
  target_id: string;
  role: "condition" | "reward";
}

export interface PromotionTranslation {
  locale: string;
  title: string;
  /** Điều kiện người mua đọc (Luật 19/2023). */
  terms: string;
}

export interface Promotion {
  id: string;
  org_id: string;
  kind: PromotionKind;
  scope: PromotionScope;
  trigger: PromotionTrigger;
  status: PromotionStatus;
  value_bp: number | null;
  value: Money | null;
  min_order: Money | null;
  min_quantity: number | null;
  max_discount: Money | null;
  buy_quantity: number | null;
  get_quantity: number | null;
  starts_at: string;
  ends_at: string;
  priority: number;
  exclusive: boolean;
  usage_limit: number | null;
  usage_count: number;
  /** Dự kiến: số lượt đang giữ cho đơn chờ thanh toán (nằm trong `usage_count`). */
  held_count: number;
  per_customer_limit: number | null;
  return_usage_on_cancel: boolean;
  program_kind: ProgramKind;
  notice_status: NoticeStatus;
  notice_reference: string | null;
  notice_submitted_at: string | null;
  public: boolean;
  translations: PromotionTranslation[];
  targets: PromotionTarget[];
  customer_groups: string[];
  channels: string[];
  /** Dự kiến (`last_activation_error`): lỗi của lần bật gần nhất, để màn nói vì sao bị chặn. */
  last_activation_error: { code: string; params: Record<string, string>; at: string } | null;
  version: number;
  created_by: Ref;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
}

export interface PromotionCode {
  id: string;
  promotion_id: string;
  code: string;
  code_key: string;
  usage_limit: number | null;
  usage_count: number;
  /** Dự kiến: số lượt đang giữ (nằm trong `usage_count`). */
  held_count: number;
  /** Dự kiến: mã đặt tay hay sinh theo lô. */
  source: "manual" | "batch";
  created_at: string;
}

export interface FlashItem {
  promotion_id: string;
  variant_id: string;
  sale_price: Money | null;
  value_bp: number | null;
  quantity_limit: number;
  quantity_used: number;
}

/** Ảnh chụp đủ để dựng lại chương trình (`promotions_versions.snapshot`). */
export interface PromotionSnapshot {
  status: PromotionStatus;
  title_vi: string;
  title_en: string;
  value_bp: number | null;
  value: string | null;
  min_order: string | null;
  starts_at: string;
  ends_at: string;
  usage_limit: number | null;
  per_customer_limit: number | null;
  exclusive: boolean;
  targets: string[];
  notice_status: NoticeStatus;
  notice_reference: string | null;
}

export interface PromotionVersion {
  promotion_id: string;
  version: number;
  snapshot: PromotionSnapshot;
  /** Dự kiến: lý do / loại thay đổi do người đổi ghi, để đọc nhanh mà không so ảnh chụp. */
  change: { code: string; params: Record<string, string> };
  changed_by: Ref;
  changed_at: string;
}

/** Một việc trong lịch sử của chương trình (cả trước khi bật, khi chưa có phiên bản). */
export interface PromotionEvent {
  promotion_id: string;
  code: string;
  params: Record<string, string>;
  version: number | null;
  actor: Ref;
  at: string;
}

/** Hạn mức pháp luật (`promotions_legal_limits`), dữ liệu dùng chung mọi khách. */
export interface LegalLimit {
  id: string;
  jurisdiction: string;
  promotion_kind: LegalKind;
  program_kind: ProgramKind;
  /** `null`: luật có ngoại lệ nhưng chưa có mức cụ thể — không bật được, không tự cho qua. */
  max_bp: number | null;
  effective_from: string;
  effective_to: string | null;
  legal_basis: string;
  source_url: string;
  note: string;
  pack_version: string;
  /** Dự kiến: căn cứ chưa thống nhất, "cần đối chiếu văn bản gốc / người có chuyên môn pháp lý". */
  needs_review: boolean;
}

/** Quy tắc thông báo (`promotions_notice_rules`), dữ liệu dùng chung. */
export interface NoticeRule {
  id: string;
  jurisdiction: string;
  promotion_kind: LegalKind;
  notice_required: boolean;
  /** Số ngày phải nộp trước ngày bắt đầu; 0 = trước khi bắt đầu. */
  days_before: number;
  authority: string;
  effective_from: string;
  effective_to: string | null;
  legal_basis: string;
  needs_review: boolean;
}

// ---- Giỏ hàng và kết quả tính (`Cart`, `Evaluation` của `promotions::api`)

export interface CartLine {
  line_key: string;
  variant_id: string;
  quantity: number;
  unit_price: Money;
}

export interface Cart {
  org_id: string;
  currency: string;
  buyer_id: string | null;
  customer_groups: string[];
  channel: string | null;
  lines: CartLine[];
  shipping_fee: Money | null;
  codes: string[];
  at: string;
  locale: string;
}

export interface Reason {
  code: string;
  params: Record<string, string>;
  text: string;
}

export interface LineDiscount {
  line_key: string;
  promotion_id: string;
  amount: Money;
  reason: Reason;
  capped_by_law: boolean;
}

export interface GiftLine {
  promotion_id: string;
  variant_id: string;
  quantity: number;
}

export interface AppliedPromotion {
  promotion_id: string;
  code: string | null;
  title: string;
  terms: string;
  amount: Money;
}

export interface RejectedCode {
  code: string;
  reason: Reason;
}

/** Dự kiến: chương trình đang chạy mà không áp cho giỏ này, kèm lý do (cho người thử giỏ). */
export interface SkippedPromotion {
  promotion_id: string;
  title: string;
  reason: Reason;
}

export interface Evaluation {
  lines: LineDiscount[];
  shipping_discount: Money;
  gifts: GiftLine[];
  total_discount: Money;
  applied: AppliedPromotion[];
  rejected_codes: RejectedCode[];
  skipped: SkippedPromotion[];
  fingerprint: string;
}

// ---------------------------------------------------------------- ID cố định

const uid = (kind: string, n: number) =>
  `01a1e000-0000-7000-8000-${kind}${String(n).padStart(10, "0")}`;

export const PROMOTION_ID = {
  panTenOff: uid("e1", 1),
  freeShipping: uid("e1", 2),
  towelsGift: uid("e1", 3),
  cauGiayOpening: uid("e1", 4),
  flashWeekend: uid("e1", 5),
  christmas: uid("e1", 6),
  octoberThanks: uid("e1", 7),
  wholesaleThanks: uid("e1", 8),
} as const;

const YEN: Ref = { id: "01a1e000-0000-7000-8000-000000000f10", name: "Hoàng Yến" };
const HA: Ref = { id: "01a1e000-0000-7000-8000-000000000f11", name: "Trịnh Hà" };
const SYSTEM: Ref = { id: "00000000-0000-7000-8000-000000000000", name: "Hệ thống" };
/** Người đang thao tác trên kho mẫu (hàm mẫu không biết ai đăng nhập). */
export const SAMPLE_ACTOR: Ref = { id: "01a1e000-0000-7000-8000-000000000f99", name: "Bạn" };

/** Thương nhân trên hồ sơ thông báo — mã số thuế là mẫu. */
export const SAMPLE_MERCHANT = {
  name: "Công ty TNHH Bếp Mộc (mẫu)",
  tax_code: "0000000000 (mẫu)",
};

// ---------------------------------------------------------------- Kho trong bộ nhớ

interface Store {
  promotions: Promotion[];
  codes: PromotionCode[];
  flash: FlashItem[];
  versions: PromotionVersion[];
  events: PromotionEvent[];
  limits: LegalLimit[];
  rules: NoticeRule[];
  seq: number;
}

/** 00:00 giờ Việt Nam của hôm nay + `days` ngày + `hours` giờ, dạng ISO UTC. */
function vnAt(t0: number, days: number, hours = 0, minutes = 0): string {
  return new Date(t0 + days * DAY + hours * HOUR + minutes * 60_000).toISOString();
}

/** Cuối ngày (23:59:59) giờ Việt Nam của hôm nay + `days`. */
function vnEnd(t0: number, days: number): string {
  return new Date(t0 + (days + 1) * DAY - 1000).toISOString();
}

const L = (vi: string, viTerms: string, en: string, enTerms: string): PromotionTranslation[] => [
  { locale: "vi", title: vi, terms: viTerms },
  { locale: "en", title: en, terms: enTerms },
];

function base(
  id: string,
  t0: number,
  over: Partial<Promotion> & Pick<Promotion, "kind" | "scope" | "trigger" | "status">,
): Promotion {
  return {
    id,
    org_id: ORG.ROOT,
    value_bp: null,
    value: null,
    min_order: null,
    min_quantity: null,
    max_discount: null,
    buy_quantity: null,
    get_quantity: null,
    starts_at: vnAt(t0, -14),
    ends_at: vnEnd(t0, 15),
    priority: 0,
    exclusive: false,
    usage_limit: null,
    usage_count: 0,
    held_count: 0,
    per_customer_limit: null,
    return_usage_on_cancel: true,
    program_kind: "regular",
    notice_status: "pending",
    notice_reference: null,
    notice_submitted_at: null,
    public: true,
    translations: [],
    targets: [],
    customer_groups: [],
    channels: [],
    last_activation_error: null,
    version: 0,
    created_by: YEN,
    created_at: vnAt(t0, -21, 10, 2),
    updated_at: vnAt(t0, -5, 11, 20),
    activated_at: null,
    ...over,
  };
}

const vnd = (amount: number): Money => ({ amount: String(amount), currency: "VND" });
const variant = (id: string): PromotionTarget => ({
  target_type: "variant",
  target_id: id,
  role: "condition",
});

function seedPromotions(t0: number): Promotion[] {
  return [
    base(PROMOTION_ID.panTenOff, t0, {
      kind: "percent_off",
      scope: "items",
      trigger: "code",
      status: "active",
      value_bp: 1000,
      priority: 10,
      usage_limit: 1000,
      usage_count: 268,
      held_count: 7,
      per_customer_limit: 1,
      notice_status: "submitted",
      notice_reference: "TB-KM-0000/2026 (mẫu)",
      notice_submitted_at: vnAt(t0, -18, 15, 40),
      translations: L(
        "Giảm 10% chảo gang",
        "Giảm 10% chảo gang 26 cm và 28 cm khi nhập mã BEPMOC10. Mỗi khách một lượt, tối đa 1.000 lượt.",
        "10% off cast iron pans",
        "10% off the 26 cm and 28 cm cast iron pans with code BEPMOC10. One use per customer, up to 1,000 uses.",
      ),
      targets: [variant(VARIANT_ID.CG26), variant(VARIANT_ID.CG28)],
      version: 3,
      activated_at: vnAt(t0, -18, 15, 45),
    }),
    base(PROMOTION_ID.freeShipping, t0, {
      kind: "free_shipping",
      scope: "shipping",
      trigger: "automatic",
      status: "active",
      min_order: vnd(1_000_000),
      ends_at: vnEnd(t0, 46),
      usage_count: 1204,
      notice_status: "not_required",
      translations: L(
        "Miễn phí giao từ 1.000.000 ₫",
        "Miễn phí giao hàng cho đơn có tổng tiền hàng sau giảm từ 1.000.000 ₫.",
        "Free delivery from 1,000,000 ₫",
        "Free delivery for orders whose goods total after discounts is 1,000,000 ₫ or more.",
      ),
      version: 1,
      activated_at: vnAt(t0, -15, 9, 0),
    }),
    base(PROMOTION_ID.towelsGift, t0, {
      kind: "buy_x_get_y",
      scope: "items",
      trigger: "automatic",
      status: "active",
      buy_quantity: 2,
      get_quantity: 1,
      usage_limit: 300,
      usage_count: 86,
      notice_status: "submitted",
      notice_reference: "TB-KM-0001/2026 (mẫu)",
      notice_submitted_at: vnAt(t0, -18, 15, 50),
      translations: L(
        "Mua 2 khăn tặng 1 nước rửa",
        "Mua 2 bộ khăn bếp cotton (bộ 4) được tặng 1 chai nước rửa chén hữu cơ 750 ml. Tối đa 300 phần quà.",
        "Buy 2 towel sets, get dish soap",
        "Buy 2 cotton kitchen towel sets (pack of 4) and get one 750 ml organic dish soap. Up to 300 gifts.",
      ),
      targets: [
        { target_type: "product", target_id: PRODUCT_ID.towels, role: "condition" },
        { target_type: "variant", target_id: VARIANT_ID.NRC750, role: "reward" },
      ],
      version: 1,
      activated_at: vnAt(t0, -18, 16, 0),
    }),
    base(PROMOTION_ID.cauGiayOpening, t0, {
      org_id: ORG.CG,
      kind: "percent_off",
      scope: "items",
      trigger: "automatic",
      status: "scheduled",
      value_bp: 1500,
      exclusive: true,
      priority: 20,
      starts_at: vnAt(t0, 1, 8),
      ends_at: vnEnd(t0, 7),
      notice_status: "submitted",
      notice_reference: "TB-KM-0002/2026 (mẫu)",
      notice_submitted_at: vnAt(t0, -3, 15, 30),
      translations: L(
        "Khai trương CN Cầu Giấy",
        "Giảm 15% mọi mặt hàng mua tại CN Cầu Giấy trong tuần khai trương; không áp cùng mã giảm giá khác.",
        "Cầu Giấy store opening",
        "15% off everything bought at the Cầu Giấy store during opening week; cannot be combined with other codes.",
      ),
      created_by: HA,
      created_at: vnAt(t0, -4, 9, 0),
      version: 1,
      activated_at: vnAt(t0, -3, 16, 2),
    }),
    base(PROMOTION_ID.flashWeekend, t0, {
      kind: "flash_sale",
      scope: "items",
      trigger: "automatic",
      status: "draft",
      // Tối mai (giờ Việt Nam), không phải tối nay: giờ cố định trong hôm nay sẽ qua mất khi mở màn sau
      // 22:00, và core từ chối bật chương trình đã kết thúc.
      starts_at: vnAt(t0, 1, 20),
      ends_at: vnAt(t0, 1, 22),
      priority: 30,
      exclusive: true,
      translations: L(
        "Flash sale cuối tuần",
        "Giá sốc trong 2 giờ cho 4 sản phẩm, số suất có hạn theo từng sản phẩm.",
        "Weekend flash sale",
        "Two-hour deal prices on 4 products, limited quantities per product.",
      ),
      last_activation_error: {
        code: "promotions.exceeds_legal_limit",
        params: { value: "55", max: "50", legal_basis: "TT 39/2025/TT-BCT" },
        at: vnAt(t0, -2, 9, 5),
      },
      created_at: vnAt(t0, -3, 14, 0),
      updated_at: vnAt(t0, -2, 9, 5),
    }),
    base(PROMOTION_ID.christmas, t0, {
      kind: "percent_off",
      scope: "items",
      trigger: "automatic",
      status: "draft",
      value_bp: 2000,
      starts_at: vnAt(t0, 16),
      ends_at: vnEnd(t0, 40),
      translations: L(
        "Giáng sinh ấm bếp",
        "Giảm 20% bát đĩa gốm sứ từ 01/12 đến 25/12.",
        "Warm kitchen Christmas",
        "20% off ceramic tableware from 1 to 25 December.",
      ),
      targets: [{ target_type: "category", target_id: CATEGORY_ID.ceramics, role: "condition" }],
      created_at: vnAt(t0, -1, 10, 0),
      updated_at: vnAt(t0, -1, 10, 0),
    }),
    base(PROMOTION_ID.octoberThanks, t0, {
      kind: "amount_off",
      scope: "order",
      trigger: "code",
      status: "ended",
      value: vnd(50_000),
      min_order: vnd(500_000),
      starts_at: vnAt(t0, -45),
      ends_at: vnEnd(t0, -15),
      usage_limit: 1000,
      usage_count: 1000,
      per_customer_limit: 1,
      notice_status: "submitted",
      notice_reference: "TB-KM-0990/2026 (mẫu)",
      notice_submitted_at: vnAt(t0, -47, 10, 0),
      translations: L(
        "Tri ân tháng 10",
        "Giảm 50.000 ₫ cho đơn từ 500.000 ₫ với mã TRIAN10.",
        "October thank-you",
        "50,000 ₫ off orders from 500,000 ₫ with code TRIAN10.",
      ),
      version: 2,
      created_at: vnAt(t0, -48, 10, 0),
      updated_at: vnAt(t0, -17, 21, 14),
      activated_at: vnAt(t0, -46, 9, 0),
    }),
    base(PROMOTION_ID.wholesaleThanks, t0, {
      kind: "amount_off",
      scope: "order",
      trigger: "code",
      status: "active",
      value: vnd(100_000),
      min_order: vnd(2_000_000),
      starts_at: vnAt(t0, -13),
      ends_at: vnEnd(t0, 46),
      usage_limit: 50,
      usage_count: 1,
      per_customer_limit: 1,
      public: false,
      customer_groups: ["SI-NHAHANG"],
      notice_status: "submitted",
      notice_reference: "TB-KM-0003/2026 (mẫu)",
      notice_submitted_at: vnAt(t0, -14, 10, 0),
      translations: L(
        "Tri ân khách sỉ",
        "Giảm 100.000 ₫ cho đơn từ 2.000.000 ₫ của nhà hàng mua sỉ; mỗi mã dùng một lần.",
        "Wholesale thank-you",
        "100,000 ₫ off orders from 2,000,000 ₫ for restaurant buyers; each code works once.",
      ),
      version: 1,
      created_at: vnAt(t0, -14, 9, 0),
      updated_at: vnAt(t0, -13, 9, 0),
      activated_at: vnAt(t0, -13, 9, 0),
    }),
  ];
}

/** Bộ sinh số giả cố định (mulberry32): mã sinh theo lô của dữ liệu mẫu luôn giống nhau. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function randomCode(next: () => number, prefix: string, length: number): string {
  let out = prefix;
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[Math.floor(next() * CODE_ALPHABET.length)];
  }
  return out;
}

function seedCodes(t0: number): PromotionCode[] {
  const code = (
    n: number,
    promotion_id: string,
    text: string,
    limit: number | null,
    used: number,
    source: "manual" | "batch",
    created: string,
    held = 0,
  ): PromotionCode => ({
    id: uid("e2", n),
    promotion_id,
    code: text,
    code_key: codeKey(text),
    usage_limit: limit,
    usage_count: used,
    held_count: held,
    source,
    created_at: created,
  });
  const out = [
    code(1, PROMOTION_ID.panTenOff, "BEPMOC10", 1000, 268, "manual", vnAt(t0, -21, 10, 5), 7),
    code(2, PROMOTION_ID.octoberThanks, "TRIAN10", 1000, 1000, "manual", vnAt(t0, -48, 10, 5)),
  ];
  // "Tri ân khách sỉ": 50 mã một lượt sinh cùng một lô; ba mã đầu như bản thiết kế.
  const next = seeded(20261102);
  const fixed = ["KHSI7QKM4P", "KHSIX9TRW2", "KHSIH3PDV8"];
  const seen = new Set<string>(fixed);
  const batch: string[] = [...fixed];
  while (batch.length < 50) {
    const text = randomCode(next, "KHSI", 6);
    if (seen.has(text)) continue;
    seen.add(text);
    batch.push(text);
  }
  batch.forEach((text, i) => {
    out.push(
      code(
        10 + i,
        PROMOTION_ID.wholesaleThanks,
        text,
        1,
        i === 0 ? 1 : 0,
        "batch",
        vnAt(t0, -13, 9),
      ),
    );
  });
  return out;
}

function seedFlash(): FlashItem[] {
  const item = (sku: keyof typeof VARIANT_ID, sale: number, limit: number): FlashItem => ({
    promotion_id: PROMOTION_ID.flashWeekend,
    variant_id: VARIANT_ID[sku],
    sale_price: vnd(sale),
    value_bp: null,
    quantity_limit: limit,
    quantity_used: 0,
  });
  return [
    item("CG26", 310_500, 20),
    item("KB4-XA", 59_400, 60),
    item("NRC750", 53_400, 80),
    item("BG6", 252_000, 40),
  ];
}

function seedLimits(): LegalLimit[] {
  const limit = (
    n: number,
    kind: LegalKind,
    program: ProgramKind,
    max: number | null,
    basis: string,
    note: string,
  ): LegalLimit => ({
    id: uid("e3", n),
    jurisdiction: "VN",
    promotion_kind: kind,
    program_kind: program,
    max_bp: max,
    effective_from: "2026-01-01",
    effective_to: null,
    legal_basis: basis,
    source_url: "",
    note,
    pack_version: "vn-2026.11 (mẫu)",
    needs_review: true,
  });
  return [
    limit(
      1,
      "price_reduction",
      "regular",
      5000,
      "TT 39/2025/TT-BCT",
      "50% giá ngay trước thời gian khuyến mại. Số hiệu và ngày hiệu lực cần đối chiếu văn bản gốc.",
    ),
    limit(
      2,
      "price_reduction",
      "national_focus",
      null,
      "TT 39/2025/TT-BCT",
      "Ngoại lệ cho chương trình khuyến mại tập trung quốc gia; mức cụ thể cần đối chiếu văn bản gốc.",
    ),
    limit(
      3,
      "gift_value",
      "regular",
      5000,
      "NĐ 81/2018/NĐ-CP, NĐ 239/2026",
      "Giá trị hàng tặng trên giá trị hàng mua. Cần đối chiếu văn bản gốc / người có chuyên môn pháp lý.",
    ),
  ];
}

function seedRules(): NoticeRule[] {
  const rule = (n: number, kind: LegalKind, required: boolean, basis: string): NoticeRule => ({
    id: uid("e4", n),
    jurisdiction: "VN",
    promotion_kind: kind,
    notice_required: required,
    days_before: 0,
    authority: "Sở Công Thương nơi tổ chức khuyến mại",
    effective_from: "2024-12-01",
    effective_to: null,
    legal_basis: basis,
    needs_review: true,
  });
  return [
    rule(1, "price_reduction", true, "NĐ 81/2018/NĐ-CP sửa bởi NĐ 128/2024/NĐ-CP"),
    rule(2, "gift_value", true, "NĐ 81/2018/NĐ-CP sửa bởi NĐ 128/2024/NĐ-CP"),
    rule(3, "shipping_discount", false, "NĐ 81/2018/NĐ-CP sửa bởi NĐ 128/2024/NĐ-CP"),
  ];
}

function snapshotOf(p: Promotion, flash: readonly FlashItem[] = []): PromotionSnapshot {
  const title = (locale: string) => p.translations.find((t) => t.locale === locale)?.title ?? "";
  return {
    status: p.status,
    title_vi: title("vi"),
    title_en: title("en"),
    value_bp: p.value_bp,
    value: p.value?.amount ?? null,
    min_order: p.min_order?.amount ?? null,
    starts_at: p.starts_at,
    ends_at: p.ends_at,
    usage_limit: p.usage_limit,
    per_customer_limit: p.per_customer_limit,
    exclusive: p.exclusive,
    targets: [
      ...p.targets.map((x) => `${x.role}:${x.target_type}:${x.target_id}`),
      ...flash
        .filter((f) => f.promotion_id === p.id)
        .map((f) => `flash:${f.variant_id}:${f.sale_price?.amount ?? ""}:${f.quantity_limit}`),
    ],
    notice_status: p.notice_status,
    notice_reference: p.notice_reference,
  };
}

function seedHistory(
  t0: number,
  promotions: readonly Promotion[],
): { versions: PromotionVersion[]; events: PromotionEvent[] } {
  const versions: PromotionVersion[] = [];
  const events: PromotionEvent[] = [];
  const find = (id: string) => promotions.find((p) => p.id === id) as Promotion;
  const event = (
    id: string,
    code: string,
    at: string,
    actor: Ref,
    params: Record<string, string> = {},
    version: number | null = null,
  ) => events.push({ promotion_id: id, code, params, version, actor, at });
  const version = (
    id: string,
    n: number,
    code: string,
    at: string,
    actor: Ref,
    snap: Partial<PromotionSnapshot>,
    params: Record<string, string> = {},
  ) => {
    versions.push({
      promotion_id: id,
      version: n,
      snapshot: { ...snapshotOf(find(id)), ...snap },
      change: { code, params },
      changed_by: actor,
      changed_at: at,
    });
    event(id, code, at, actor, params, n);
  };
  const pan = PROMOTION_ID.panTenOff;
  event(pan, "created", vnAt(t0, -21, 10, 2), YEN);
  event(pan, "notice_recorded", vnAt(t0, -18, 15, 40), YEN, {
    reference: "TB-KM-0000/2026 (mẫu)",
  });
  version(pan, 1, "activated", vnAt(t0, -18, 15, 45), YEN, {
    status: "scheduled",
    usage_limit: 500,
    title_en: "10% off cast iron pan",
  });
  version(
    pan,
    2,
    "usage_limit_raised",
    vnAt(t0, -8, 9, 10),
    YEN,
    { status: "active", title_en: "10% off cast iron pan" },
    { from: "500", to: "1000" },
  );
  version(pan, 3, "translation_updated", vnAt(t0, -5, 11, 20), YEN, {}, { locale: "en" });
  const ship = PROMOTION_ID.freeShipping;
  event(ship, "created", vnAt(t0, -16, 9, 0), YEN);
  version(ship, 1, "activated", vnAt(t0, -15, 9, 0), YEN, {});
  const towels = PROMOTION_ID.towelsGift;
  event(towels, "created", vnAt(t0, -20, 9, 0), YEN);
  event(towels, "notice_recorded", vnAt(t0, -18, 15, 50), YEN, {
    reference: "TB-KM-0001/2026 (mẫu)",
  });
  version(towels, 1, "activated", vnAt(t0, -18, 16, 0), YEN, {});
  const cg = PROMOTION_ID.cauGiayOpening;
  event(cg, "created", vnAt(t0, -4, 9, 0), HA);
  event(cg, "notice_recorded", vnAt(t0, -3, 15, 30), HA, { reference: "TB-KM-0002/2026 (mẫu)" });
  version(cg, 1, "activated", vnAt(t0, -3, 16, 2), HA, {});
  const flash = PROMOTION_ID.flashWeekend;
  event(flash, "created", vnAt(t0, -3, 14, 0), YEN);
  event(flash, "activation_blocked", vnAt(t0, -2, 9, 5), YEN, {
    code: "promotions.exceeds_legal_limit",
  });
  event(PROMOTION_ID.christmas, "created", vnAt(t0, -1, 10, 0), YEN);
  const oct = PROMOTION_ID.octoberThanks;
  event(oct, "created", vnAt(t0, -48, 10, 0), YEN);
  version(oct, 1, "activated", vnAt(t0, -46, 9, 0), YEN, { status: "scheduled" });
  version(oct, 2, "ended_exhausted", vnAt(t0, -17, 21, 14), SYSTEM, {});
  const wholesale = PROMOTION_ID.wholesaleThanks;
  event(wholesale, "created", vnAt(t0, -14, 9, 0), YEN);
  version(wholesale, 1, "activated", vnAt(t0, -13, 9, 0), YEN, {});
  event(wholesale, "codes_generated", vnAt(t0, -13, 9, 5), YEN, { count: "50" });
  return { versions, events };
}

function seed(): Store {
  const t0 = Date.parse(`${vietnamDay()}T00:00:00+07:00`);
  const promotions = seedPromotions(t0);
  const history = seedHistory(t0, promotions);
  return {
    promotions,
    codes: seedCodes(t0),
    flash: seedFlash(),
    versions: history.versions,
    events: history.events,
    limits: seedLimits(),
    rules: seedRules(),
    seq: 0,
  };
}

// Kho giữ trên `globalThis`: Next.js có thể nạp lại module khi chạy thử, kho vẫn còn.
const KEY = Symbol.for("autoxide.sample.promotions");
type Holder = { [KEY]?: Store };

function store(): Store {
  const holder = globalThis as Holder;
  holder[KEY] ??= seed();
  return holder[KEY];
}

/** Về dữ liệu ban đầu (test). */
export function resetSamplePromotions(): void {
  (globalThis as Holder)[KEY] = seed();
}

function newId(kind: string): string {
  const s = store();
  s.seq += 1;
  return uid(kind, 900_000 + s.seq);
}

function now(): string {
  return new Date().toISOString();
}

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
      title: status === 404 ? "Not Found" : status === 409 ? "Conflict" : "Unprocessable Entity",
      status,
      code,
      detail,
      ...(errors && errors.length > 0 ? { errors } : {}),
    },
  };
}

function invalid(errors: NonNullable<Problem["errors"]>): SampleOutcome<never> {
  return fail(422, "validation_failed", "The request has invalid fields.", errors);
}

function fieldError(field: string, code: string, detail = code) {
  return { field, code, detail };
}

function record(
  promotion: Promotion,
  code: string,
  params: Record<string, string> = {},
  withVersion = promotion.activated_at !== null,
): void {
  const s = store();
  promotion.updated_at = now();
  let version: number | null = null;
  if (withVersion) {
    promotion.version += 1;
    version = promotion.version;
    s.versions.push({
      promotion_id: promotion.id,
      version,
      snapshot: snapshotOf(promotion, s.flash),
      change: { code, params },
      changed_by: SAMPLE_ACTOR,
      changed_at: now(),
    });
  }
  s.events.push({
    promotion_id: promotion.id,
    code,
    params,
    version,
    actor: SAMPLE_ACTOR,
    at: now(),
  });
}

// ---------------------------------------------------------------- Đọc chung

/** Tiêu đề theo ngôn ngữ, không có thì tiếng Việt. */
export function titleOf(p: Pick<Promotion, "translations">, locale: string): string {
  const pick = (l: string) => p.translations.find((t) => t.locale === l);
  return (pick(locale) ?? pick("vi") ?? p.translations[0])?.title ?? "";
}

export function termsOf(p: Pick<Promotion, "translations">, locale: string): string {
  const pick = (l: string) => p.translations.find((t) => t.locale === l);
  return (pick(locale) ?? pick("vi") ?? p.translations[0])?.terms ?? "";
}

/** Loại khuyến mại theo luật của một loại chương trình. */
export function legalKindOf(kind: PromotionKind): LegalKind {
  if (kind === "buy_x_get_y") return "gift_value";
  if (kind === "free_shipping") return "shipping_discount";
  return "price_reduction";
}

/** Dòng dữ liệu luật hiệu lực lúc `at` (ngày `YYYY-MM-DD` theo giờ Việt Nam); hàm thuần (test). */
export function effectiveAt<T extends { effective_from: string; effective_to: string | null }>(
  rows: readonly T[],
  day: string,
  match: (row: T) => boolean,
): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (!match(row)) continue;
    if (row.effective_from > day) continue;
    if (row.effective_to !== null && row.effective_to <= day) continue;
    if (!best || row.effective_from > best.effective_from) best = row;
  }
  return best;
}

/** Trần đang hiệu lực cho một chương trình; `undefined` = luật không đặt trần cho loại này. */
export function limitFor(
  limits: readonly LegalLimit[],
  kind: PromotionKind,
  program: ProgramKind,
  day: string,
): LegalLimit | null | undefined {
  const legal = legalKindOf(kind);
  if (legal === "shipping_discount") return undefined;
  return effectiveAt(
    limits,
    day,
    (l) => l.jurisdiction === "VN" && l.promotion_kind === legal && l.program_kind === program,
  );
}

function ancestorsOf(units: readonly OrgUnit[], orgId: string): string[] {
  const out: string[] = [];
  let current = units.find((u) => u.id === orgId);
  while (current) {
    out.push(current.id);
    const parent = current.parent_id;
    current = parent ? units.find((u) => u.id === parent) : undefined;
  }
  return out;
}

/** Nút và mọi nút con của nó. */
function descendantsOf(units: readonly OrgUnit[], orgId: string): OrgUnit[] {
  const out: OrgUnit[] = [];
  const walk = (id: string) => {
    for (const u of units) {
      if (u.parent_id === id) {
        out.push(u);
        walk(u.id);
      }
    }
  };
  const self = units.find((u) => u.id === orgId);
  if (self) out.push(self);
  walk(orgId);
  return out;
}

/** Tỉnh của cửa hàng mẫu (theo hồ sơ công khai của nút ở `sample/org.ts`). */
const STORE_PROVINCE: Record<string, string> = {
  [ORG.Q3]: "TP. Hồ Chí Minh",
  [ORG.TD]: "TP. Hồ Chí Minh",
  [ORG.WH]: "TP. Hồ Chí Minh",
  [ORG.CG]: "Hà Nội",
};

// ---------------------------------------------------------------- Chương trình

/** Một dòng của danh sách chương trình (dự kiến: API trả kèm tên nút và mô tả mục tiêu). */
export interface PromotionSummary extends Promotion {
  title: string;
  org_name: string;
  /** Mục tiêu đã đọc thành chữ (SKU, sản phẩm, danh mục), theo ngôn ngữ. */
  target_labels: string[];
  /** Số mã của chương trình theo mã. */
  code_count: number;
  /** Mã đầu tiên (để hiện cạnh tên). */
  first_code: string | null;
  /** Bị chặn khi bật lần gần nhất (bản nháp có `last_activation_error`). */
  blocked: boolean;
}

export interface PromotionQuery {
  status?: PromotionStatus | "blocked";
  kind?: PromotionKind;
  q?: string;
  locale?: string;
}

async function targetLabels(p: Promotion, locale: string): Promise<string[]> {
  const ids = p.targets.filter((t) => t.target_type === "variant").map((t) => t.target_id);
  const productIds = p.targets.filter((t) => t.target_type === "product").map((t) => t.target_id);
  const { data: vs } = await variants(ids, locale);
  const [{ data: cats }] = await Promise.all([listCategories(locale)]);
  const out: string[] = [];
  for (const t of p.targets) {
    if (t.target_type === "variant") {
      const v = vs.find((x) => x.variant_id === t.target_id);
      out.push(v ? `${t.role === "reward" ? "+ " : ""}${v.sku}` : t.target_id);
    } else if (t.target_type === "category") {
      out.push(cats.find((c) => c.id === t.target_id)?.path ?? t.target_id);
    }
  }
  if (productIds.length > 0) {
    const { data: all } = await allVariants(locale);
    for (const id of productIds) {
      const name = all.find((v) => v.product_id === id)?.name;
      out.unshift(name ?? id);
    }
  }
  return out;
}

async function summarize(p: Promotion, locale: string): Promise<PromotionSummary> {
  const s = store();
  const { data: units } = await listUnits();
  const codes = s.codes.filter((c) => c.promotion_id === p.id);
  return {
    ...structuredClone(p),
    title: titleOf(p, locale),
    org_name: units.find((u) => u.id === p.org_id)?.name ?? p.org_id,
    target_labels: await targetLabels(p, locale),
    code_count: codes.length,
    first_code: codes[0]?.code ?? null,
    blocked: p.status === "draft" && p.last_activation_error !== null,
  };
}

const STATUS_ORDER: Record<PromotionStatus, number> = {
  active: 0,
  paused: 1,
  scheduled: 2,
  draft: 3,
  ended: 4,
  cancelled: 5,
};

// Thay bằng GET /api/v1/promotions/promotions?status=&kind=&org_id=&q= (bước 43) khi core có. Tìm
// không dấu trên tiêu đề (mọi ngôn ngữ) và mã. Đang chạy trước, rồi theo ngày bắt đầu.
export async function listPromotions(query: PromotionQuery = {}): Promise<{
  data: PromotionSummary[];
}> {
  const s = store();
  const locale = query.locale ?? "vi";
  const q = fold(query.q ?? "");
  const rows = s.promotions
    .filter((p) =>
      query.status === "blocked"
        ? p.status === "draft" && p.last_activation_error !== null
        : !query.status || p.status === query.status,
    )
    .filter((p) => !query.kind || p.kind === query.kind)
    .filter(
      (p) =>
        !q ||
        p.translations.some((t) => fold(t.title).includes(q)) ||
        s.codes.some((c) => c.promotion_id === p.id && fold(c.code).includes(q)),
    )
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        a.starts_at.localeCompare(b.starts_at) ||
        a.id.localeCompare(b.id),
    );
  return { data: await Promise.all(rows.map((p) => summarize(p, locale))) };
}

/** Số liệu đầu tab (dự kiến; core chưa có endpoint đếm). */
export async function promotionStats(): Promise<{
  data: { active: number; scheduled: number; blocked: number; notices_pending: number };
}> {
  const s = store();
  const live = s.promotions.filter((p) => p.status !== "cancelled" && p.status !== "ended");
  return {
    data: {
      active: s.promotions.filter((p) => p.status === "active").length,
      scheduled: s.promotions.filter((p) => p.status === "scheduled").length,
      blocked: s.promotions.filter((p) => p.status === "draft" && p.last_activation_error).length,
      notices_pending: live.filter((p) => p.notice_status === "pending").length,
    },
  };
}

/** Giá ngay trước khuyến mại → giá sau khuyến mại của từng biến thể mục tiêu (dự kiến). */
export interface PriceLine {
  variant_id: string;
  sku: string;
  name: string;
  reference: Money | null;
  after: Money | null;
}

export interface PromotionDetail extends PromotionSummary {
  terms: string;
  price_lines: PriceLine[];
  history: PromotionEvent[];
  checks: ActivationCheck[];
}

// Thay bằng GET /api/v1/promotions/promotions/{id} (bước 43) khi core có.
export async function getPromotion(
  id: string,
  locale = "vi",
): Promise<{ data: PromotionDetail } | null> {
  const s = store();
  const p = s.promotions.find((x) => x.id === id);
  if (!p) return null;
  const summary = await summarize(p, locale);
  const variantIds = p.targets
    .filter((t) => t.target_type === "variant" && t.role === "condition")
    .map((t) => t.target_id);
  const priceLines: PriceLine[] = [];
  if (p.kind === "percent_off" && p.value_bp && variantIds.length > 0) {
    const { data: vs } = await variants(variantIds, locale);
    const prices = await pricesAt(p.org_id, variantIds, beforeStart(p));
    for (const v of vs) {
      const reference = prices.get(v.variant_id)?.price?.amount ?? null;
      const amount = reference ? Number(reference.amount) : null;
      priceLines.push({
        variant_id: v.variant_id,
        sku: v.sku,
        name: `${v.name}${v.variant_label ? ` ${v.variant_label}` : ""}`,
        reference,
        after: amount === null ? null : vnd(amount - applyBp(amount, p.value_bp)),
      });
    }
  }
  return {
    data: {
      ...summary,
      terms: termsOf(p, locale),
      price_lines: priceLines,
      history: s.events
        .filter((e) => e.promotion_id === id)
        .sort((a, b) => a.at.localeCompare(b.at))
        .map((e) => ({ ...e })),
      checks: await activationChecks(p),
    },
  };
}

/** Thời điểm ngay trước khi chương trình bắt đầu: giá tham chiếu là giá lúc đó. */
function beforeStart(p: Pick<Promotion, "starts_at">): string {
  return new Date(Date.parse(p.starts_at) - 1).toISOString();
}

// ---------------------------------------------------------------- Kiểm trước khi bật

export type CheckKey = "legal_limit" | "reference_price" | "notice" | "targets" | "window";

/**
 * Một điều kiện kiểm khi bật (dự kiến: `POST /promotions/{id}/activate?dry_run=true`). `ok = false`
 * thì bật bị chặn với `code`.
 */
export interface ActivationCheck {
  key: CheckKey;
  ok: boolean;
  /** "warn": chưa chặn ngay nhưng cần làm trước ngày bắt đầu. */
  tone: "ok" | "warn" | "bad";
  code: string | null;
  params: Record<string, string>;
}

/** Mức giảm của từng biến thể so với giá tham chiếu, để kiểm trần (dự kiến, cho màn Flash sale). */
export interface FlashRow extends FlashItem {
  sku: string;
  name: string;
  reference: Money | null;
  /** Mức giảm so với giá tham chiếu, basis point. */
  discount_bp: number | null;
  max_bp: number | null;
  /** Giá thấp nhất được phép theo trần đang hiệu lực. */
  lowest_allowed: Money | null;
  over_limit: boolean;
}

async function flashRowsOf(p: Promotion, locale = "vi"): Promise<FlashRow[]> {
  const s = store();
  const items = s.flash.filter((f) => f.promotion_id === p.id);
  const ids = items.map((f) => f.variant_id);
  const [{ data: vs }, prices] = await Promise.all([
    variants(ids, locale),
    pricesAt(p.org_id, ids, beforeStart(p)),
  ]);
  const limit = limitFor(s.limits, p.kind, p.program_kind, vietnamDay(Date.parse(p.starts_at)));
  const max = limit?.max_bp ?? null;
  return items.map((f) => {
    const v = vs.find((x) => x.variant_id === f.variant_id);
    const reference = prices.get(f.variant_id)?.price?.amount ?? null;
    const ref = reference ? Number(reference.amount) : null;
    const sale = f.sale_price ? Number(f.sale_price.amount) : null;
    const discount =
      ref && sale !== null ? Math.round(((ref - sale) * 10_000) / ref) : (f.value_bp ?? null);
    return {
      ...f,
      sku: v?.sku ?? "",
      name: v ? `${v.name}${v.variant_label ? ` ${v.variant_label}` : ""}` : f.variant_id,
      reference,
      discount_bp: discount,
      max_bp: max,
      lowest_allowed: ref !== null && max !== null ? vnd(lowestAllowed(ref, max)) : null,
      over_limit: discount !== null && max !== null && discount > max,
    };
  });
}

/** Mức giảm lớn nhất của chương trình (basis point trên giá tham chiếu), để so với trần. */
async function maxDiscountBp(p: Promotion): Promise<{ bp: number | null; missing: string[] }> {
  if (p.kind === "flash_sale") {
    const rows = await flashRowsOf(p);
    const missing = rows.filter((r) => !r.reference).map((r) => r.sku);
    const bps = rows.map((r) => r.discount_bp ?? 0);
    return { bp: bps.length ? Math.max(...bps) : null, missing };
  }
  if (p.kind === "percent_off") return { bp: p.value_bp, missing: [] };
  if (p.kind === "buy_x_get_y") {
    const buy = p.targets.filter((t) => t.role === "condition");
    const reward = p.targets.find((t) => t.role === "reward");
    if (!reward || buy.length === 0) return { bp: null, missing: [] };
    const { data: snaps } = await allVariants();
    const buyVariant = snaps.find((v) =>
      buy.some(
        (t) =>
          (t.target_type === "variant" && t.target_id === v.variant_id) ||
          (t.target_type === "product" && t.target_id === v.product_id),
      ),
    );
    const ids = [reward.target_id, ...(buyVariant ? [buyVariant.variant_id] : [])];
    const prices = await pricesAt(p.org_id, ids, beforeStart(p));
    const gift = prices.get(reward.target_id)?.price?.amount;
    const bought = buyVariant ? prices.get(buyVariant.variant_id)?.price?.amount : undefined;
    if (!gift || !bought) return { bp: null, missing: [buyVariant?.sku ?? ""] };
    const giftValue = Number(gift.amount) * (p.get_quantity ?? 1);
    const buyValue = Number(bought.amount) * (p.buy_quantity ?? 1);
    return { bp: Math.round((giftValue * 10_000) / buyValue), missing: [] };
  }
  if ((p.kind === "amount_off" || p.kind === "fixed_price") && p.scope === "items" && p.value) {
    const ids = p.targets.filter((t) => t.target_type === "variant").map((t) => t.target_id);
    const prices = await pricesAt(p.org_id, ids, beforeStart(p));
    let worst = 0;
    const missing: string[] = [];
    for (const id of ids) {
      const ref = prices.get(id)?.price?.amount;
      if (!ref) {
        missing.push(id);
        continue;
      }
      const r = Number(ref.amount);
      const off = p.kind === "amount_off" ? Number(p.value.amount) : r - Number(p.value.amount);
      worst = Math.max(worst, Math.round((off * 10_000) / r));
    }
    return { bp: ids.length ? worst : null, missing };
  }
  // Giảm theo đơn: phần chia về từng dòng bị cắt về trần khi tính (`capped_by_law`).
  return { bp: null, missing: [] };
}

/** Các điều kiện kiểm khi bật, theo thứ tự hiện trên màn (bản thiết kế, tab Flash sale). */
export async function activationChecks(p: Promotion): Promise<ActivationCheck[]> {
  const s = store();
  const day = vietnamDay(Date.parse(p.starts_at));
  const checks: ActivationCheck[] = [];
  const limit = limitFor(s.limits, p.kind, p.program_kind, day);
  const { bp, missing } = await maxDiscountBp(p);
  if (limit === undefined) {
    checks.push({ key: "legal_limit", ok: true, tone: "ok", code: null, params: {} });
  } else if (limit === null || limit.max_bp === null) {
    checks.push({
      key: "legal_limit",
      ok: false,
      tone: "bad",
      code: "promotions.no_legal_data",
      params: {},
    });
  } else if (bp !== null && bp > limit.max_bp) {
    checks.push({
      key: "legal_limit",
      ok: false,
      tone: "bad",
      code: "promotions.exceeds_legal_limit",
      params: {
        value: String(bp / 100),
        max: String(limit.max_bp / 100),
        legal_basis: limit.legal_basis,
      },
    });
  } else {
    checks.push({
      key: "legal_limit",
      ok: true,
      tone: "ok",
      code: null,
      params: {
        value: bp === null ? "" : String(bp / 100),
        max: String(limit.max_bp / 100),
        legal_basis: limit.legal_basis,
      },
    });
  }
  const needsReference = p.kind !== "free_shipping" && !(p.scope === "order");
  if (needsReference) {
    checks.push({
      key: "reference_price",
      ok: missing.length === 0,
      tone: missing.length === 0 ? "ok" : "bad",
      code: missing.length === 0 ? null : "promotions.reference_price_missing",
      params: { missing: missing.join(", ") },
    });
  }
  const rule = effectiveAt(
    s.rules,
    vietnamDay(),
    (r) => r.jurisdiction === "VN" && r.promotion_kind === legalKindOf(p.kind),
  );
  if (rule?.notice_required) {
    const done = p.notice_status === "submitted";
    checks.push({
      key: "notice",
      ok: done,
      tone: done ? "ok" : "bad",
      code: done ? null : "promotions.notice_required",
      params: {
        authority: rule.authority,
        reference: p.notice_reference ?? "",
        due: p.starts_at,
      },
    });
  } else {
    checks.push({ key: "notice", ok: true, tone: "ok", code: null, params: { not_required: "1" } });
  }
  const flashCount = s.flash.filter((f) => f.promotion_id === p.id).length;
  const targetsOk =
    p.kind === "flash_sale"
      ? flashCount > 0
      : p.kind === "buy_x_get_y"
        ? p.targets.some((t) => t.role === "condition") &&
          p.targets.some((t) => t.role === "reward")
        : true;
  const quantity = s.flash
    .filter((f) => f.promotion_id === p.id)
    .reduce((sum, f) => sum + f.quantity_limit, 0);
  checks.push({
    key: "targets",
    ok: targetsOk,
    tone: targetsOk ? "ok" : "bad",
    code: targetsOk ? null : "promotions.targets_missing",
    params: { items: String(flashCount), quantity: String(quantity) },
  });
  const windowOk = Date.parse(p.ends_at) > Date.now() && p.ends_at > p.starts_at;
  checks.push({
    key: "window",
    ok: windowOk,
    tone: windowOk ? "ok" : "bad",
    code: windowOk ? null : "promotions.invalid_window",
    params: {},
  });
  return checks;
}

const CHECK_STATUS: Record<string, number> = {
  "promotions.no_legal_data": 409,
  "promotions.exceeds_legal_limit": 422,
  "promotions.reference_price_missing": 409,
  "promotions.notice_required": 409,
  "promotions.targets_missing": 422,
  "promotions.invalid_window": 422,
};

// Thay bằng POST /api/v1/promotions/promotions/{id}/activate (bước 43) khi core có: kiểm trần pháp
// luật, thông báo, mục tiêu; qua thì `scheduled` (chưa tới giờ) hay `active`, ghi phiên bản.
export async function activatePromotion(id: string): Promise<SampleOutcome<Promotion>> {
  const s = store();
  const p = s.promotions.find((x) => x.id === id);
  if (!p) return fail(404, "promotions.not_found", "Promotion not found.");
  if (p.status !== "draft") {
    return fail(409, "promotions.invalid_transition", "Cannot activate.", [
      fieldError("status", "promotions.invalid_transition", `${p.status}→scheduled`),
    ]);
  }
  const checks = await activationChecks(p);
  const bad = checks.find((c) => !c.ok);
  if (bad?.code) {
    p.last_activation_error = { code: bad.code, params: bad.params, at: now() };
    record(p, "activation_blocked", { code: bad.code }, false);
    // `detail` của mục lỗi là phần nói rõ lý do (giao diện chèn vào câu của mã lỗi).
    const why =
      bad.code === "promotions.exceeds_legal_limit"
        ? `${bad.params.value}% > ${bad.params.max}% · ${bad.params.legal_basis}`
        : bad.code === "promotions.reference_price_missing"
          ? (bad.params.missing ?? "")
          : (bad.params.authority ?? "");
    return fail(CHECK_STATUS[bad.code] ?? 409, bad.code, bad.code, [
      fieldError("activation", bad.code, why || bad.code),
    ]);
  }
  p.last_activation_error = null;
  p.status = Date.parse(p.starts_at) > Date.now() ? "scheduled" : "active";
  p.activated_at = now();
  record(p, "activated", {}, true);
  return { ok: true, data: structuredClone(p) };
}

type Move = "pause" | "resume" | "end" | "cancel";
const MOVES: Record<Move, { from: PromotionStatus[]; to: PromotionStatus }> = {
  pause: { from: ["active"], to: "paused" },
  resume: { from: ["paused"], to: "active" },
  end: { from: ["active", "paused"], to: "ended" },
  cancel: { from: ["draft", "scheduled"], to: "cancelled" },
};

// Thay bằng POST /api/v1/promotions/promotions/{id}/pause | resume | end | cancel (bước 43).
// Trả trạng thái cũ (`previous`) cho nút Hoàn tác của tạm dừng / chạy lại.
export async function changePromotion(
  id: string,
  move: Move,
): Promise<SampleOutcome<{ promotion: Promotion; previous: PromotionStatus }>> {
  const p = store().promotions.find((x) => x.id === id);
  if (!p) return fail(404, "promotions.not_found", "Promotion not found.");
  const rule = MOVES[move];
  if (!rule?.from.includes(p.status)) {
    return fail(409, "promotions.invalid_transition", `${p.status}→${rule?.to ?? move}`);
  }
  const previous = p.status;
  p.status = rule.to;
  const event: Record<Move, string> = {
    pause: "paused",
    resume: "resumed",
    end: "ended_early",
    cancel: "cancelled",
  };
  record(p, event[move]);
  return { ok: true, data: { promotion: structuredClone(p), previous } };
}

/** Đặt trạng thái chạy / tạm dừng (Hoàn tác gửi lại trạng thái cũ). */
export async function setPromotionRunning(
  id: string,
  status: string,
): Promise<SampleOutcome<{ promotion: Promotion; previous: PromotionStatus }>> {
  if (status === "paused") return changePromotion(id, "pause");
  if (status === "active") return changePromotion(id, "resume");
  return fail(409, "promotions.invalid_transition", status);
}

export interface ExtendInput {
  ends_at: string;
  usage_limit: string;
  reason: string;
}

// Thay bằng PATCH /api/v1/promotions/promotions/{id} (bước 43): chương trình đã chạy chỉ được kéo
// dài `ends_at`, tăng giới hạn lượt; mỗi lần đổi thêm một phiên bản. `ends_at` là giờ Việt Nam
// `YYYY-MM-DDTHH:mm` của ô nhập, đổi sang UTC ở đây.
export async function extendPromotion(
  id: string,
  input: ExtendInput,
): Promise<SampleOutcome<Promotion>> {
  const p = store().promotions.find((x) => x.id === id);
  if (!p) return fail(404, "promotions.not_found", "Promotion not found.");
  if (!["active", "paused", "scheduled"].includes(p.status)) {
    return fail(409, "promotions.invalid_transition", `${p.status}→extend`);
  }
  const errors: NonNullable<Problem["errors"]> = [];
  const endText = input.ends_at.trim();
  const limitText = input.usage_limit.trim();
  let endsAt: string | null = null;
  if (endText) {
    const at = Date.parse(`${endText}:00+07:00`);
    if (Number.isNaN(at)) errors.push(fieldError("ends_at", "time"));
    else if (at <= Date.parse(p.ends_at))
      errors.push(fieldError("ends_at", "promotions.extend_only"));
    else endsAt = new Date(at).toISOString();
  }
  let limit: number | null = null;
  if (limitText) {
    if (!/^\d{1,9}$/.test(limitText)) errors.push(fieldError("usage_limit", "whole_number"));
    else if (p.usage_limit !== null && Number(limitText) <= p.usage_limit)
      errors.push(fieldError("usage_limit", "promotions.raise_only", String(p.usage_limit)));
    else limit = Number(limitText);
  }
  if (!endText && !limitText) errors.push(fieldError("ends_at", "promotions.nothing_changed"));
  if (input.reason.trim().length < 3) errors.push(fieldError("reason", "required"));
  if (errors.length > 0) return invalid(errors);
  if (endsAt) {
    const from = p.ends_at;
    p.ends_at = endsAt;
    record(p, "extended", { from, to: endsAt, reason: input.reason.trim() });
  }
  if (limit !== null) {
    const from = String(p.usage_limit ?? "");
    p.usage_limit = limit;
    record(p, "usage_limit_raised", { from, to: String(limit), reason: input.reason.trim() });
  }
  return { ok: true, data: structuredClone(p) };
}

export interface NewPromotion {
  title: string;
  kind: string;
  trigger: string;
  code: string;
  value: string;
  min_order: string;
  starts_at: string;
  ends_at: string;
  usage_limit: string;
  per_customer_limit: string;
  exclusive: boolean;
  org_id: string;
  targets: string;
}

const whole = (text: string) => /^\d{1,12}$/.test(text);

// Thay bằng POST /api/v1/promotions/promotions (bước 43) rồi PUT …/translations, …/targets khi core
// có. Tạo ở `draft`. Gom mọi lỗi của ô để báo một lần.
export async function createPromotion(input: NewPromotion): Promise<SampleOutcome<Promotion>> {
  const s = store();
  const errors: NonNullable<Problem["errors"]> = [];
  const title = input.title.trim();
  if (!title) errors.push(fieldError("title", "required"));
  else if (title.length > 120) errors.push(fieldError("title", "too_long"));
  const kind = PROMOTION_KINDS.find((k) => k === input.kind);
  if (!kind) errors.push(fieldError("kind", "unknown"));
  const trigger: PromotionTrigger | null =
    input.trigger === "code" ? "code" : input.trigger === "automatic" ? "automatic" : null;
  if (!trigger) errors.push(fieldError("trigger", "unknown"));
  const { data: units } = await listUnits();
  if (!units.some((u) => u.id === input.org_id)) errors.push(fieldError("org_id", "unknown"));
  // Mức giảm theo loại: phần trăm, số tiền đồng, hay không cần.
  let valueBp: number | null = null;
  let value: Money | null = null;
  const valueText = input.value.trim();
  if (kind === "percent_off") {
    valueBp = parsePercentBp(valueText);
    if (valueBp === null) errors.push(fieldError("value", valueText ? "percent" : "required"));
  } else if (kind === "amount_off" || kind === "fixed_price") {
    if (!whole(valueText) || Number(valueText) <= 0)
      errors.push(fieldError("value", valueText ? "money_minor" : "required"));
    else value = vnd(Number(valueText));
  }
  const minText = input.min_order.trim();
  if (minText && !whole(minText)) errors.push(fieldError("min_order", "money_minor"));
  if (kind === "free_shipping" && !minText) errors.push(fieldError("min_order", "required"));
  const starts = Date.parse(`${input.starts_at.trim()}:00+07:00`);
  const ends = Date.parse(`${input.ends_at.trim()}:00+07:00`);
  if (!input.starts_at.trim()) errors.push(fieldError("starts_at", "required"));
  else if (Number.isNaN(starts)) errors.push(fieldError("starts_at", "time"));
  if (!input.ends_at.trim()) errors.push(fieldError("ends_at", "required"));
  else if (Number.isNaN(ends)) errors.push(fieldError("ends_at", "time"));
  else if (!Number.isNaN(starts) && ends <= starts)
    errors.push(fieldError("ends_at", "promotions.invalid_window"));
  const limitText = input.usage_limit.trim();
  const perText = input.per_customer_limit.trim();
  if (limitText && (!whole(limitText) || Number(limitText) < 1))
    errors.push(fieldError("usage_limit", "whole_number"));
  if (perText && (!whole(perText) || Number(perText) < 1))
    errors.push(fieldError("per_customer_limit", "whole_number"));
  else if (perText && limitText && whole(limitText) && Number(perText) > Number(limitText))
    errors.push(fieldError("per_customer_limit", "promotions.per_customer_over_total"));
  const code = codeKey(input.code);
  if (trigger === "code") {
    if (!code) errors.push(fieldError("code", "required"));
    else if (!/^[A-Z0-9-]{4,32}$/.test(code)) errors.push(fieldError("code", "code_format"));
    else if (s.codes.some((c) => c.code_key === code))
      errors.push(fieldError("code", "promotions.code_taken", code));
  }
  const targets: PromotionTarget[] = [];
  const { lines, bad } = parseCartLines(input.targets);
  for (const b of bad) errors.push(fieldError("targets", "promotions.target_unknown", b));
  for (const line of lines) {
    const { data: v } = await variantByCode(line.sku);
    if (!v) errors.push(fieldError("targets", "promotions.target_unknown", line.sku));
    else targets.push(variant(v.variant_id));
  }
  if (errors.length > 0 || !kind || !trigger) return invalid(errors);
  const rule = effectiveAt(
    s.rules,
    vietnamDay(),
    (r) => r.jurisdiction === "VN" && r.promotion_kind === legalKindOf(kind),
  );
  const id = newId("e1");
  const created = now();
  const promotion: Promotion = {
    id,
    org_id: input.org_id,
    kind,
    scope:
      kind === "free_shipping" ? "shipping" : value && targets.length === 0 ? "order" : "items",
    trigger,
    status: "draft",
    value_bp: valueBp,
    value,
    min_order: minText ? vnd(Number(minText)) : null,
    min_quantity: null,
    max_discount: null,
    buy_quantity: kind === "buy_x_get_y" ? 2 : null,
    get_quantity: kind === "buy_x_get_y" ? 1 : null,
    starts_at: new Date(starts).toISOString(),
    ends_at: new Date(ends).toISOString(),
    priority: 0,
    exclusive: input.exclusive,
    usage_limit: limitText ? Number(limitText) : null,
    usage_count: 0,
    held_count: 0,
    per_customer_limit: perText ? Number(perText) : null,
    return_usage_on_cancel: true,
    program_kind: "regular",
    notice_status: rule?.notice_required ? "pending" : "not_required",
    notice_reference: null,
    notice_submitted_at: null,
    public: true,
    translations: [{ locale: "vi", title, terms: "" }],
    targets,
    customer_groups: [],
    channels: [],
    last_activation_error: null,
    version: 0,
    created_by: SAMPLE_ACTOR,
    created_at: created,
    updated_at: created,
    activated_at: null,
  };
  s.promotions.push(promotion);
  if (trigger === "code") {
    s.codes.push({
      id: newId("e2"),
      promotion_id: id,
      code,
      code_key: code,
      usage_limit: null,
      usage_count: 0,
      held_count: 0,
      source: "manual",
      created_at: created,
    });
  }
  record(promotion, "created", {}, false);
  return { ok: true, data: structuredClone(promotion) };
}

// ---------------------------------------------------------------- Flash sale

// Thay bằng GET /api/v1/promotions/promotions/{id} (mục `flash_items`) và `reference_prices` của
// `catalog` (bước 41, 43). Kèm mức giảm so với giá ngay trước khuyến mại và trần đang hiệu lực.
export async function listFlashItems(
  promotionId: string,
  locale = "vi",
): Promise<{ data: FlashRow[] } | null> {
  const p = store().promotions.find((x) => x.id === promotionId);
  if (p?.kind !== "flash_sale") return null;
  return { data: await flashRowsOf(p, locale) };
}

/** Các chương trình flash sale (để chọn ở tab Flash sale), mới trước. */
export async function listFlashPromotions(locale = "vi"): Promise<{ data: PromotionSummary[] }> {
  const { data } = await listPromotions({ kind: "flash_sale", locale });
  return { data };
}

// Thay bằng PUT /api/v1/promotions/promotions/{id}/flash-items (bước 43). Chỉ sửa khi chương trình
// chưa chạy; giá sốc dưới giá thấp nhất được phép theo trần thì báo dưới ô kèm giá thấp nhất.
export async function setFlashPrice(
  promotionId: string,
  variantId: string,
  priceText: string,
  quantityText: string,
): Promise<SampleOutcome<FlashItem & { previous: string }>> {
  const s = store();
  const p = s.promotions.find((x) => x.id === promotionId);
  if (!p) return fail(404, "promotions.not_found", "Promotion not found.");
  if (p.status !== "draft") {
    return fail(409, "promotions.locked_after_start", "Locked after start.");
  }
  const item = s.flash.find((f) => f.promotion_id === promotionId && f.variant_id === variantId);
  if (!item) return fail(404, "promotions.not_found", "Flash item not found.");
  const rows = await flashRowsOf(p);
  const row = rows.find((r) => r.variant_id === variantId);
  const errors: NonNullable<Problem["errors"]> = [];
  const price = priceText.trim();
  const quantity = quantityText.trim();
  if (!whole(price) || Number(price) <= 0)
    errors.push(fieldError("sale_price", price ? "money_minor" : "required"));
  else if (row?.reference && Number(price) >= Number(row.reference.amount))
    errors.push(fieldError("sale_price", "promotions.not_a_discount", row.reference.amount));
  else if (row?.lowest_allowed && Number(price) < Number(row.lowest_allowed.amount))
    errors.push(
      fieldError("sale_price", "promotions.exceeds_legal_limit", row.lowest_allowed.amount),
    );
  if (quantity && (!whole(quantity) || Number(quantity) < 1))
    errors.push(fieldError("quantity_limit", "whole_number"));
  if (errors.length > 0) return invalid(errors);
  const previous = item.sale_price?.amount ?? "";
  item.sale_price = vnd(Number(price));
  if (quantity) item.quantity_limit = Number(quantity);
  // Đã sửa dòng vượt trần: lỗi của lần bật trước không còn đúng.
  const after = await flashRowsOf(p);
  if (
    p.last_activation_error?.code === "promotions.exceeds_legal_limit" &&
    !after.some((r) => r.over_limit)
  ) {
    p.last_activation_error = null;
  }
  record(p, "flash_price_changed", { sku: row?.sku ?? "", from: previous, to: price }, false);
  return { ok: true, data: { ...structuredClone(item), previous } };
}

// ---------------------------------------------------------------- Mã giảm giá

export type CodeState = "usable" | "exhausted" | "expired" | "not_started";

export interface CodeRow extends PromotionCode {
  promotion_title: string;
  promotion_status: PromotionStatus;
  /** Dự kiến: số lượt còn — số thật lấy từ bộ đếm, không làm tròn (D-201). */
  remaining: number | null;
  state: CodeState;
  per_customer_limit: number | null;
  min_order: Money | null;
  starts_at: string;
  ends_at: string;
  /** SKU / danh mục mã áp cho (theo mục tiêu của chương trình); trống = mọi hàng. */
  applies_to: string[];
  customer_groups: string[];
  public: boolean;
}

export function codeState(code: PromotionCode, p: Promotion, at = Date.now()): CodeState {
  if (p.status === "ended" || p.status === "cancelled" || Date.parse(p.ends_at) <= at)
    return "expired";
  const codeLeft = code.usage_limit === null ? null : code.usage_limit - code.usage_count;
  const programLeft = p.usage_limit === null ? null : p.usage_limit - p.usage_count;
  if ((codeLeft !== null && codeLeft <= 0) || (programLeft !== null && programLeft <= 0))
    return "exhausted";
  if (p.status === "draft" || p.status === "scheduled" || Date.parse(p.starts_at) > at)
    return "not_started";
  return "usable";
}

export interface CodeQuery {
  promotion_id?: string;
  state?: CodeState;
  q?: string;
  locale?: string;
  limit?: number;
  cursor?: string | null;
}

// Thay bằng GET /api/v1/promotions/promotions/{id}/codes (bước 43) khi core có. Core liệt kê mã theo
// từng chương trình; danh sách mọi mã của khách là dự kiến.
export async function listCodes(query: CodeQuery = {}): Promise<SamplePage<CodeRow>> {
  const s = store();
  const locale = query.locale ?? "vi";
  const q = codeKey(query.q ?? "");
  const labels = new Map<string, string[]>();
  for (const p of s.promotions) labels.set(p.id, await targetLabels(p, locale));
  const rows: CodeRow[] = s.codes
    .filter((c) => !query.promotion_id || c.promotion_id === query.promotion_id)
    .filter((c) => !q || c.code_key.includes(q))
    .flatMap((c) => {
      const p = s.promotions.find((x) => x.id === c.promotion_id);
      if (!p) return [];
      const codeLeft = c.usage_limit === null ? null : c.usage_limit - c.usage_count;
      const programLeft = p.usage_limit === null ? null : p.usage_limit - p.usage_count;
      const remaining =
        codeLeft === null
          ? programLeft
          : programLeft === null
            ? codeLeft
            : Math.min(codeLeft, programLeft);
      return [
        {
          ...c,
          promotion_title: titleOf(p, locale),
          promotion_status: p.status,
          remaining: remaining === null ? null : Math.max(0, remaining),
          state: codeState(c, p),
          per_customer_limit: p.per_customer_limit,
          min_order: p.min_order,
          starts_at: p.starts_at,
          ends_at: p.ends_at,
          applies_to: labels.get(p.id) ?? [],
          customer_groups: [...p.customer_groups],
          public: p.public,
        },
      ];
    })
    .filter((r) => !query.state || r.state === query.state)
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.code.localeCompare(b.code));
  return samplePage(rows, { limit: query.limit ?? 20, cursor: query.cursor ?? null });
}

/** Số mã theo trạng thái (cho chip lọc). */
export async function codeCounts(): Promise<Record<CodeState | "all", number>> {
  const s = store();
  const out: Record<CodeState | "all", number> = {
    all: 0,
    usable: 0,
    exhausted: 0,
    expired: 0,
    not_started: 0,
  };
  for (const c of s.codes) {
    const p = s.promotions.find((x) => x.id === c.promotion_id);
    if (!p) continue;
    out.all += 1;
    out[codeState(c, p)] += 1;
  }
  return out;
}

export interface GenerateInput {
  promotion_id: string;
  count: string;
  prefix: string;
  per_code: string;
}

// Thay bằng POST /api/v1/promotions/promotions/{id}/codes (bước 43). Trên 500 mã core chạy bằng job
// (`promotions.generate_codes`); mẫu sinh ngay nhưng báo `queued` như job.
export async function generateCodes(
  input: GenerateInput,
): Promise<SampleOutcome<{ generated: number; queued: boolean; first: string }>> {
  const s = store();
  const errors: NonNullable<Problem["errors"]> = [];
  const p = s.promotions.find((x) => x.id === input.promotion_id);
  if (!p) errors.push(fieldError("promotion_id", "unknown"));
  else if (p.trigger !== "code")
    errors.push(fieldError("promotion_id", "promotions.not_code_based"));
  else if (p.status === "ended" || p.status === "cancelled")
    errors.push(fieldError("promotion_id", "promotions.invalid_transition"));
  const count = input.count.trim();
  if (!whole(count) || Number(count) < 1)
    errors.push(fieldError("count", count ? "whole_number" : "required"));
  else if (Number(count) > MAX_CODES_PER_BATCH)
    errors.push(fieldError("count", "promotions.too_many_generated", String(MAX_CODES_PER_BATCH)));
  const prefix = codeKey(input.prefix);
  if (!/^[A-Z0-9]{0,8}$/.test(prefix)) errors.push(fieldError("prefix", "prefix_format"));
  const per = input.per_code.trim();
  if (!whole(per) || Number(per) < 1)
    errors.push(fieldError("per_code", per ? "whole_number" : "required"));
  if (errors.length > 0 || !p) return invalid(errors);
  const n = Number(count);
  const next = seeded(Date.now() % 2_147_483_647);
  const made: string[] = [];
  const at = now();
  let guard = 0;
  while (made.length < n && guard < n * 20) {
    guard += 1;
    const text = randomCode(next, prefix, 10 - Math.min(prefix.length, 4));
    // Unique index quyết định: đụng mã có sẵn thì sinh lại.
    if (s.codes.some((c) => c.code_key === text) || made.includes(text)) continue;
    made.push(text);
  }
  for (const text of made) {
    s.codes.push({
      id: newId("e2"),
      promotion_id: p.id,
      code: text,
      code_key: text,
      usage_limit: Number(per),
      usage_count: 0,
      held_count: 0,
      source: "batch",
      created_at: at,
    });
  }
  record(p, "codes_generated", { count: String(made.length) }, false);
  return {
    ok: true,
    data: { generated: made.length, queued: n > CODE_JOB_THRESHOLD, first: made[0] ?? "" },
  };
}

/** Một ô CSV: ô bắt đầu bằng = + - @ (hay tab, xuống dòng) thêm dấu nháy để không thành công thức. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

// Thay bằng GET /api/v1/promotions/promotions/{id}/codes/export (bước 43).
export async function exportCodes(
  promotionId?: string,
): Promise<{ data: { file_name: string; csv: string } }> {
  const s = store();
  const header = ["code", "promotion", "usage_limit", "usage_count", "created_at"];
  const rows = s.codes
    .filter((c) => !promotionId || c.promotion_id === promotionId)
    .map((c) => {
      const p = s.promotions.find((x) => x.id === c.promotion_id);
      return [
        c.code,
        p ? titleOf(p, "vi") : "",
        c.usage_limit === null ? "" : String(c.usage_limit),
        String(c.usage_count),
        c.created_at,
      ];
    });
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  return { data: { file_name: `ma-giam-gia-${vietnamDay()}.csv`, csv: `${csv}\r\n` } };
}

// ---------------------------------------------------------------- Thông báo Sở Công Thương

export interface NoticeRow {
  promotion_id: string;
  title: string;
  kind: PromotionKind;
  value_bp: number | null;
  value: Money | null;
  starts_at: string;
  ends_at: string;
  notice_status: NoticeStatus;
  notice_reference: string | null;
  notice_submitted_at: string | null;
  /** Tỉnh / thành nơi chương trình chạy (theo các cửa hàng dưới nút của chương trình). */
  provinces: string[];
  store_count: number;
  website: boolean;
  /** Hạn nộp: trước ngày bắt đầu, theo `days_before` của quy tắc đang hiệu lực. */
  due_at: string | null;
  authority: string | null;
  rule_basis: string | null;
  needs_review: boolean;
}

async function noticeRowOf(p: Promotion, locale: string): Promise<NoticeRow> {
  const s = store();
  const { data: units } = await listUnits();
  const stores = descendantsOf(units, p.org_id).filter((u) => u.unit_type === "store");
  const provinces = [...new Set(stores.map((u) => STORE_PROVINCE[u.id]).filter(Boolean))].sort();
  const rule = effectiveAt(
    s.rules,
    vietnamDay(),
    (r) => r.jurisdiction === "VN" && r.promotion_kind === legalKindOf(p.kind),
  );
  return {
    promotion_id: p.id,
    title: titleOf(p, locale),
    kind: p.kind,
    value_bp: p.value_bp,
    value: p.value,
    starts_at: p.starts_at,
    ends_at: p.ends_at,
    notice_status: p.notice_status,
    notice_reference: p.notice_reference,
    notice_submitted_at: p.notice_submitted_at,
    provinces: provinces as string[],
    store_count: stores.length,
    website: p.org_id === ORG.ROOT,
    due_at:
      rule?.notice_required === true
        ? new Date(Date.parse(p.starts_at) - rule.days_before * DAY).toISOString()
        : null,
    authority: rule?.authority ?? null,
    rule_basis: rule?.legal_basis ?? null,
    needs_review: rule?.needs_review ?? true,
  };
}

// Thay bằng GET /api/v1/promotions/promotions?… (cột `notice_status`) và GET /notice-rules?at (bước
// 43). Chờ nộp trước, rồi đã nộp, rồi không cần; chương trình đã huỷ / kết thúc không hiện.
export async function listNotices(
  query: { status?: NoticeStatus; locale?: string } = {},
): Promise<{ data: NoticeRow[] }> {
  const s = store();
  const locale = query.locale ?? "vi";
  const order: Record<NoticeStatus, number> = { pending: 0, submitted: 1, not_required: 2 };
  const rows = s.promotions
    .filter((p) => p.status !== "cancelled" && p.status !== "ended")
    .filter((p) => !query.status || p.notice_status === query.status);
  const out = await Promise.all(rows.map((p) => noticeRowOf(p, locale)));
  return {
    data: out.sort(
      (a, b) =>
        order[a.notice_status] - order[b.notice_status] || a.starts_at.localeCompare(b.starts_at),
    ),
  };
}

// Thay bằng PATCH /api/v1/promotions/promotions/{id}/notice (bước 43): `{status: submitted,
// reference, submitted_at}`. Ngày nộp theo giờ Việt Nam (`YYYY-MM-DD`), không được ở tương lai.
export async function recordNotice(
  id: string,
  reference: string,
  day: string,
): Promise<SampleOutcome<Promotion>> {
  const p = store().promotions.find((x) => x.id === id);
  if (!p) return fail(404, "promotions.not_found", "Promotion not found.");
  const errors: NonNullable<Problem["errors"]> = [];
  const ref = reference.trim();
  if (!ref) errors.push(fieldError("reference", "required"));
  else if (ref.length > 64) errors.push(fieldError("reference", "too_long"));
  const date = day.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push(fieldError("submitted_on", "date"));
  else if (date > vietnamDay()) errors.push(fieldError("submitted_on", "not_future"));
  if (p.notice_status === "not_required")
    errors.push(fieldError("promotion_id", "promotions.notice_not_required"));
  if (errors.length > 0) return invalid(errors);
  p.notice_status = "submitted";
  p.notice_reference = ref;
  p.notice_submitted_at = new Date(Date.parse(`${date}T12:00:00+07:00`)).toISOString();
  if (p.last_activation_error?.code === "promotions.notice_required") {
    p.last_activation_error = null;
  }
  record(p, "notice_recorded", { reference: ref }, p.activated_at !== null);
  return { ok: true, data: structuredClone(p) };
}

/** Nội dung hồ sơ thông báo: các dòng "trường → giá trị" theo thứ tự của hồ sơ. */
export interface NoticeExport {
  file_name: string;
  content_type: string;
  body: string;
  fields: [string, string][];
}

// Thay bằng POST /api/v1/promotions/promotions/{id}/notice-export?format=csv|json (bước 43). Chỉ xuất
// dữ liệu: người nộp là con người, qua cổng dịch vụ công. CSV chặn ô bắt đầu bằng = + - @.
export async function exportNotice(
  id: string,
  format: "csv" | "json",
): Promise<SampleOutcome<NoticeExport>> {
  const p = store().promotions.find((x) => x.id === id);
  if (!p) return fail(404, "promotions.not_found", "Promotion not found.");
  const row = await noticeRowOf(p, "vi");
  const labels = await targetLabels(p, "vi");
  const form =
    p.kind === "percent_off" && p.value_bp
      ? `Giảm giá ${p.value_bp / 100}%`
      : p.kind === "amount_off" && p.value
        ? `Giảm ${Number(p.value.amount).toLocaleString("vi-VN")} đồng`
        : p.kind === "buy_x_get_y"
          ? `Tặng hàng hoá khi mua (mua ${p.buy_quantity ?? 0} tặng ${p.get_quantity ?? 0})`
          : p.kind === "flash_sale"
            ? "Giảm giá trong thời gian ngắn (flash sale)"
            : p.kind;
  const vnDay = (iso: string) => vietnamDay(Date.parse(iso)).split("-").reverse().join("/");
  const fields: [string, string][] = [
    ["merchant", `${SAMPLE_MERCHANT.name} · MST ${SAMPLE_MERCHANT.tax_code}`],
    ["program", titleOf(p, "vi")],
    ["form", form],
    ["period", `${vnDay(p.starts_at)} – ${vnDay(p.ends_at)}`],
    ["area", [...row.provinces, ...(row.website ? ["website"] : [])].join(", ")],
    ["goods", labels.join(", ") || "Mọi hàng hoá"],
    ["terms", termsOf(p, "vi")],
    ["authority", row.authority ?? ""],
    ["legal_basis", row.rule_basis ?? ""],
  ];
  const slug = p.id.slice(-6);
  if (format === "json") {
    return {
      ok: true,
      data: {
        file_name: `thong-bao-km-${slug}.json`,
        content_type: "application/json; charset=utf-8",
        body: `${JSON.stringify(Object.fromEntries(fields), null, 2)}\n`,
        fields,
      },
    };
  }
  const csv = [["field", "value"], ...fields].map((r) => r.map(csvCell).join(",")).join("\r\n");
  return {
    ok: true,
    data: {
      file_name: `thong-bao-km-${slug}.csv`,
      content_type: "text/csv; charset=utf-8",
      body: `${csv}\r\n`,
      fields,
    },
  };
}

// ---------------------------------------------------------------- Dữ liệu luật

// Thay bằng GET /api/v1/promotions/legal-limits?at= (bước 43).
export async function listLegalLimits(day: string = vietnamDay()): Promise<{ data: LegalLimit[] }> {
  return {
    data: store()
      .limits.filter((l) => l.effective_from <= day && (!l.effective_to || l.effective_to > day))
      .map((l) => ({ ...l })),
  };
}

// Thay bằng GET /api/v1/promotions/notice-rules?at= (bước 43).
export async function listNoticeRules(day: string = vietnamDay()): Promise<{ data: NoticeRule[] }> {
  return {
    data: store()
      .rules.filter((r) => r.effective_from <= day && (!r.effective_to || r.effective_to > day))
      .map((r) => ({ ...r })),
  };
}

// ---------------------------------------------------------------- Phiên bản

export interface VersionRow extends PromotionVersion {
  title: string;
  /** Các trường khác phiên bản trước (rỗng ở phiên bản 1). */
  changes: { field: keyof PromotionSnapshot; from: string; to: string }[];
}

const DIFF_FIELDS: (keyof PromotionSnapshot)[] = [
  "status",
  "title_vi",
  "title_en",
  "value_bp",
  "value",
  "min_order",
  "starts_at",
  "ends_at",
  "usage_limit",
  "per_customer_limit",
  "exclusive",
  "targets",
  "notice_status",
  "notice_reference",
];

/** Các trường khác nhau giữa hai ảnh chụp; hàm thuần (test). */
export function versionDiff(
  before: PromotionSnapshot | null,
  after: PromotionSnapshot,
): VersionRow["changes"] {
  if (!before) return [];
  const text = (v: unknown) =>
    v === null || v === undefined ? "" : Array.isArray(v) ? v.join(", ") : String(v);
  return DIFF_FIELDS.filter((f) => text(before[f]) !== text(after[f])).map((field) => ({
    field,
    from: text(before[field]),
    to: text(after[field]),
  }));
}

// Thay bằng GET /api/v1/promotions/promotions/{id}/versions (bước 43). Core trả theo từng chương
// trình; danh sách chung mọi chương trình là dự kiến. Mới trước.
export async function listVersions(
  query: { promotion_id?: string; locale?: string } = {},
): Promise<{ data: VersionRow[] }> {
  const s = store();
  const locale = query.locale ?? "vi";
  const rows = s.versions
    .filter((v) => !query.promotion_id || v.promotion_id === query.promotion_id)
    .map((v) => {
      const p = s.promotions.find((x) => x.id === v.promotion_id);
      const prev = s.versions.find(
        (x) => x.promotion_id === v.promotion_id && x.version === v.version - 1,
      );
      return {
        ...structuredClone(v),
        title: p ? titleOf(p, locale) : v.promotion_id,
        changes: versionDiff(prev?.snapshot ?? null, v.snapshot),
      };
    })
    .sort((a, b) => b.changed_at.localeCompare(a.changed_at) || b.version - a.version);
  return { data: rows };
}

// ---------------------------------------------------------------- Thử giỏ hàng

/** Đủ dữ liệu để tính mà không gọi ra ngoài (hàm thuần `evaluateWith`). */
export interface EvalContext {
  promotions: readonly Promotion[];
  codes: readonly PromotionCode[];
  flash: readonly FlashItem[];
  limits: readonly LegalLimit[];
  /** Cửa hàng của giỏ và các nút cha. */
  chain: readonly string[];
  snapshots: ReadonlyMap<
    string,
    Pick<VariantSnapshot, "product_id" | "category_ids" | "sku" | "name">
  >;
  /** Giá ngay trước khuyến mại: khoá `<promotion_id>:<variant_id>`. */
  references: ReadonlyMap<string, number | null>;
}

interface WorkLine {
  key: string;
  variant_id: string;
  quantity: number;
  unit: number;
  total: number;
  discount: number;
  locked: boolean;
  items: { promotion_id: string; amount: number; reason: Reason; capped: boolean; order: number }[];
}

const reason = (code: string, params: Record<string, string> = {}): Reason => ({
  code,
  params,
  text: "",
});

function matches(
  line: WorkLine,
  targets: readonly PromotionTarget[],
  snapshots: EvalContext["snapshots"],
  role: "condition" | "reward" = "condition",
): boolean {
  const own = targets.filter((t) => t.role === role);
  if (own.length === 0) return role === "condition";
  const snap = snapshots.get(line.variant_id);
  return own.some(
    (t) =>
      (t.target_type === "variant" && t.target_id === line.variant_id) ||
      (t.target_type === "product" && t.target_id === snap?.product_id) ||
      (t.target_type === "category" && (snap?.category_ids ?? []).includes(t.target_id)),
  );
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = (Math.imul(h, 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/**
 * Tính giảm giá cho một giỏ theo thứ tự cố định của đặc tả 43 (mục "Cách tính"): ứng viên → giảm theo
 * dòng (ưu tiên giảm dần, rồi `id`; độc quyền chặn cộng dồn) → giảm theo đơn (phân về dòng) → phí
 * giao → trần pháp luật trên từng dòng. Không ghi gì. Thêm `skipped` (dự kiến) nói chương trình nào
 * không áp và vì sao. Hàm thuần (test).
 */
export function evaluateWith(cart: Cart, ctx: EvalContext): Evaluation {
  const at = Date.parse(cart.at);
  const day = vietnamDay(at);
  const title = (p: Promotion) => titleOf(p, cart.locale);
  const lines: WorkLine[] = [...cart.lines]
    .sort((a, b) => a.line_key.localeCompare(b.line_key))
    .map((l) => ({
      key: l.line_key,
      variant_id: l.variant_id,
      quantity: l.quantity,
      unit: Number(l.unit_price.amount),
      total: Number(l.unit_price.amount) * l.quantity,
      discount: 0,
      locked: false,
      items: [],
    }));
  const rejected: RejectedCode[] = [];
  const skipped: SkippedPromotion[] = [];
  const gifts: GiftLine[] = [];
  let shipping = 0;
  const shippingBy: { promotion_id: string; amount: number }[] = [];
  const usedCodes = new Map<string, PromotionCode>();
  const live = (p: Promotion) =>
    p.status === "active" && Date.parse(p.starts_at) <= at && at < Date.parse(p.ends_at);
  const left = (p: Promotion) => (p.usage_limit === null ? 1 : p.usage_limit - p.usage_count);

  // Mã người mua nhập: mã sai không làm hỏng cả giỏ, chỉ vào `rejected_codes` kèm lý do.
  for (const key of cart.codes.map(codeKey)) {
    const code = ctx.codes.find((c) => c.code_key === key);
    const p = code ? ctx.promotions.find((x) => x.id === code.promotion_id) : undefined;
    if (!code || !p) {
      rejected.push({ code: key, reason: reason("promotions.code_invalid", { code: key }) });
    } else if (!live(p)) {
      rejected.push({ code: key, reason: reason("promotions.code_expired", { code: key }) });
    } else if (
      left(p) <= 0 ||
      (code.usage_limit !== null && code.usage_count >= code.usage_limit)
    ) {
      rejected.push({
        code: key,
        reason: reason("promotions.usage_exhausted", { title: title(p) }),
      });
    } else if (!ctx.chain.includes(p.org_id)) {
      rejected.push({
        code: key,
        reason: reason("promotions.code_not_applicable", { code: key, condition: "other_store" }),
      });
    } else if (
      p.customer_groups.length > 0 &&
      !p.customer_groups.some((g) => cart.customer_groups.includes(g))
    ) {
      rejected.push({
        code: key,
        reason: reason("promotions.code_not_applicable", {
          code: key,
          condition: "group",
          group: p.customer_groups.join(", "),
        }),
      });
    } else {
      usedCodes.set(p.id, code);
    }
  }

  // Ứng viên: đang chạy, đúng giờ, đúng cửa hàng / nhóm khách; theo mã chỉ khi mã hợp lệ.
  const candidates: Promotion[] = [];
  const skip = (p: Promotion, code: string, params: Record<string, string> = {}) => {
    const entered = usedCodes.get(p.id);
    if (entered) {
      rejected.push({
        code: entered.code,
        reason: reason("promotions.code_not_applicable", {
          code: entered.code,
          condition: code,
          ...params,
        }),
      });
    } else {
      skipped.push({
        promotion_id: p.id,
        title: title(p),
        reason: reason(`promotions.skip.${code}`, params),
      });
    }
  };
  for (const p of [...ctx.promotions].sort(
    (a, b) => b.priority - a.priority || a.id.localeCompare(b.id),
  )) {
    // Chương trình của cửa hàng khác không liên quan tới giỏ này: không nêu (trừ khi nhập mã của nó).
    if (!ctx.chain.includes(p.org_id) && !usedCodes.has(p.id)) continue;
    if (p.status === "scheduled" || p.status === "paused") {
      skip(p, p.status === "paused" ? "paused" : "not_started", { starts_at: p.starts_at });
      continue;
    }
    if (p.status !== "active") continue;
    if (Date.parse(p.starts_at) > at) {
      skip(p, "not_started", { starts_at: p.starts_at });
      continue;
    }
    if (at >= Date.parse(p.ends_at)) continue;
    if (p.trigger === "code" && !usedCodes.has(p.id)) {
      if (p.public) skip(p, "needs_code");
      continue;
    }
    if (!ctx.chain.includes(p.org_id)) {
      skip(p, "other_store");
      continue;
    }
    if (
      p.customer_groups.length > 0 &&
      !p.customer_groups.some((g) => cart.customer_groups.includes(g))
    ) {
      skip(p, "group", { group: p.customer_groups.join(", ") });
      continue;
    }
    if (left(p) <= 0) {
      skip(p, "usage_exhausted");
      continue;
    }
    candidates.push(p);
  }

  const limitOf = (p: Promotion) => limitFor(ctx.limits, p.kind, p.program_kind, day);
  let order = 0;

  // Bước 3: giảm theo dòng.
  for (const p of candidates.filter((x) => x.scope === "items")) {
    order += 1;
    if (p.kind === "buy_x_get_y") {
      const bought = lines.filter((l) => matches(l, p.targets, ctx.snapshots));
      const qty = bought.reduce((sum, l) => sum + l.quantity, 0);
      const buy = p.buy_quantity ?? 1;
      const reward = p.targets.find((t) => t.role === "reward" && t.target_type === "variant");
      if (bought.length === 0) {
        skip(p, "no_target_lines");
        continue;
      }
      if (qty < buy || !reward) {
        skip(p, "min_quantity", { buy: String(buy), have: String(qty) });
        continue;
      }
      const times = Math.floor(qty / buy);
      const giftRef = ctx.references.get(`${p.id}:${reward.target_id}`) ?? null;
      const buyRef = ctx.references.get(`${p.id}:${bought[0]?.variant_id ?? ""}`) ?? null;
      const limit = limitOf(p);
      if (giftRef === null || buyRef === null) {
        skip(p, "no_reference_price");
        continue;
      }
      if (limit === null || limit?.max_bp === null) {
        skip(p, "no_legal_data");
        continue;
      }
      const ratio = Math.round((giftRef * (p.get_quantity ?? 1) * 10_000) / (buyRef * buy));
      if (limit && limit.max_bp !== null && ratio > limit.max_bp) {
        skip(p, "exceeds_legal_limit", { max: String(limit.max_bp / 100) });
        continue;
      }
      const giftQty = times * (p.get_quantity ?? 1);
      gifts.push({ promotion_id: p.id, variant_id: reward.target_id, quantity: giftQty });
      continue;
    }
    let any = false;
    for (const line of lines) {
      if (!matches(line, p.targets, ctx.snapshots)) continue;
      if (line.locked) continue;
      if (p.exclusive && line.discount > 0) continue;
      const rest = line.total - line.discount;
      if (rest <= 0) continue;
      let amount = 0;
      let why: Reason = reason("promotions.reason.percent_off");
      if (p.kind === "percent_off" && p.value_bp) {
        amount = applyBp(rest, p.value_bp);
        why = reason("promotions.reason.percent_off", { percent: String(p.value_bp / 100) });
      } else if (p.kind === "amount_off" && p.value) {
        amount = Math.min(rest, Number(p.value.amount) * line.quantity);
        why = reason("promotions.reason.amount_off", { amount: p.value.amount });
      } else if (p.kind === "fixed_price" && p.value) {
        amount = Math.max(0, rest - Number(p.value.amount) * line.quantity);
        why = reason("promotions.reason.fixed_price", { amount: p.value.amount });
      } else if (p.kind === "flash_sale") {
        const item = ctx.flash.find(
          (f) => f.promotion_id === p.id && f.variant_id === line.variant_id,
        );
        if (!item) continue;
        const slots = item.quantity_limit - item.quantity_used;
        if (slots <= 0) {
          skip(p, "flash_sold_out", { sku: ctx.snapshots.get(line.variant_id)?.sku ?? "" });
          continue;
        }
        const n = Math.min(slots, line.quantity);
        const sale = item.sale_price ? Number(item.sale_price.amount) : null;
        amount =
          sale !== null
            ? Math.max(0, (line.unit - sale) * n)
            : applyBp(line.unit * n, item.value_bp ?? 0);
        why = reason("promotions.reason.flash_sale", {
          price: item.sale_price?.amount ?? "",
          slots: String(n),
        });
      }
      amount = Math.min(amount, rest);
      if (amount <= 0) continue;
      any = true;
      line.discount += amount;
      line.items.push({ promotion_id: p.id, amount, reason: why, capped: false, order });
      if (p.exclusive) line.locked = true;
    }
    if (!any)
      skip(
        p,
        p.exclusive && lines.some((l) => l.discount > 0) ? "exclusive_taken" : "no_target_lines",
      );
  }

  // Bước 4: giảm theo đơn, phân về các dòng đủ điều kiện theo tỉ lệ tiền dòng.
  for (const p of candidates.filter((x) => x.scope === "order")) {
    order += 1;
    const eligible = lines.filter((l) => !l.locked && matches(l, p.targets, ctx.snapshots));
    const subtotal = eligible.reduce((sum, l) => sum + l.total - l.discount, 0);
    const min = p.min_order ? Number(p.min_order.amount) : 0;
    if (eligible.length === 0) {
      skip(p, "no_target_lines");
      continue;
    }
    if (subtotal < min) {
      skip(p, "min_order", { min_order: String(min), missing: String(min - subtotal) });
      continue;
    }
    const total =
      p.kind === "percent_off" && p.value_bp
        ? applyBp(subtotal, p.value_bp)
        : Math.min(subtotal, Number(p.value?.amount ?? 0));
    const parts = allocate(
      total,
      eligible.map((l) => l.total - l.discount),
    );
    eligible.forEach((line, i) => {
      const amount = parts[i] ?? 0;
      if (amount <= 0) return;
      line.discount += amount;
      line.items.push({
        promotion_id: p.id,
        amount,
        reason: reason("promotions.reason.order_min", {
          amount: String(total),
          min_order: String(min),
        }),
        capped: false,
        order,
      });
    });
  }

  // Bước 6 (trước phí giao, vì miễn phí giao xét tổng sau giảm): trần pháp luật trên từng dòng.
  for (const line of lines) {
    if (line.items.length === 0) continue;
    for (const item of [...line.items]) {
      const p = ctx.promotions.find((x) => x.id === item.promotion_id);
      if (!p) continue;
      const limit = limitOf(p);
      const ref = ctx.references.get(`${p.id}:${line.variant_id}`);
      if (limit === null || limit?.max_bp === null) {
        line.items = line.items.filter((x) => x !== item);
        line.discount -= item.amount;
        skip(p, "no_legal_data");
      } else if (ref === null || ref === undefined) {
        line.items = line.items.filter((x) => x !== item);
        line.discount -= item.amount;
        skip(p, "no_reference_price");
      }
    }
    const maxes = line.items
      .map((item) => {
        const p = ctx.promotions.find((x) => x.id === item.promotion_id);
        const limit = p ? limitOf(p) : null;
        const ref = p ? ctx.references.get(`${p.id}:${line.variant_id}`) : null;
        return limit && limit.max_bp !== null && ref ? { max: limit.max_bp, ref } : null;
      })
      .filter((x): x is { max: number; ref: number } => x !== null);
    if (maxes.length === 0) continue;
    const ref = Math.min(...maxes.map((m) => m.ref));
    const max = Math.min(...maxes.map((m) => m.max));
    const cap = Math.floor((ref * line.quantity * max) / 10_000);
    let over = line.discount - cap;
    // Cắt từ khoản tính sau cùng (ưu tiên thấp) ngược lên.
    for (const item of [...line.items].sort((a, b) => b.order - a.order)) {
      if (over <= 0) break;
      const cut = Math.min(over, item.amount);
      item.amount -= cut;
      item.capped = true;
      item.reason = reason("promotions.reason.capped_by_law", {
        ...item.reason.params,
        max: String(max / 100),
      });
      line.discount -= cut;
      over -= cut;
    }
    line.items = line.items.filter((x) => x.amount > 0 || x.capped);
  }

  // Bước 5: miễn / giảm phí giao trên `shipping_fee`.
  const goods = lines.reduce((sum, l) => sum + l.total - l.discount, 0);
  for (const p of candidates.filter((x) => x.scope === "shipping")) {
    const min = p.min_order ? Number(p.min_order.amount) : 0;
    if (goods < min) {
      skip(p, "min_order", { min_order: String(min), missing: String(min - goods) });
      continue;
    }
    if (!cart.shipping_fee) {
      skip(p, "no_shipping_fee");
      continue;
    }
    const fee = Number(cart.shipping_fee.amount) - shipping;
    if (fee <= 0) continue;
    shipping += fee;
    shippingBy.push({ promotion_id: p.id, amount: fee });
  }

  const currency = cart.currency;
  const money = (n: number): Money => ({ amount: String(n), currency });
  const lineDiscounts: LineDiscount[] = lines.flatMap((l) =>
    l.items.map((item) => ({
      line_key: l.key,
      promotion_id: item.promotion_id,
      amount: money(item.amount),
      reason: item.reason,
      capped_by_law: item.capped,
    })),
  );
  const byPromotion = new Map<string, number>();
  for (const d of lineDiscounts) {
    byPromotion.set(
      d.promotion_id,
      (byPromotion.get(d.promotion_id) ?? 0) + Number(d.amount.amount),
    );
  }
  for (const s of shippingBy)
    byPromotion.set(s.promotion_id, (byPromotion.get(s.promotion_id) ?? 0) + s.amount);
  for (const g of gifts) if (!byPromotion.has(g.promotion_id)) byPromotion.set(g.promotion_id, 0);
  const applied: AppliedPromotion[] = [...byPromotion.entries()].flatMap(([id, amount]) => {
    const p = ctx.promotions.find((x) => x.id === id);
    if (!p) return [];
    return [
      {
        promotion_id: id,
        code: usedCodes.get(id)?.code ?? null,
        title: title(p),
        terms: termsOf(p, cart.locale),
        amount: money(amount),
      },
    ];
  });
  const total = lineDiscounts.reduce((sum, d) => sum + Number(d.amount.amount), 0) + shipping;
  // Dấu vân tay: chương trình đã áp và số tiền, không đưa `at` (đặc tả 43, "Chỗ dễ sai").
  const fingerprint = hash(
    JSON.stringify([
      lineDiscounts.map((d) => [d.line_key, d.promotion_id, d.amount.amount]),
      gifts.map((g) => [g.promotion_id, g.variant_id, g.quantity]),
      shipping,
    ]),
  );
  return {
    lines: lineDiscounts,
    shipping_discount: money(shipping),
    gifts,
    total_discount: money(total),
    applied,
    rejected_codes: rejected,
    skipped,
    fingerprint,
  };
}

export interface CartInput {
  org_id: string;
  lines: string;
  codes: string;
  customer_group: string;
  shipping_fee: string;
}

/** Dòng của giỏ đã dựng, kèm tên để hiện kết quả. */
export interface CartView {
  cart: Cart;
  names: Record<string, { sku: string; name: string }>;
  evaluation: Evaluation;
}

// Thay bằng POST /api/v1/promotions/evaluate (bước 43) với thân là `Cart`: giao diện lấy giá từ
// `GET /catalog/variants/{id}/price` (bước 41) rồi gửi giỏ. Không giữ lượt, không ghi gì.
export async function evaluateCart(
  input: CartInput,
  locale = "vi",
): Promise<SampleOutcome<CartView>> {
  const s = store();
  const errors: NonNullable<Problem["errors"]> = [];
  const { data: units } = await listUnits();
  if (!units.some((u) => u.id === input.org_id && u.unit_type === "store"))
    errors.push(fieldError("org_id", "unknown"));
  const parsed = parseCartLines(input.lines);
  if (parsed.lines.length === 0 && parsed.bad.length === 0)
    errors.push(fieldError("lines", "required"));
  for (const b of parsed.bad) errors.push(fieldError("lines", "promotions.line_format", b));
  const found: VariantSnapshot[] = [];
  for (const line of parsed.lines) {
    const { data } = await variantByCode(line.sku, locale);
    if (!data) errors.push(fieldError("lines", "catalog.variant_not_found", line.sku));
    else found.push(data);
  }
  const codes = parseCodes(input.codes);
  if (codes.length > MAX_CODES_PER_CART)
    errors.push(fieldError("codes", "promotions.too_many_codes", String(MAX_CODES_PER_CART)));
  const fee = input.shipping_fee.trim();
  if (fee && !whole(fee)) errors.push(fieldError("shipping_fee", "money_minor"));
  if (errors.length > 0) return invalid(errors);
  const at = now();
  const prices = await pricesAt(
    input.org_id,
    found.map((v) => v.variant_id),
    at,
    input.customer_group.trim() || null,
  );
  const lines: CartLine[] = [];
  parsed.lines.forEach((line, i) => {
    const v = found[i];
    if (!v) return;
    const price = prices.get(v.variant_id)?.price?.amount;
    if (!price) {
      errors.push(fieldError("lines", "promotions.no_price", v.sku));
      return;
    }
    lines.push({
      line_key: `l${String(i + 1).padStart(2, "0")}`,
      variant_id: v.variant_id,
      quantity: line.quantity,
      unit_price: price,
    });
  });
  if (errors.length > 0) return invalid(errors);
  const cart: Cart = {
    org_id: input.org_id,
    currency: "VND",
    buyer_id: null,
    customer_groups: input.customer_group.trim() ? [input.customer_group.trim().toUpperCase()] : [],
    channel: null,
    lines,
    shipping_fee: fee ? vnd(Number(fee)) : null,
    codes,
    at,
    locale,
  };
  // Lấy biến thể và giá tham chiếu TRƯỚC khi tính (đặc tả: không gọi `Catalog` trong transaction).
  const giftIds = s.promotions.flatMap((p) =>
    p.targets.filter((t) => t.role === "reward").map((t) => t.target_id),
  );
  const ids = [...new Set([...found.map((v) => v.variant_id), ...giftIds])];
  const { data: snaps } = await variants(ids, locale);
  const references = new Map<string, number | null>();
  for (const p of s.promotions) {
    if (p.status !== "active") continue;
    const ref = await pricesAt(input.org_id, ids, beforeStart(p));
    for (const id of ids) {
      const amount = ref.get(id)?.price?.amount;
      references.set(`${p.id}:${id}`, amount ? Number(amount.amount) : null);
    }
  }
  const evaluation = evaluateWith(cart, {
    promotions: s.promotions,
    codes: s.codes,
    flash: s.flash,
    limits: s.limits,
    chain: ancestorsOf(units, input.org_id),
    snapshots: new Map(snaps.map((v) => [v.variant_id, v])),
    references,
  });
  const names: CartView["names"] = {};
  for (const v of snaps) {
    names[v.variant_id] = {
      sku: v.sku,
      name: `${v.name}${v.variant_label ? ` ${v.variant_label}` : ""}`,
    };
  }
  return { ok: true, data: { cart, names, evaluation } };
}

/** Cửa hàng (nút `store`) để chọn khi thử giỏ. */
export async function storeOptions(): Promise<OrgUnit[]> {
  const { data } = await listUnits();
  return data.filter((u) => u.unit_type === "store");
}
