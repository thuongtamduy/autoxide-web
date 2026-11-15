// Kiểu và dữ liệu ban đầu của phân hệ Sàn (W-006, W-018): người bán, giấy tờ, duyệt sản phẩm, phí sàn
// có ngày hiệu lực, quyết toán theo đơn, đợt chi, tranh chấp, điểm vi phạm. Hình dạng theo đặc tả bước
// 46 của core (`docs/steps/46-marketplace.md`, mục "Bảng dữ liệu" và "API REST"); hàm đọc / ghi ở
// `market.ts`. Một bộ dữ liệu cho cả ứng dụng: người bán là nút `seller` của `org.ts`, định danh
// (KYC) và văn bản đã chấp nhận đọc từ `compliance.ts` / `compliance-records.ts`, danh mục và quy tắc
// hàng có điều kiện từ `catalog.ts`, tỉ lệ khấu trừ thay từ `tax.ts`, quyết toán đơn BM-2611-0350
// khớp bút toán của sổ Chợ Bếp Mộc ở `finance.ts`.
//
// Tiền là số nguyên đồng + mã tiền tệ (`Money`, `amount` là chuỗi như JSON của core). Core không giữ
// tiền (D-187): tiền của người mua nằm ở tài khoản thu hộ của đối tác có giấy phép; sàn chỉ ghi nghĩa
// vụ và gửi lệnh chi.
import { CATEGORY_ID, type DocumentType, type Money } from "./catalog";
import { orderByNumber } from "./order-refs";
import { SAMPLE_UNIT_IDS } from "./org";

const DAY = 86_400_000;
const HOUR = 3_600_000;

export function at(offset: number): string {
  return new Date(Date.now() + offset).toISOString();
}

export function vnd(amount: number): Money {
  return { amount: String(amount), currency: "VND" };
}

const uid = (kind: string, n: number) =>
  `01a1e000-0000-7000-8000-46${kind}${String(n).padStart(8, "0")}`;

// ---------------------------------------------------------------- Kiểu theo đặc tả bước 46

export type SellerStatus =
  | "draft"
  | "pending_verification"
  | "pending_review"
  | "active"
  | "suspended"
  | "terminated";
export const SELLER_STATUSES: readonly SellerStatus[] = [
  "draft",
  "pending_verification",
  "pending_review",
  "active",
  "suspended",
  "terminated",
];

export type SellerType = "enterprise" | "household" | "individual";
export const SELLER_TYPES: readonly SellerType[] = ["enterprise", "household", "individual"];

export type FulfillmentMode = "self" | "platform";

/**
 * Lý do của trạng thái (`status_reason`). Lý do tự động (`kyc_expired`, `agreement_not_accepted`)
 * do sàn đặt khi nghe event của `compliance`, và tự gỡ khi điều kiện đủ lại; lý do do người quyết
 * (`manual`, `penalty`) chỉ gỡ bằng "Mở lại".
 */
export type StatusReason =
  | "kyc_expired"
  | "agreement_not_accepted"
  | "penalty"
  | "manual"
  | "rejected"
  | "terminated";
export const AUTO_REASONS: readonly StatusReason[] = ["kyc_expired", "agreement_not_accepted"];

/** Tài khoản nhận tiền: số tài khoản nằm ở kho secret của khách, API chỉ trả 4 số cuối. */
export interface PayoutAccount {
  bank_name: string;
  holder_name: string;
  number_last4: string;
  updated_at: string;
}

export interface SellerEvent {
  at: string;
  /** Mã sự việc, giao diện dịch ở `market.event.*`. */
  kind: string;
  actor: string;
  note: string | null;
}

/** Hồ sơ người bán (`marketplace_sellers`). */
export interface Seller {
  org_id: string;
  display_name: string;
  slug: string;
  description: string;
  seller_type: SellerType;
  fulfillment: FulfillmentMode;
  /** Ngành hàng chính (danh mục của `catalog`): quyết giấy tờ bắt buộc. */
  category_id: string;
  cod_enabled: boolean;
  /** Địa chỉ lấy hàng (`Address` của bước 34), mẫu ghi rõ là mẫu. */
  pickup_address: string;
  status: SellerStatus;
  status_reason: StatusReason | null;
  status_note: string | null;
  payout_account: PayoutAccount | null;
  /** Điểm đánh giá trung bình ×10 (48 = 4,8 sao) và số lượt; `null` khi chưa có. */
  rating: { average_x10: number; count: number } | null;
  product_count: number;
  penalty_points: number;
  submitted_at: string | null;
  activated_at: string | null;
  joined_at: string;
  updated_at: string;
  /** Mới nhất trước. */
  history: SellerEvent[];
}

export type SellerDocumentStatus = "submitted" | "approved" | "rejected" | "expired";

/** Giấy tờ ngành hàng của người bán (`marketplace_seller_documents`). */
export interface SellerDocument {
  id: string;
  seller_org_id: string;
  doc_type: DocumentType;
  number: string;
  status: SellerDocumentStatus;
  valid_until: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export type ListingStatus = "pending" | "approved" | "rejected" | "delisted";

/** Phát hiện tự động khi tạo lượt duyệt: chỉ là gợi ý, người duyệt quyết. */
export interface Finding {
  code: "documents_missing" | "prohibited" | "seller_not_eligible" | "reported";
  /** Tên quy tắc / giấy tờ… để giao diện điền vào câu. */
  params: Record<string, string>;
  legal_basis: string | null;
}

/** Lượt duyệt sản phẩm (`marketplace_listing_reviews`), kèm tóm tắt sản phẩm để khỏi gọi thêm. */
export interface ListingReview {
  id: string;
  seller_org_id: string;
  product_id: string;
  product_name: string;
  category_id: string;
  revision: number;
  change: "new" | "edit" | "price";
  price: Money;
  previous_price: Money | null;
  images: number;
  status: ListingStatus;
  findings: Finding[];
  reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

export type FeeKind = "commission" | "payment" | "service" | "fulfillment" | "storage";
export const FEE_KINDS: readonly FeeKind[] = [
  "commission",
  "payment",
  "service",
  "fulfillment",
  "storage",
];

/** Dòng phí có ngày hiệu lực (`marketplace_fee_rules`): chỉ thêm; đổi = đóng dòng cũ + dòng mới. */
export interface FeeRule {
  id: string;
  fee_kind: FeeKind;
  /** `null` = mọi ngành hàng. */
  category_id: string | null;
  /** `null` = mọi loại người bán. */
  seller_type: SellerType | null;
  /** Tỉ lệ theo basis point (600 = 6%) trên tiền hàng; phí cố định thì `null`. */
  rate_bp: number | null;
  fixed: Money | null;
  /** Đơn vị của phí cố định. */
  unit: "order" | "m3_month" | null;
  /** Phí sàn là dịch vụ của sàn: mức đã gồm thuế GTGT của phí. */
  includes_vat: boolean;
  effective_from: string;
  effective_to: string | null;
  created_by: string;
  created_at: string;
}

export type SettlementStatus =
  | "pending"
  | "held"
  | "releasable"
  | "in_payout"
  | "paid"
  | "reversed";

/** Bảng quyết toán của một đơn (`marketplace_settlements`): ảnh chụp lúc đơn được thanh toán. */
export interface Settlement {
  id: string;
  order_id: string;
  order_number: string;
  seller_org_id: string;
  funds_flow: "partner_collect";
  gross: Money;
  subsidy: Money;
  /** Phí sàn đã gồm GTGT của phí. */
  fees: Money;
  fee_vat: Money;
  withholding_vat: Money;
  withholding_pit: Money;
  net: Money;
  /** Tỉ lệ ảnh chụp tại ngày đặt đơn. */
  breakdown: { commission_bp: number; vat_percent: string | null; pit_percent: string | null };
  status: SettlementStatus;
  placed_at: string;
  delivered_at: string | null;
  completed_at: string | null;
  hold_until: string | null;
  payout_id: string | null;
}

export type PayoutStatus = "building" | "sent" | "paid" | "failed" | "cancelled";

/** Lệnh chi cho người bán (`marketplace_payouts`). Tiền đi từ tài khoản thu hộ của đối tác. */
export interface Payout {
  id: string;
  seller_org_id: string;
  period_from: string;
  period_to: string;
  order_count: number;
  gross: Money;
  fees: Money;
  fee_vat: Money;
  withholding_vat: Money;
  withholding_pit: Money;
  /** Khoản trừ mang sang (phạt, hoàn sau hoàn tất); âm = trừ. */
  adjustments: Money;
  amount: Money;
  status: PayoutStatus;
  /** `marketplace:payout:<id>`: gửi lại cùng mã để đối tác không chi hai lần. */
  reference: string;
  attempts: number;
  failure: string | null;
  withholding_certificate: string | null;
  sent_at: string | null;
  paid_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type DisputeStatus = "open" | "seller_responded" | "escalated" | "resolved" | "withdrawn";
export type Resolution = "refund_full" | "refund_partial" | "reject";
export const RESOLUTIONS: readonly Resolution[] = ["refund_full", "refund_partial", "reject"];
export type DisputeReason = "damaged" | "missing_item" | "wrong_item" | "not_received";

export interface DisputeMessage {
  id: string;
  author_kind: "buyer" | "seller" | "platform";
  /** `opened`, `reply`, `escalated`, `decision`, `refund_agreed`. */
  kind: string;
  body: string;
  media_count: number;
  at: string;
}

/** Tranh chấp người mua – người bán (`marketplace_disputes` + `…_messages`). */
export interface Dispute {
  id: string;
  number: string;
  order_id: string;
  order_number: string;
  seller_org_id: string;
  reason_code: DisputeReason;
  claim: Money;
  /** Số người mua đã trả cho phần của người bán (trần của số hoàn). */
  paid: Money;
  status: DisputeStatus;
  resolution: Resolution | null;
  resolution_amount: Money | null;
  seller_due_at: string;
  platform_due_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  /** Cũ nhất trước; chỉ thêm. */
  messages: DisputeMessage[];
}

export type Sanction = "warning" | "listing_limit" | "suspend_days" | "terminate";
export const SANCTIONS: readonly Sanction[] = ["warning", "listing_limit", "suspend_days"];
export const PENALTY_RULES = ["late_shipments", "seller_cancellations", "disputes_lost"] as const;

/** Điểm vi phạm (`marketplace_penalties`); mỗi chế tài khiếu nại được một lần. */
export interface Penalty {
  id: string;
  seller_org_id: string;
  rule_code: string;
  points: number;
  sanction: Sanction;
  reason: string;
  expires_at: string;
  appealed: boolean;
  appeal_reason: string | null;
  created_by: string;
  created_at: string;
}

/** Chỉ số 90 ngày (`marketplace_seller_metrics` gộp ba tháng). Tỉ lệ theo basis point. */
export interface SellerMetrics {
  orders: number;
  on_time_bp: number;
  seller_cancel_bp: number;
  disputes_lost: number;
}

/** Lời mời làm người bán (đề xuất: chưa có trong đặc tả 46, gửi qua lời mời của bước 34). */
export interface SellerInvitation {
  id: string;
  email: string;
  seller_type: SellerType;
  note: string;
  created_at: string;
}

export type MarketOrderStatus = "paid" | "shipping" | "delivered" | "completed" | "cancelled";

/** Đơn của người bán trên sàn (phần nhìn từ `orders` của bước 45, tách theo người bán). */
export interface MarketOrder {
  id: string;
  number: string;
  seller_org_id: string;
  placed_at: string;
  total: Money;
  items: number;
  status: MarketOrderStatus;
}

// ---------------------------------------------------------------- Kho

export interface MarketStore {
  sellers: Seller[];
  documents: SellerDocument[];
  listings: ListingReview[];
  fees: FeeRule[];
  settlements: Settlement[];
  payouts: Payout[];
  disputes: Dispute[];
  penalties: Penalty[];
  metrics: Map<string, SellerMetrics>;
  invitations: SellerInvitation[];
  orders: MarketOrder[];
}

const S = SAMPLE_UNIT_IDS.sellers;
/** Người bán mẫu theo thứ tự của `org.ts`. */
export const SELLER = {
  nhaNa: S[0] as string,
  gomSu: S[1] as string,
  nhaTho: S[2] as string,
  daoKeo: S[3] as string,
  anNhien: S[4] as string,
  khanBong: S[5] as string,
} as const;

const MAI = "Ngô Mai";
const SYSTEM = "system";

/**
 * Mã đơn trên sàn. Đơn đã có ở `order-refs.ts` dùng đúng ID ở đó; đơn chỉ có ở sàn (chưa có bộ đơn
 * hàng mẫu, bước 45) mang ID của file này — bộ đơn hàng dựng sau nên dùng đúng các mã và ID này.
 */
export const MARKET_ORDER_NUMBERS = [
  "BM-2611-0301",
  "BM-2611-0350",
  "BM-2611-0360",
  "BM-2611-0386",
  "BM-2611-0393",
  "BM-2611-0402",
  "BM-2611-0408",
  "BM-2611-0417",
  "BM-2611-0421",
] as const;

export function marketOrderId(number: string): string {
  const known = orderByNumber(number);
  if (known) return known.id;
  return uid("a3", MARKET_ORDER_NUMBERS.indexOf(number as never) + 1);
}

function event(offset: number, kind: string, actor = SYSTEM, note: string | null = null) {
  return { at: at(offset), kind, actor, note };
}

function seedSellers(): Seller[] {
  const base = (
    org: string,
    name: string,
    slug: string,
    type: SellerType,
    fulfillment: FulfillmentMode,
    category: string,
    joined: number,
  ): Seller => ({
    org_id: org,
    display_name: name,
    slug,
    description: "",
    seller_type: type,
    fulfillment,
    category_id: category,
    cod_enabled: fulfillment === "platform",
    pickup_address: "[Số nhà, đường mẫu], Phường Hoàng Mai, Hà Nội",
    status: "active",
    status_reason: null,
    status_note: null,
    payout_account: {
      bank_name: "Ngân hàng mẫu",
      holder_name: name.toUpperCase(),
      number_last4: "0000",
      updated_at: at(joined),
    },
    rating: null,
    product_count: 0,
    penalty_points: 0,
    submitted_at: at(joined),
    activated_at: at(joined + 2 * DAY),
    joined_at: at(joined),
    updated_at: at(joined + 2 * DAY),
    history: [event(joined + 2 * DAY, "approved", MAI), event(joined, "submitted", name)],
  });
  return [
    {
      ...base(
        SELLER.nhaNa,
        "Gia Dụng Nhà Na",
        "gia-dung-nha-na",
        "household",
        "platform",
        CATEGORY_ID.pots,
        -300 * DAY,
      ),
      description: "Đồ gia dụng bền, giá thật, giao nhanh trong nội thành Hà Nội.",
      status: "suspended",
      status_reason: "kyc_expired",
      rating: { average_x10: 45, count: 212 },
      product_count: 46,
      updated_at: at(-14 * DAY),
      history: [
        event(-2 * DAY, "kyc_resubmitted", "Gia Dụng Nhà Na"),
        event(-14 * DAY, "auto_suspended", SYSTEM, "kyc_expired"),
        event(-298 * DAY, "approved", MAI),
        event(-300 * DAY, "submitted", "Gia Dụng Nhà Na"),
      ],
    },
    {
      ...base(
        SELLER.gomSu,
        "Gốm Sứ Bát Tràng Xưa",
        "gom-su-bat-trang-xua",
        "enterprise",
        "self",
        CATEGORY_ID.ceramics,
        -250 * DAY,
      ),
      description: "Gốm men lam, men rạn làm tay ở Bát Tràng.",
      pickup_address: "[Số nhà mẫu], xã Bát Tràng, Hà Nội",
      rating: { average_x10: 48, count: 530 },
      product_count: 86,
    },
    {
      ...base(
        SELLER.nhaTho,
        "Bếp Nhà Thỏ",
        "bep-nha-tho",
        "individual",
        "self",
        CATEGORY_ID.pans,
        -3 * DAY,
      ),
      description: "Chảo, nồi nhỏ cho bếp một người; bán cả qua livestream.",
      status: "pending_review",
      activated_at: null,
      payout_account: {
        bank_name: "Ngân hàng mẫu",
        holder_name: "[HỌ TÊN MẪU]",
        number_last4: "0000",
        updated_at: at(-3 * DAY),
      },
      submitted_at: at(-2 * HOUR),
      updated_at: at(-2 * HOUR),
      history: [
        event(-2 * HOUR, "submitted", "Bếp Nhà Thỏ"),
        event(-3 * DAY + HOUR, "kyc_verified", SYSTEM),
        event(-3 * DAY, "registered", "Bếp Nhà Thỏ"),
      ],
    },
    {
      ...base(
        SELLER.daoKeo,
        "Dao Kéo Đa Sỹ Truyền Thống",
        "dao-keo-da-sy",
        "household",
        "self",
        CATEGORY_ID.knives,
        -5 * DAY,
      ),
      description: "Dao rèn tay làng Đa Sỹ.",
      status: "pending_verification",
      activated_at: null,
      product_count: 12,
      submitted_at: null,
      updated_at: at(-3 * DAY),
      history: [
        event(-3 * DAY, "kyc_started", "Dao Kéo Đa Sỹ Truyền Thống"),
        event(-5 * DAY, "registered", "Dao Kéo Đa Sỹ Truyền Thống"),
      ],
    },
    {
      ...base(
        SELLER.anNhien,
        "Thực Phẩm Sạch An Nhiên",
        "thuc-pham-sach-an-nhien",
        "enterprise",
        "platform",
        CATEGORY_ID.spices,
        -6 * DAY,
      ),
      description: "Gia vị, muối chấm đóng gói.",
      status: "pending_verification",
      activated_at: null,
      payout_account: null,
      submitted_at: null,
      updated_at: at(-4 * DAY),
      history: [
        event(-4 * DAY, "kyc_started", "Thực Phẩm Sạch An Nhiên"),
        event(-6 * DAY, "registered", "Thực Phẩm Sạch An Nhiên"),
      ],
    },
    {
      ...base(
        SELLER.khanBong,
        "Khăn Bông Hạ Long",
        "khan-bong-ha-long",
        "household",
        "platform",
        CATEGORY_ID.textiles,
        -200 * DAY,
      ),
      description: "Khăn bếp, khăn lau cotton dệt ở Quảng Ninh.",
      pickup_address: "[Số nhà, đường mẫu], Phường Hồng Gai, Quảng Ninh",
      rating: { average_x10: 41, count: 96 },
      product_count: 18,
      penalty_points: 3,
      history: [
        event(-9 * DAY, "penalty", SYSTEM, "late_shipments"),
        event(-198 * DAY, "approved", MAI),
        event(-200 * DAY, "submitted", "Khăn Bông Hạ Long"),
      ],
    },
  ];
}

function seedDocuments(): SellerDocument[] {
  return [
    {
      id: uid("a0", 1),
      seller_org_id: SELLER.gomSu,
      doc_type: "self_declaration",
      number: "[SỐ TỰ CÔNG BỐ MẪU]",
      status: "approved",
      valid_until: null,
      review_note: null,
      created_at: at(-250 * DAY),
      updated_at: at(-249 * DAY),
    },
  ];
}

function seedListings(): ListingReview[] {
  const review = (
    n: number,
    seller: string,
    name: string,
    category: string,
    price: number,
    change: ListingReview["change"],
    revision: number,
    offset: number,
    extra: Partial<ListingReview> = {},
  ): ListingReview => ({
    id: uid("b0", n),
    seller_org_id: seller,
    product_id: uid("b1", n),
    product_name: name,
    category_id: category,
    revision,
    change,
    price: vnd(price),
    previous_price: null,
    images: 4,
    status: "pending",
    findings: [],
    reason: null,
    decided_by: null,
    decided_at: null,
    created_at: at(offset),
    ...extra,
  });
  // Phát hiện tự động tính khi tạo (`market.ts` gọi `findingsFor`); ở đây chỉ dựng bản ghi.
  return [
    review(
      1,
      SELLER.anNhien,
      "Muối ớt tôm Tây Ninh 200 g",
      CATEGORY_ID.spices,
      65_000,
      "new",
      1,
      -20 * HOUR,
      { images: 5 },
    ),
    review(
      2,
      SELLER.daoKeo,
      "Dao Santoku thép Damascus 18 cm",
      CATEGORY_ID.knives,
      1_250_000,
      "new",
      1,
      -26 * HOUR,
    ),
    review(
      3,
      SELLER.gomSu,
      "Bát gốm men lam (bộ 6)",
      CATEGORY_ID.ceramics,
      420_000,
      "price",
      3,
      -5 * HOUR,
      {
        previous_price: vnd(450_000),
      },
    ),
    review(
      4,
      SELLER.khanBong,
      "Khăn lau bếp cotton (bộ 3)",
      CATEGORY_ID.textiles,
      95_000,
      "new",
      1,
      -2 * DAY,
      {
        status: "approved",
        decided_by: MAI,
        decided_at: at(-2 * DAY + 5 * HOUR),
      },
    ),
    review(
      5,
      SELLER.nhaNa,
      "Nồi inox 3 đáy 24 cm",
      CATEGORY_ID.pots,
      690_000,
      "new",
      1,
      -40 * DAY,
      {
        status: "approved",
        decided_by: MAI,
        decided_at: at(-39 * DAY),
      },
    ),
    review(
      6,
      SELLER.nhaTho,
      "Chảo gang mini 16 cm",
      CATEGORY_ID.pans,
      280_000,
      "new",
      1,
      -90 * 60_000,
    ),
  ];
}

function seedFees(): FeeRule[] {
  const rule = (
    n: number,
    kind: FeeKind,
    category: string | null,
    rate: number | null,
    from: string,
    to: string | null,
    extra: Partial<FeeRule> = {},
  ): FeeRule => ({
    id: uid("c0", n),
    fee_kind: kind,
    category_id: category,
    seller_type: null,
    rate_bp: rate,
    fixed: null,
    unit: null,
    includes_vat: true,
    effective_from: from,
    effective_to: to,
    created_by: MAI,
    created_at: `${from}T02:00:00Z`,
    ...extra,
  });
  return [
    rule(1, "commission", null, 700, "2026-01-01", "2026-02-28"),
    rule(2, "commission", null, 600, "2026-03-01", null),
    rule(3, "commission", CATEGORY_ID.ceramics, 500, "2026-09-01", null),
    rule(4, "storage", null, null, "2026-10-01", null, { fixed: vnd(120_000), unit: "m3_month" }),
  ];
}

/** Quyết toán mẫu: số tính bằng cùng công thức với `market.ts` (test giữ hai bên khớp nhau). */
export interface SettlementSeed {
  n: number;
  seller: string;
  number: string;
  gross: number;
  status: SettlementStatus;
  placed: number;
  delivered: number | null;
  completed: number | null;
  payout: number | null;
}

export const SETTLEMENT_SEEDS: readonly SettlementSeed[] = [
  // Gia Dụng Nhà Na (hộ kinh doanh): đơn 0350 hoàn tất 11/11, khớp bút toán `marketplace.settle` của
  // sổ Chợ Bếp Mộc (`finance.ts`): 690.000 ₫ → người bán 638.250 ₫.
  {
    n: 1,
    seller: SELLER.nhaNa,
    number: "BM-2611-0301",
    gross: 1_250_000,
    status: "paid",
    placed: -16,
    delivered: -13,
    completed: -6,
    payout: 5,
  },
  {
    n: 2,
    seller: SELLER.nhaNa,
    number: "BM-2611-0350",
    gross: 690_000,
    status: "releasable",
    placed: -11,
    delivered: -9,
    completed: -4,
    payout: null,
  },
  {
    n: 3,
    seller: SELLER.nhaNa,
    number: "BM-2611-0417",
    gross: 414_000,
    status: "pending",
    placed: -1,
    delivered: null,
    completed: null,
    payout: null,
  },
  {
    n: 4,
    seller: SELLER.nhaNa,
    number: "BM-2611-0360",
    gross: 380_000,
    status: "held",
    placed: -6,
    delivered: -3,
    completed: null,
    payout: null,
  },
  // Gốm Sứ (doanh nghiệp tự kê khai thuế): không khấu trừ thay.
  {
    n: 5,
    seller: SELLER.gomSu,
    number: "BM-2611-0386",
    gross: 420_000,
    status: "held",
    placed: -8,
    delivered: -5,
    completed: null,
    payout: null,
  },
  {
    n: 6,
    seller: SELLER.gomSu,
    number: "BM-2611-0393",
    gross: 1_680_000,
    status: "releasable",
    placed: -12,
    delivered: -10,
    completed: -3,
    payout: null,
  },
  {
    n: 7,
    seller: SELLER.gomSu,
    number: "BM-2611-0408",
    gross: 860_000,
    status: "held",
    placed: -4,
    delivered: -1,
    completed: null,
    payout: null,
  },
  // Khăn Bông Hạ Long (hộ kinh doanh).
  {
    n: 8,
    seller: SELLER.khanBong,
    number: "BM-2611-0402",
    gross: 285_000,
    status: "held",
    placed: -3,
    delivered: -1,
    completed: null,
    payout: null,
  },
  {
    n: 9,
    seller: SELLER.khanBong,
    number: "BM-2611-0421",
    gross: 190_000,
    status: "pending",
    placed: 0,
    delivered: null,
    completed: null,
    payout: null,
  },
];

/** Đợt chi mẫu: tổng của kỳ (số đơn và tiền gộp); quyết toán từng đơn chỉ liệt kê vài đơn gần đây. */
export interface PayoutSeed {
  n: number;
  seller: string;
  from: string;
  to: string;
  orders: number;
  gross: number;
  status: PayoutStatus;
  failure?: string;
}

export const PAYOUT_SEEDS: readonly PayoutSeed[] = [
  // Số của bản thiết kế: 24.600.000 ₫ tiền hàng, hoa hồng 6%, khấu trừ thay 1% + 0,5% → 22.755.000 ₫.
  {
    n: 1,
    seller: SELLER.nhaNa,
    from: "2026-11-04",
    to: "2026-11-10",
    orders: 38,
    gross: 24_600_000,
    status: "building",
  },
  {
    n: 2,
    seller: SELLER.khanBong,
    from: "2026-10-28",
    to: "2026-11-03",
    orders: 21,
    gross: 9_000_000,
    status: "failed",
    failure: "account_name_mismatch",
  },
  {
    n: 3,
    seller: SELLER.gomSu,
    from: "2026-10-28",
    to: "2026-11-03",
    orders: 44,
    gross: 32_842_105,
    status: "paid",
  },
  {
    n: 4,
    seller: SELLER.gomSu,
    from: "2026-11-04",
    to: "2026-11-10",
    orders: 29,
    gross: 19_620_000,
    status: "building",
  },
  {
    n: 5,
    seller: SELLER.nhaNa,
    from: "2026-10-28",
    to: "2026-11-03",
    orders: 41,
    gross: 26_400_000,
    status: "paid",
  },
];

function seedDisputes(): Dispute[] {
  const msg = (
    n: number,
    author: DisputeMessage["author_kind"],
    kind: string,
    body: string,
    offset: number,
    media = 0,
  ): DisputeMessage => ({
    id: uid("f1", n),
    author_kind: author,
    kind,
    body,
    media_count: media,
    at: at(offset),
  });
  const dispute = (
    n: number,
    number: string,
    order: string,
    seller: string,
    reason: DisputeReason,
    claim: number,
    paid: number,
    status: DisputeStatus,
    opened: number,
    messages: DisputeMessage[],
    extra: Partial<Dispute> = {},
  ): Dispute => ({
    id: uid("f0", n),
    number,
    order_id: marketOrderId(order),
    order_number: order,
    seller_org_id: seller,
    reason_code: reason,
    claim: vnd(claim),
    paid: vnd(paid),
    status,
    resolution: null,
    resolution_amount: null,
    seller_due_at: at(opened + 48 * HOUR),
    platform_due_at: at(opened + 48 * HOUR + 7 * DAY),
    resolved_by: null,
    resolved_at: null,
    created_at: at(opened),
    updated_at: messages.at(-1)?.at ?? at(opened),
    messages,
    ...extra,
  });
  return [
    dispute(
      1,
      "TC-2611-0031",
      "BM-2611-0386",
      SELLER.gomSu,
      "damaged",
      420_000,
      420_000,
      "escalated",
      -5 * DAY,
      [
        msg(
          1,
          "buyer",
          "opened",
          "Bát vỡ 2 chiếc khi nhận, hộp móp. Xin hoàn toàn bộ 420.000 ₫.",
          -5 * DAY,
          3,
        ),
        msg(2, "seller", "reply", "Shop đề nghị đổi bộ mới, chịu phí gửi lại.", -4 * DAY),
        msg(3, "buyer", "reply", "Tôi không muốn đổi, xin hoàn tiền.", -4 * DAY + 6 * HOUR),
        msg(4, "platform", "escalated", "Hai bên chưa thống nhất; chuyển sàn phân xử.", -3 * DAY),
      ],
      { platform_due_at: at(10 * HOUR) },
    ),
    dispute(
      2,
      "TC-2611-0034",
      "BM-2611-0402",
      SELLER.khanBong,
      "missing_item",
      95_000,
      285_000,
      "open",
      -20 * HOUR,
      [msg(5, "buyer", "opened", "Đặt 3 bộ khăn, nhận 2 bộ.", -20 * HOUR, 1)],
    ),
    dispute(
      3,
      "TC-2611-0027",
      "BM-2611-0350",
      SELLER.nhaNa,
      "wrong_item",
      690_000,
      690_000,
      "resolved",
      -10 * DAY,
      [
        msg(6, "buyer", "opened", "Nồi màu khác ảnh.", -10 * DAY, 2),
        msg(7, "seller", "reply", "Ảnh sản phẩm ghi rõ màu bạc; nồi đúng mẫu.", -9 * DAY),
        msg(8, "platform", "decision", "Hàng đúng mô tả; từ chối yêu cầu hoàn.", -8 * DAY),
      ],
      {
        resolution: "reject",
        resolution_amount: vnd(0),
        resolved_by: MAI,
        resolved_at: at(-8 * DAY),
      },
    ),
    dispute(
      4,
      "TC-2611-0029",
      "BM-2611-0360",
      SELLER.nhaNa,
      "damaged",
      380_000,
      380_000,
      "open",
      -40 * HOUR,
      [msg(9, "buyer", "opened", "Nồi bị móp một bên thành.", -40 * HOUR, 2)],
    ),
  ];
}

function seedPenalties(): Penalty[] {
  return [
    {
      id: uid("a1", 1),
      seller_org_id: SELLER.khanBong,
      rule_code: "late_shipments",
      points: 3,
      sanction: "warning",
      reason: "6 đơn giao cho hãng trễ hơn 2 ngày trong tháng 10.",
      expires_at: at(81 * DAY),
      appealed: false,
      appeal_reason: null,
      created_by: SYSTEM,
      created_at: at(-9 * DAY),
    },
  ];
}

function seedMetrics(): Map<string, SellerMetrics> {
  return new Map([
    [SELLER.nhaNa, { orders: 412, on_time_bp: 9_700, seller_cancel_bp: 40, disputes_lost: 0 }],
    [SELLER.gomSu, { orders: 655, on_time_bp: 9_850, seller_cancel_bp: 20, disputes_lost: 1 }],
    [SELLER.khanBong, { orders: 233, on_time_bp: 8_900, seller_cancel_bp: 130, disputes_lost: 0 }],
  ]);
}

function seedOrders(): MarketOrder[] {
  const order = (
    number: string,
    seller: string,
    placed: number,
    total: number,
    items: number,
    status: MarketOrderStatus,
  ): MarketOrder => ({
    id: marketOrderId(number),
    number,
    seller_org_id: seller,
    placed_at: at(placed * DAY),
    total: vnd(total),
    items,
    status,
  });
  return [
    order("BM-2611-0421", SELLER.khanBong, 0, 190_000, 2, "paid"),
    order("BM-2611-0417", SELLER.nhaNa, -1, 414_000, 2, "paid"),
    order("BM-2611-0408", SELLER.gomSu, -4, 860_000, 3, "delivered"),
    order("BM-2611-0402", SELLER.khanBong, -3, 285_000, 3, "delivered"),
    order("BM-2611-0393", SELLER.gomSu, -12, 1_680_000, 4, "completed"),
    order("BM-2611-0386", SELLER.gomSu, -8, 420_000, 1, "delivered"),
    order("BM-2611-0360", SELLER.nhaNa, -6, 380_000, 1, "delivered"),
    order("BM-2611-0350", SELLER.nhaNa, -11, 690_000, 1, "completed"),
    order("BM-2611-0301", SELLER.nhaNa, -16, 1_250_000, 2, "completed"),
  ];
}

/** Dữ liệu ban đầu (không gồm quyết toán / đợt chi — `market.ts` tính bằng biểu phí và thuế). */
export function seedMarket(): Omit<MarketStore, "settlements" | "payouts"> {
  return {
    sellers: seedSellers(),
    documents: seedDocuments(),
    listings: seedListings(),
    fees: seedFees(),
    disputes: seedDisputes(),
    penalties: seedPenalties(),
    metrics: seedMetrics(),
    invitations: [],
    orders: seedOrders(),
  };
}

export const ID = { uid, DAY, HOUR, MAI, SYSTEM } as const;
