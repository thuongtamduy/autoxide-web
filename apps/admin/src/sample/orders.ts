// Dữ liệu mẫu của màn "Đơn hàng" (module `orders` của core, bước 45, chưa có). Màn dựng hoàn toàn bằng
// file này và `sample/stores.ts` (W-006, W-017). Hình dạng theo đặc tả `docs/steps/45-orders.md` của
// core (mục "Máy trạng thái đơn", "Bảng dữ liệu", "API REST", "Mã lỗi", "Chỗ dễ sai", "Bổ sung theo
// D-201"); trường đặc tả chưa có ghi "dự kiến" và nằm trong bảng chỗ thiếu API.
//
// Một bộ dữ liệu cho cả ứng dụng:
// - mã đơn và nút bán theo `sample/order-refs.ts` (vận đơn, đối soát COD, sổ cái trỏ tới các mã này);
// - giá theo bảng giá mẫu (`pricesAt` của `sample/catalog.ts`), khuyến mại tính bằng `evaluateCart` của
//   `sample/promotions.ts` lúc dựng đơn, thuế GTGT theo `sample/tax.ts` (thuế suất có ngày hiệu lực) —
//   giá và thuế chụp vào dòng đơn lúc đặt, không tính lại khi bảng giá đổi;
// - món và tiền COD của từng vận đơn ở `sample/shipping.ts` khớp đơn (test kiểm).
//
// "412 đơn trong 30 ngày, 37 chờ xử lý" của bản thiết kế là số đếm thật của bộ dữ liệu: các đơn có mã
// trong `order-refs.ts` được viết tay; các số còn lại từ BM-2611-0008 tới 0419 là đơn sinh theo một bộ
// sinh số cố định (cùng kết quả mỗi lần khởi động).
//
// Tiền (D-187 của core): mọi khoản đi qua cổng thanh toán, đối tác thu hộ có giấy phép, hãng vận chuyển
// thu hộ hoặc két của cửa hàng; hệ thống chỉ ghi nhận và đối soát, không giữ tiền. Tên, số điện thoại,
// email là mẫu (miền `example.com`). Giờ lưu UTC. Lệnh ghi đổi một kho trong bộ nhớ của tiến trình máy
// chủ; khởi động lại thì về ban đầu.
import type { Problem } from "@autoxide/sdk";
import { fold } from "@/lib/fold";
import {
  type Channel,
  canMove,
  type Flow,
  NO_FILTERS,
  type OrderFilters,
  type OrderStatus,
  type PaymentStatus,
  PENDING_STATUSES,
  UNDELIVERED_STATUSES,
} from "@/lib/orders";
import { parseCartLines } from "@/lib/promotions";
import {
  type Money,
  ORG,
  pricesAt,
  type Ref,
  type SampleSku,
  variantByCode,
  variants,
} from "./catalog";
import {
  ACCOUNT_SEEDS,
  type AccountSeed,
  channelForGenerated,
  channelPrice,
  externalRef,
  liveListing,
} from "./channel-accounts";
import { type SamplePage, samplePage } from "./index";
import { ORDER_REFS, orderByNumber } from "./order-refs";
import { listUnits } from "./org";
import { csvCell, evaluateCart } from "./promotions";
import { listTaxRates, rateOn, vietnamDay } from "./tax";

export type SampleOutcome<T> = { ok: true; data: T } | { ok: false; problem: Problem };

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;

/** Hoàn tác một lần chuyển trạng thái của nhân viên được trong khoảng này (dự kiến). */
export const UNDO_WINDOW_MS = 15 * MINUTE;
/** Hạn đổi trả mặc định (đặc tả 45: dữ liệu theo nút, khuyến nghị 7 ngày). */
export const RETURN_WINDOW_DAYS = 7;
/** Mỗi giỏ bỏ dở nhắc tối đa bấy nhiêu lần (dự kiến, chính sách theo khách). */
export const MAX_CART_REMINDERS = 2;
/** Giữ hàng chờ nhận tại cửa hàng (dự kiến `hold_days`, D-201). */
export const PICKUP_HOLD_DAYS = 3;

// ---------------------------------------------------------------- Kiểu theo đặc tả bước 45

export type PaymentMethod = "card" | "vietqr" | "ewallet" | "cod" | "cash" | "card_terminal";
/** `channel_collect` (đặc tả 48, `ChannelCollect`): kênh bán ngoài (Shopee, TikTok Shop) thu tiền rồi trả lại. */
export type FundsFlow = "self_collect" | "partner_collect" | "channel_collect";
export type FulfillmentStatus = "unfulfilled" | "fulfilled" | "returned_partial" | "returned";

/** Người bán trên sàn (bước 46 chưa có): loại theo hồ sơ KYC (bước 37) quyết khấu trừ thuế thay. */
export interface Seller {
  name: string;
  kind: "household" | "enterprise";
}

export interface LineTax {
  tax_code: string;
  category: string;
  /** Chuỗi thập phân như `TaxEngine` trả (vd "0.08"). */
  rate: string;
  base: Money;
  amount: Money;
}

export interface LineDiscount {
  promotion_id: string;
  title: string;
  amount: Money;
}

export interface OrderLine {
  id: string;
  variant_id: string;
  product_id: string;
  sku: string;
  name: string;
  quantity: number;
  /** Giá gồm thuế, trước giảm, chụp lúc đặt. */
  unit_price: Money;
  discount: Money;
  /** Gồm thuế, sau giảm. */
  net: Money;
  taxes: LineTax[];
  discounts: LineDiscount[];
  /** Quà tặng của chương trình (giá 0 sau giảm). */
  gift: boolean;
  returned_quantity: number;
}

export interface AppliedPromotion {
  promotion_id: string;
  title: string;
  code: string | null;
  amount: Money;
}

export interface OrderPayment {
  id: string;
  method: PaymentMethod;
  /** Bên giữ dòng tiền: cổng, đối tác thu hộ, hãng, két của cửa hàng (chữ mẫu). */
  partner: string;
  reference: string;
  amount: Money;
  /** Số đã nhận (chuyển khoản lệch số tiền thì khác `amount`). */
  received: Money | null;
  status: "pending" | "succeeded" | "needs_review" | "expired" | "late";
  succeeded_at: string | null;
}

export type RefundDestination =
  | "card"
  | "bank_account"
  | "ewallet"
  | "bank_transfer"
  | "cash_drawer";

export interface Refund {
  id: string;
  return_id: string | null;
  reference: string;
  amount: Money;
  destination: RefundDestination;
  status: "pending" | "succeeded";
  reason: string;
  created_by: Ref;
  created_at: string;
}

export type ChangeCause = "buyer" | "staff" | "system" | "payment" | "shipping" | "agent";

export interface StatusChange {
  id: string;
  from: OrderStatus | null;
  to: OrderStatus;
  cause: ChangeCause;
  actor: Ref | null;
  reason: string | null;
  at: string;
  /** Dự kiến: lần chuyển này là hoàn tác lần trước. */
  undo: boolean;
}

export interface OrderNote {
  id: string;
  author: Ref;
  text: string;
  at: string;
}

export type PickupStatus = "preparing" | "ready" | "handed" | "expired_cancel";

/** Nhận tại cửa hàng (dự kiến, D-201). Mã nhận 6 số không bao giờ có ở đây: chỉ người mua nhận được. */
export interface Pickup {
  org_id: string;
  org_name: string;
  status: PickupStatus;
  ready_at: string | null;
  hold_until: string | null;
  proxy: { name: string; phone: string } | null;
  handed_at: string | null;
}

export interface Invoice {
  kind: "sales" | "cash_register";
  series: string;
  number: string;
  issued_at: string;
}

export interface Order {
  id: string;
  number: string;
  org_id: string;
  org_name: string;
  channel: Channel;
  /** Tài khoản kênh bán của đơn nhập từ kênh (đặc tả 45: `channel_account_id`; tên là dự kiến `include`). */
  channel_account: { id: string; name: string } | null;
  /** Mã đơn trên kênh (đặc tả 45: `external_ref`). */
  external_ref: string | null;
  seller: Seller | null;
  buyer: { name: string; phone: string; email: string | null };
  ship_to: { line: string; commune: string; province: string } | null;
  status: OrderStatus;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  payment_method: PaymentMethod;
  funds_flow: FundsFlow;
  /** Dòng tiền gộp để lọc (dự kiến tham số `flow`). */
  flow: Flow;
  subtotal: Money;
  discount: Money;
  shipping_fee: Money;
  shipping_discount: Money;
  tax: Money;
  total: Money;
  paid: Money;
  refunded: Money;
  payment_due_at: string | null;
  placed_at: string;
  confirmed_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  /** Dự kiến: hết hạn đổi trả (giao + số ngày của chính sách). */
  return_deadline_at: string | null;
  invoice: Invoice | null;
  pickup: Pickup | null;
  /** Ca thu ngân của đơn tại quầy. */
  shift_id: string | null;
  lines: OrderLine[];
  promotions: AppliedPromotion[];
  payments: OrderPayment[];
  refunds: Refund[];
  history: StatusChange[];
  notes: OrderNote[];
  updated_at: string;
}

export type ReturnStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "received"
  | "refunded"
  | "closed";
export type ReturnMethod = "pickup" | "drop_off" | "in_store";
/** Lý do trả và lý do từ chối là dữ liệu của chính sách theo nút (bộ mặc định, dự kiến). */
export const RETURN_REASONS = [
  "damaged_on_arrival",
  "wrong_item",
  "defective",
  "not_as_described",
  "changed_mind",
  "near_expiry",
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];
/** Lý do bắt buộc ảnh / video mở hộp (chính sách theo nút, dự kiến). */
export const MEDIA_REQUIRED_REASONS: readonly ReturnReason[] = ["damaged_on_arrival", "wrong_item"];
export const REJECT_REASONS = ["window_closed", "used", "not_covered"] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export interface ReturnLine {
  line_id: string;
  sku: string;
  name: string;
  quantity: number;
  amount: Money;
  condition: "restock" | "damaged" | null;
}

export interface ReturnMedia {
  id: string;
  kind: "image" | "video";
  name: string;
}

export interface AgentProposal {
  agent: string;
  amount: Money;
  expires_at: string;
  status: "pending" | "approved" | "rejected";
}

export interface OrderReturn {
  id: string;
  number: string;
  order_id: string;
  order_number: string;
  org_id: string;
  org_name: string;
  buyer_name: string;
  status: ReturnStatus;
  reason_code: ReturnReason;
  buyer_note: string;
  resolution: "refund" | "exchange";
  return_method: ReturnMethod;
  /** Nơi nhận hàng trả (cửa hàng / kho). */
  return_to: string;
  lines: ReturnLine[];
  refund_amount: Money;
  /** Dự kiến: ảnh, video mở hộp của người mua (module `media`). */
  media: ReturnMedia[];
  requested_at: string;
  /** Hạn trả lời yêu cầu (chính sách). */
  respond_by: string;
  /** Dự kiến: hết hạn đổi trả của đơn. */
  return_deadline_at: string;
  decided_by: Ref | null;
  decided_at: string | null;
  reject: { code: RejectReason; note: string } | null;
  proposal: AgentProposal | null;
  history: { at: string; event: string; by: string }[];
  updated_at: string;
}

export interface AbandonedCart {
  id: string;
  org_id: string;
  org_name: string;
  buyer_name: string;
  /** Liên hệ đã che (dữ liệu cá nhân). */
  contact: string | null;
  /** Người mua đã đồng ý nhận tin tiếp thị (bằng chứng ở `compliance`). */
  consent: boolean;
  lines: { sku: string; name: string; quantity: number }[];
  value: Money;
  abandoned_at: string;
  reminders_sent: number;
  /** Lần nhắc đã xếp lịch mà chưa gửi (Hoàn tác được tới lúc gửi). */
  reminder_scheduled_at: string | null;
}

/** View đã lưu của danh sách đơn (dự kiến, bước 52: bộ lọc lưu trên máy chủ). */
export interface OrderView {
  id: string;
  /** View của hệ thống dùng tên dịch theo `key`; view người dùng lưu dùng `name`. */
  key: string | null;
  name: string;
  query: string;
  scope: "system" | "node" | "personal";
  scope_org: string | null;
}

// ---------------------------------------------------------------- Đồ dùng chung

const uid = (kind: string, n: number) =>
  `01a1e000-0000-7000-8000-${kind}${String(n).padStart(10, "0")}`;

export const vnd = (amount: number): Money => ({
  amount: String(Math.round(amount)),
  currency: "VND",
});
export const num = (m: Money | null | undefined): number => (m ? Number(m.amount) : 0);

const SYSTEM: Ref = { id: "00000000-0000-7000-8000-000000000000", name: "Hệ thống" };
/** Người đang thao tác trên kho mẫu (hàm mẫu không biết ai đăng nhập). */
export const SAMPLE_ACTOR: Ref = { id: "01a1e000-0000-7000-8000-000000000f99", name: "Bạn" };
const MAI: Ref = { id: "01a1e000-0000-7000-8000-000000000f01", name: "Ngô Mai" };
const LAN: Ref = { id: "01a1e000-0000-7000-8000-000000000f12", name: "Lan Phạm" };
const KHAI: Ref = { id: "01a1e000-0000-7000-8000-000000000f13", name: "Đỗ Khải" };
/** Số điện thoại mẫu: không phải số thật. */
export const SAMPLE_PHONE = "0900000000";

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

const notFound = () => fail(404, "orders.order_not_found", "Order not found.");

/** 00:00 giờ Việt Nam của hôm nay. */
function today(): number {
  return Date.parse(`${vietnamDay()}T00:00:00+07:00`);
}

function slug(name: string): string {
  return fold(name)
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
}

/** Bộ sinh số cố định (mulberry32): cùng dãy mỗi lần khởi động. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- Tính tiền một giỏ (lúc đặt)

interface Priced {
  lines: OrderLine[];
  promotions: AppliedPromotion[];
  subtotal: number;
  discount: number;
  shipping_fee: number;
  shipping_discount: number;
  tax: number;
  total: number;
}

/**
 * Giá, giảm, thuế của một giỏ ở nút bán `orgId`, như checkout của đặc tả 45 tính ở máy chủ: giá từ
 * `catalog`, giảm từ `promotions` (chỉ cửa hàng; khuyến mại của người bán trên sàn là bước 46), thuế
 * GTGT theo thuế suất hiệu lực ngày đặt (giá đã gồm thuế: thuế = net × r / (100 + r)).
 */
export async function priceCart(
  orgId: string,
  items: readonly (readonly [string, number])[],
  codes: readonly string[],
  shippingFee: number,
  placedAt: number,
  lineSeed: string,
  /** Đơn nhập từ kênh: giá kênh theo liên kết của tài khoản, không áp khuyến mại của website. */
  channelAccountId: string | null = null,
): Promise<SampleOutcome<Priced>> {
  const { data: units } = await listUnits();
  const isStore =
    channelAccountId === null && units.some((u) => u.id === orgId && u.unit_type === "store");
  const found: { sku: string; variant_id: string; quantity: number }[] = [];
  for (const [sku, quantity] of items) {
    const { data } = await variantByCode(sku);
    if (!data) return invalid([fieldError("lines", "catalog.variant_not_found", sku)]);
    found.push({ sku: data.sku, variant_id: data.variant_id, quantity });
  }
  let discounts = new Map<string, LineDiscount[]>();
  let gifts: { variant_id: string; quantity: number; promotion_id: string }[] = [];
  let applied: AppliedPromotion[] = [];
  let shippingDiscount = 0;
  let lineKeys = new Map<string, string>();
  const units_ = new Map<string, number>();
  if (isStore) {
    const evaluated = await evaluateCart({
      org_id: orgId,
      lines: found.map((f) => `${f.sku} x ${f.quantity}`).join(", "),
      codes: codes.join(" "),
      customer_group: "",
      shipping_fee: String(shippingFee),
    });
    if (!evaluated.ok) return evaluated;
    const { cart, evaluation } = evaluated.data;
    lineKeys = new Map(cart.lines.map((l) => [l.variant_id, l.line_key]));
    // Giá khuyến mại đã tính trên đó: dùng đúng giá này cho dòng đơn để giảm và giá khớp nhau.
    for (const l of cart.lines) units_.set(l.variant_id, num(l.unit_price));
    const title = (id: string) =>
      evaluation.applied.find((a) => a.promotion_id === id)?.title ?? "";
    discounts = new Map();
    for (const d of evaluation.lines) {
      const list = discounts.get(d.line_key) ?? [];
      list.push({ promotion_id: d.promotion_id, title: title(d.promotion_id), amount: d.amount });
      discounts.set(d.line_key, list);
    }
    gifts = evaluation.gifts.map((g) => ({ ...g }));
    applied = evaluation.applied.map((a) => ({
      promotion_id: a.promotion_id,
      title: a.title,
      code: a.code,
      amount: a.amount,
    }));
    shippingDiscount = num(evaluation.shipping_discount);
    // Khoản giảm phí giao nằm ở `shipping_discount`; chương trình chỉ tặng quà ghi giá trị quà.
  }
  const ids = [...new Set([...found.map((f) => f.variant_id), ...gifts.map((g) => g.variant_id)])];
  const placed = new Date(placedAt).toISOString();
  const [prices, snaps, rates] = await Promise.all([
    pricesAt(orgId, ids, placed),
    variants(ids),
    listTaxRates(),
  ]);
  const day = vietnamDay(placedAt);
  if (channelAccountId) {
    // Giá kênh đã gồm thuế (đặc tả 48): tính từ giá bảng giá theo quy tắc của liên kết.
    for (const f of found) {
      const listing = liveListing(channelAccountId, f.sku);
      const web = num(prices.get(f.variant_id)?.price?.amount);
      if (listing && web > 0) units_.set(f.variant_id, channelPrice(listing.price_rule, web, day));
    }
  }
  const lines: OrderLine[] = [];
  const build = (
    variantId: string,
    quantity: number,
    lineDiscounts: LineDiscount[],
    gift: boolean,
  ): SampleOutcome<OrderLine> => {
    const snap = snaps.data.find((v) => v.variant_id === variantId);
    const price = prices.get(variantId)?.price?.amount;
    if (!snap || (!price && !units_.has(variantId))) {
      return invalid([fieldError("lines", "orders.variant_unavailable", snap?.sku ?? variantId)]);
    }
    const unit = gift ? num(price) : (units_.get(variantId) ?? num(price));
    const gross = unit * quantity;
    const discount = Math.min(
      gross,
      lineDiscounts.reduce((s, d) => s + num(d.amount), 0),
    );
    const net = gross - discount;
    const rate = snap.tax_category ? rateOn(rates.data, snap.tax_category, day) : null;
    const percent = rate ? Number(rate.rate_percent) : 0;
    const tax = Math.round((net * percent) / (100 + percent));
    return {
      ok: true,
      data: {
        id: `${lineSeed}-${lines.length + 1}`,
        variant_id: variantId,
        product_id: snap.product_id,
        sku: snap.sku,
        name: `${snap.name}${snap.variant_label ? ` ${snap.variant_label}` : ""}`,
        quantity,
        unit_price: vnd(unit),
        discount: vnd(discount),
        net: vnd(net),
        taxes: snap.tax_category
          ? [
              {
                tax_code: "vat",
                category: snap.tax_category,
                rate: (percent / 100).toFixed(2),
                base: vnd(net - tax),
                amount: vnd(tax),
              },
            ]
          : [],
        discounts: lineDiscounts,
        gift,
        returned_quantity: 0,
      },
    };
  };
  for (const f of found) {
    const key = lineKeys.get(f.variant_id) ?? "";
    const out = build(f.variant_id, f.quantity, discounts.get(key) ?? [], false);
    if (!out.ok) return out;
    lines.push(out.data);
  }
  for (const g of gifts) {
    const price = num(prices.get(g.variant_id)?.price?.amount);
    const promo = applied.find((a) => a.promotion_id === g.promotion_id);
    const out = build(
      g.variant_id,
      g.quantity,
      [
        {
          promotion_id: g.promotion_id,
          title: promo?.title ?? "",
          amount: vnd(price * g.quantity),
        },
      ],
      true,
    );
    if (!out.ok) return out;
    lines.push(out.data);
    if (promo) promo.amount = vnd(num(promo.amount) + price * g.quantity);
  }
  const subtotal = lines.reduce((s, l) => s + num(l.unit_price) * l.quantity, 0);
  const discount = lines.reduce((s, l) => s + num(l.discount), 0);
  const tax = lines.reduce((s, l) => s + l.taxes.reduce((t, x) => t + num(x.amount), 0), 0);
  return {
    ok: true,
    data: {
      lines,
      promotions: applied,
      subtotal,
      discount,
      shipping_fee: shippingFee,
      shipping_discount: shippingDiscount,
      tax,
      total: subtotal - discount + shippingFee - shippingDiscount,
    },
  };
}

// ---------------------------------------------------------------- Vòng đời và tiền của một đơn

// Người bán trên sàn, cùng tên với `market-data.ts` (màn Sàn). Đơn sinh thêm chỉ chọn trong ba người
// bán đầu (`FILLER_SELLERS`), để bộ sinh số giữ nguyên các đơn sinh khác.
const SELLERS = {
  na: { name: "Gia Dụng Nhà Na", kind: "household" },
  btx: { name: "Gốm Sứ Bát Tràng Xưa", kind: "enterprise" },
  bep: { name: "Bếp Nhà Thỏ", kind: "household" },
  khan: { name: "Khăn Bông Hạ Long", kind: "household" },
} as const satisfies Record<string, Seller>;
const FILLER_SELLERS: readonly Seller[] = [SELLERS.na, SELLERS.btx, SELLERS.bep];

const MARKET_NAME = "Chợ Bếp Mộc";

function partnerOf(method: PaymentMethod, flow: FundsFlow, orgName: string): string {
  if (flow === "channel_collect") return `Kênh bán thu hộ · ${orgName}`;
  if (flow === "partner_collect" && method !== "cod") return "Đối tác thu hộ của sàn (mẫu)";
  switch (method) {
    case "card":
      return "Cổng thanh toán (mẫu)";
    case "vietqr":
      return `VietQR · tài khoản ${orgName}`;
    case "ewallet":
      return "Ví điện tử qua cổng thanh toán (mẫu)";
    case "cod":
      return "Hãng vận chuyển thu hộ";
    case "cash":
      return `Két ${orgName}`;
    case "card_terminal":
      return `Máy POS thẻ ${orgName} (mẫu)`;
  }
}

function flowOf(method: PaymentMethod, funds: FundsFlow): Flow {
  if (method === "cod") return "cod";
  if (method === "cash") return "cash";
  return funds === "self_collect" ? "self" : "partner";
}

/** Tiền hoàn đi về đâu: luôn về đúng cách người mua đã trả, qua bên giữ dòng tiền. */
export function refundDestination(method: PaymentMethod): RefundDestination {
  switch (method) {
    case "card":
    case "card_terminal":
      return "card";
    case "vietqr":
      return "bank_account";
    case "ewallet":
      return "ewallet";
    case "cod":
      return "bank_transfer";
    case "cash":
      return "cash_drawer";
  }
}

function paymentStatusOf(o: Order): PaymentStatus {
  const paid = num(o.paid);
  const refunded = num(o.refunded);
  if (paid === 0) {
    if (o.payment_method === "cod" && !["cancelled", "completed", "delivered"].includes(o.status))
      return "cod_pending";
    return "unpaid";
  }
  if (refunded >= paid) return "refunded";
  if (refunded > 0) return "partially_refunded";
  return "paid";
}

function fulfillmentOf(o: Order): FulfillmentStatus {
  const bought = o.lines.reduce((s, l) => s + l.quantity, 0);
  const returned = o.lines.reduce((s, l) => s + l.returned_quantity, 0);
  if (returned > 0) return returned >= bought ? "returned" : "returned_partial";
  return ["delivered", "completed"].includes(o.status) ? "fulfilled" : "unfulfilled";
}

/** Tính lại các trường suy ra (tiền đã thu, trạng thái thanh toán…) sau mỗi lệnh ghi. */
function settle(o: Order, at: string): void {
  o.paid = vnd(
    o.payments
      .filter((p) => p.status === "succeeded" || p.status === "late")
      .reduce((s, p) => s + num(p.received ?? p.amount), 0),
  );
  o.refunded = vnd(
    o.refunds.filter((r) => r.status === "succeeded").reduce((s, r) => s + num(r.amount), 0),
  );
  o.payment_status = paymentStatusOf(o);
  o.fulfillment_status = fulfillmentOf(o);
  const when = (to: OrderStatus) => o.history.findLast((h) => h.to === to && !h.undo)?.at ?? null;
  o.confirmed_at = when("confirmed");
  o.delivered_at = ["delivered", "completed"].includes(o.status) ? when("delivered") : null;
  o.completed_at = o.status === "completed" ? when("completed") : null;
  o.cancelled_at = o.status === "cancelled" ? when("cancelled") : null;
  o.return_deadline_at = o.delivered_at
    ? new Date(Date.parse(o.delivered_at) + RETURN_WINDOW_DAYS * DAY).toISOString()
    : null;
  o.updated_at = at;
}

export interface JournalLine {
  /** Khoá tài khoản theo đặc tả 45 ("Chỗ dễ sai"); giao diện dịch ở `orders.accounts.*`. */
  account: string;
  /** Phần đuôi của khoá (cổng, hãng, cửa hàng…). */
  detail: string;
  side: "debit" | "credit";
  amount: Money;
}

export interface JournalEntry {
  reference: string;
  kind: "capture" | "deliver" | "refund";
  at: string;
  lines: JournalLine[];
}

/**
 * Bút toán sổ cái của một đơn theo chế độ dòng tiền (đặc tả 45, "Chỗ dễ sai"): thu tiền ghi "người mua
 * trả trước"; doanh thu và thuế đầu ra ghi khi giao, chỉ khi tự thu (đơn sàn do `marketplace` ghi phần
 * chia khi hoàn tất); hoàn tiền ghi bút toán đảo, không sửa bút toán cũ. Hàm thuần (test: nợ = có).
 */
export function ledgerOf(o: Order): JournalEntry[] {
  const out: JournalEntry[] = [];
  const holding = o.funds_flow === "partner_collect" ? "seller_prepayments" : "buyer_prepayments";
  const source = (() => {
    // Đơn nhập từ kênh: kênh thu (cả COD) rồi trả theo bảng kê — phải thu kênh (đặc tả 48).
    if (o.funds_flow === "channel_collect")
      return { account: "channel_receivable", detail: o.channel_account?.name ?? "" };
    if (o.payment_method === "cod") return { account: "cod_receivable", detail: "Hãng vận chuyển" };
    if (o.payment_method === "cash") return { account: "cash_drawer", detail: o.org_name };
    if (o.funds_flow === "partner_collect")
      return { account: "partner_clearing", detail: partnerOf(o.payment_method, o.funds_flow, "") };
    return {
      account: "payment_clearing",
      detail: partnerOf(o.payment_method, o.funds_flow, o.org_name),
    };
  })();
  const line = (account: string, detail: string, side: JournalLine["side"], amount: number) => ({
    account,
    detail,
    side,
    amount: vnd(amount),
  });
  for (const p of o.payments) {
    if (p.status !== "succeeded" && p.status !== "late") continue;
    const amount = num(p.received ?? p.amount);
    out.push({
      reference: `orders.capture:${o.number}:${p.id.slice(-4)}`,
      kind: "capture",
      at: p.succeeded_at ?? o.placed_at,
      lines: [
        line(source.account, source.detail, "debit", amount),
        line(holding, "", "credit", amount),
      ],
    });
  }
  const shippingNet = num(o.shipping_fee) - num(o.shipping_discount);
  const goods = num(o.total) - shippingNet;
  // Đơn kênh là hàng của chính cửa hàng bán qua kênh: ghi doanh thu như đơn web.
  const revenue = o.funds_flow !== "partner_collect" && o.delivered_at !== null;
  if (revenue && o.delivered_at) {
    const tax = num(o.tax);
    out.push({
      reference: `orders.deliver:${o.number}`,
      kind: "deliver",
      at: o.delivered_at,
      lines: [
        line("buyer_prepayments", "", "debit", num(o.total)),
        line("sales_revenue", o.org_name, "credit", goods - tax),
        line("vat_output", "", "credit", tax),
        ...(shippingNet > 0 ? [line("shipping_revenue", "", "credit", shippingNet)] : []),
      ],
    });
  }
  for (const r of o.refunds) {
    if (r.status !== "succeeded") continue;
    const amount = num(r.amount);
    const vat = revenue && goods > 0 ? Math.round((amount * num(o.tax)) / goods) : 0;
    const back =
      r.destination === "cash_drawer"
        ? { account: "cash_drawer", detail: o.org_name }
        : o.payment_method === "cod"
          ? { account: "payment_clearing", detail: "Chuyển khoản hoàn qua đối tác (mẫu)" }
          : source;
    out.push({
      reference: `orders.refund:${r.reference}`,
      kind: "refund",
      at: r.created_at,
      lines: revenue
        ? [
            line("sales_revenue", o.org_name, "debit", amount - vat),
            line("vat_output", "", "debit", vat),
            line(back.account, back.detail, "credit", amount),
          ]
        : [line(holding, "", "debit", amount), line(back.account, back.detail, "credit", amount)],
    });
  }
  return out;
}

// ---------------------------------------------------------------- Dựng đơn mẫu

type At = readonly [day: number, hour: number, minute: number];

interface OrderSeed {
  number: string;
  at: At | "recent";
  channel: Channel;
  buyer: string;
  items: readonly (readonly [SampleSku, number])[];
  codes?: readonly string[];
  method: PaymentMethod;
  fee: number;
  status: OrderStatus;
  seller?: Seller;
  pickup?: { status: PickupStatus; ready?: At; hold?: At; proxy?: string; code: string };
  /** Chuyển khoản tới lệch số tiền (đối soát ở Tài chính). */
  received?: number;
  /** Tiền tới sau khi đơn đã huỷ vì quá hạn: hệ thống tự hoàn (`late_payment`). */
  late?: boolean;
  note?: readonly [Ref, string];
  province?: "79" | "01";
}

// Đơn viết tay: mỗi mã của `order-refs.ts` một đơn. Món, cách trả, trạng thái khớp vận đơn (Vận
// chuyển), sổ cái và giao dịch ngân hàng (Tài chính), đổi trả và đánh giá (Cửa hàng).
const SEEDS: readonly OrderSeed[] = [
  {
    number: "BM-2611-0301",
    at: [-16, 9, 30],
    channel: "marketplace",
    buyer: "Phạm Gia Huy",
    items: [
      ["DB3", 1],
      ["BG6", 1],
    ],
    method: "ewallet",
    fee: 0,
    status: "completed",
    seller: SELLERS.na,
  },
  {
    number: "BM-2611-0317",
    at: [-26, 10, 0],
    channel: "web",
    buyer: "Hà Anh Thư",
    items: [["NRC750", 1]],
    method: "vietqr",
    fee: 30_000,
    status: "completed",
  },
  {
    number: "BM-2611-0331",
    at: [-19, 9, 0],
    channel: "web",
    buyer: "Tôn Đức Lộc",
    items: [["TG35", 1]],
    method: "cod",
    fee: 30_000,
    status: "completed",
  },
  {
    number: "BM-2611-0350",
    at: [-18, 11, 0],
    channel: "marketplace",
    buyer: "Châu Minh Quân",
    items: [["CG26", 1]],
    method: "ewallet",
    fee: 0,
    status: "completed",
    seller: SELLERS.na,
  },
  {
    number: "BM-2611-0352",
    at: [-17, 15, 0],
    channel: "web",
    buyer: "Lưu Bích Ngọc",
    items: [["CCD28", 1]],
    method: "cod",
    fee: 30_000,
    status: "completed",
  },
  {
    number: "BM-2611-0360",
    at: [-6, 15, 20],
    channel: "marketplace",
    buyer: "Tạ Minh Châu",
    items: [["NI20", 1]],
    method: "ewallet",
    fee: 0,
    status: "delivered",
    seller: SELLERS.na,
  },
  {
    number: "BM-2611-0362",
    at: [-15, 10, 0],
    channel: "web",
    buyer: "Quách Thu Hằng",
    items: [["NMC500", 1]],
    method: "cod",
    fee: 30_000,
    status: "shipping",
  },
  {
    number: "BM-2611-0367",
    at: [-14, 16, 0],
    channel: "web",
    buyer: "La Văn Tài",
    items: [["NRC750", 1]],
    method: "cod",
    fee: 30_000,
    status: "shipping",
  },
  {
    number: "BM-2611-0371",
    at: [-14, 18, 0],
    channel: "web",
    buyer: "Kha Ngọc Diệp",
    items: [["NI20", 1]],
    method: "card",
    fee: 30_000,
    status: "delivery_failed",
  },
  {
    number: "BM-2611-0379",
    at: [-13, 9, 0],
    channel: "web",
    buyer: "Mạc Thu Trang",
    items: [
      ["HT1L", 1],
      ["TG35", 1],
    ],
    method: "card",
    fee: 30_000,
    status: "delivered",
  },
  {
    number: "BM-2611-0380",
    at: [-13, 15, 0],
    channel: "web",
    buyer: "Đặng Thu Trang",
    items: [["HT1L", 1]],
    method: "vietqr",
    fee: 30_000,
    status: "completed",
  },
  {
    number: "BM-2611-0384",
    at: [-8, 10, 15],
    channel: "marketplace",
    buyer: "Đinh Thu Trang",
    items: [["BG6", 1]],
    method: "ewallet",
    fee: 30_000,
    status: "delivered",
    seller: SELLERS.btx,
  },
  {
    number: "BM-2611-0386",
    at: [-12, 10, 0],
    channel: "web",
    buyer: "Trịnh Quốc Bảo",
    items: [["DB3", 1]],
    method: "card",
    fee: 30_000,
    status: "delivered",
  },
  {
    number: "BM-2611-0388",
    at: [-11, 8, 0],
    channel: "web",
    buyer: "Ninh Hải Đăng",
    items: [["CG24", 1]],
    method: "cod",
    fee: 35_000,
    status: "completed",
    province: "01",
  },
  {
    number: "BM-2611-0390",
    at: [-10, 9, 0],
    channel: "marketplace",
    buyer: "Võ Ngọc Ánh",
    items: [["BG6", 1]],
    method: "cod",
    fee: 25_000,
    status: "completed",
    seller: SELLERS.btx as Seller,
  },
  {
    number: "BM-2611-0392",
    at: [-3, 15, 30],
    channel: "web",
    buyer: "Công ty TNHH Lá Chuối Xanh (mẫu)",
    items: [["DB3", 3]],
    method: "card",
    fee: 0,
    status: "delivered",
  },
  {
    number: "BM-2611-0393",
    at: [-12, 14, 0],
    channel: "marketplace",
    buyer: "Hoàng Văn Lộc",
    items: [["BG6", 4]],
    method: "ewallet",
    fee: 0,
    status: "completed",
    seller: SELLERS.btx,
  },
  {
    number: "BM-2611-0395",
    at: [-8, 10, 0],
    channel: "web",
    buyer: "Lâm Gia Hân",
    items: [["KB4-XA", 1]],
    method: "vietqr",
    fee: 30_000,
    status: "delivered",
  },
  {
    number: "BM-2611-0396",
    at: [-7, 9, 0],
    channel: "web",
    buyer: "Tạ Quang Vinh",
    items: [
      ["CG28", 1],
      ["DB3", 1],
    ],
    codes: ["BEPMOC10"],
    method: "cod",
    fee: 30_000,
    status: "delivered",
  },
  {
    number: "BM-2611-0398",
    at: [-6, 14, 0],
    channel: "web",
    buyer: "Lý Thanh Hà",
    items: [
      ["TG35", 1],
      ["KB4-XA", 1],
    ],
    method: "vietqr",
    fee: 30_000,
    status: "delivered",
  },
  {
    number: "BM-2611-0401",
    at: [-5, 8, 0],
    channel: "web",
    buyer: "Kiều Thanh An",
    items: [
      ["NI20", 1],
      ["KB4-XA", 1],
    ],
    method: "card",
    fee: 0,
    status: "preparing",
    province: "01",
    pickup: { status: "ready", ready: [-3, 17, 0], hold: [0, 20, 0], code: "530217" },
  },
  {
    number: "BM-2611-0402",
    at: [-3, 9, 40],
    channel: "marketplace",
    buyer: "Lâm Ngọc Diệp",
    items: [["KB4-XA", 3]],
    method: "ewallet",
    fee: 25_000,
    status: "delivered",
    seller: SELLERS.khan,
    province: "01",
  },
  {
    number: "BM-2611-0404",
    at: [-4, 11, 5],
    channel: "marketplace",
    buyer: "Quách Bảo Ngọc",
    items: [["BG6", 2]],
    method: "ewallet",
    fee: 0,
    status: "delivered",
    seller: SELLERS.btx,
  },
  {
    number: "BM-2611-0405",
    at: [-5, 9, 0],
    channel: "web",
    buyer: "Mai Văn Phúc",
    items: [["NI20", 1]],
    method: "vietqr",
    fee: 35_000,
    status: "cancelled",
    late: true,
    province: "01",
  },
  {
    number: "BM-2611-0406",
    at: [-5, 10, 0],
    channel: "web",
    buyer: "Ngô Thanh Tùng",
    items: [["HT1L", 2]],
    method: "ewallet",
    fee: 0,
    status: "preparing",
    pickup: {
      status: "ready",
      ready: [-1, 15, 0],
      hold: [2, 20, 0],
      proxy: "Ngô Thị Lan",
      code: "864102",
    },
  },
  {
    number: "BM-2611-0407",
    at: [-5, 11, 0],
    channel: "web",
    buyer: "Đỗ Minh Tâm",
    items: [["HT1L", 1]],
    method: "cod",
    fee: 30_000,
    status: "delivery_failed",
  },
  {
    number: "BM-2611-0408",
    at: [-4, 9, 0],
    channel: "web",
    buyer: "Vũ Thị Mai",
    items: [["CG26", 1]],
    method: "card",
    fee: 0,
    status: "preparing",
    pickup: { status: "preparing", code: "271946" },
  },
  {
    number: "BM-2611-0409",
    at: [-4, 16, 40],
    channel: "web",
    buyer: "Hồ Gia Bảo",
    items: [
      ["CG26", 1],
      ["NI20", 1],
    ],
    method: "card",
    fee: 35_000,
    status: "delivered",
    province: "01",
  },
  {
    number: "BM-2611-0410",
    at: [-3, 8, 10],
    channel: "web",
    buyer: "Trương Mỹ Linh",
    items: [["TG35", 1]],
    method: "vietqr",
    fee: 0,
    status: "preparing",
    pickup: { status: "ready", ready: [-1, 9, 30], hold: [2, 20, 0], code: "118054" },
  },
  {
    number: "BM-2611-0411",
    at: [-3, 12, 0],
    channel: "web",
    buyer: "Bùi Hải Yến",
    items: [["HT1L", 2]],
    method: "vietqr",
    fee: 30_000,
    status: "pending_payment",
    received: 600_000,
  },
  {
    number: "BM-2611-0412",
    at: [-2, 8, 0],
    channel: "web",
    buyer: "Nguyễn Thị Hoa",
    items: [
      ["DB3", 1],
      ["BG6", 1],
    ],
    method: "vietqr",
    fee: 30_000,
    status: "preparing",
  },
  {
    number: "BM-2611-0413",
    at: [-2, 9, 0],
    channel: "marketplace",
    buyer: "Võ Ngọc Ánh",
    items: [["BG6", 1]],
    method: "cod",
    fee: 25_000,
    status: "awaiting_acceptance",
    seller: SELLERS.btx as Seller,
  },
  {
    number: "BM-2611-0414",
    at: [-2, 9, 58],
    channel: "web",
    buyer: "Phạm Quốc Huy",
    items: [
      ["CG26", 2],
      ["DB3", 1],
    ],
    codes: ["BEPMOC10"],
    method: "card",
    fee: 30_000,
    status: "shipping",
  },
  {
    number: "BM-2611-0415",
    at: [-2, 10, 12],
    channel: "web",
    buyer: "Lê Thu Trang",
    items: [
      ["BG6", 1],
      ["KB4-XA", 2],
    ],
    method: "cod",
    fee: 35_000,
    status: "preparing",
    province: "01",
    note: [MAI, "Khách dặn gọi trước 30 phút, giao giờ hành chính."],
  },
  {
    number: "BM-2611-0416",
    at: [-2, 10, 31],
    channel: "pos",
    buyer: "Khách tại quầy",
    items: [
      ["DB3", 1],
      ["NI20", 2],
    ],
    method: "cash",
    fee: 0,
    status: "delivered",
  },
  {
    number: "BM-2611-0417",
    at: [-2, 10, 47],
    channel: "marketplace",
    buyer: "Trần Minh Khoa",
    items: [
      ["HT1L", 1],
      ["KB4-BE", 1],
    ],
    method: "ewallet",
    fee: 25_000,
    status: "preparing",
    seller: SELLERS.na,
    province: "01",
  },
  {
    number: "BM-2611-0418",
    at: [-1, 10, 52],
    channel: "web",
    buyer: "Đặng Văn Long",
    items: [["CCD28", 1]],
    method: "vietqr",
    fee: 30_000,
    status: "shipping",
  },
  {
    number: "BM-2611-0419",
    at: "recent",
    channel: "web",
    buyer: "Phan Ngọc Châu",
    items: [["HT1L", 1]],
    method: "vietqr",
    fee: 0,
    status: "pending_payment",
    pickup: { status: "preparing", code: "640385" },
  },
];

const FIRST_NUMBER = 8;
/**
 * Mã từng là đơn sinh, sau được viết tay để khớp màn Sàn và hoá đơn (W-021). Bộ sinh vẫn rút số ngẫu
 * nhiên cho các mã này rồi bỏ đơn sinh, nên mọi đơn sinh khác (và số liệu dựa trên chúng) không đổi.
 */
const REPLACED_FILLERS = new Set([301, 360, 384, 392, 393, 402, 404]);
const LAST_NUMBER = 419;
/** Số đơn "chờ xử lý" của bản thiết kế. */
const PENDING_TARGET = 37;

const FIRST_NAMES = [
  "An",
  "Bình",
  "Chi",
  "Dũng",
  "Giang",
  "Hạnh",
  "Hiếu",
  "Khánh",
  "Linh",
  "Minh",
  "Nga",
  "Phong",
  "Quyên",
  "Sơn",
  "Thảo",
  "Trung",
  "Uyên",
  "Vy",
  "Yến",
  "Tâm",
];
const LAST_NAMES = [
  "Nguyễn",
  "Trần",
  "Lê",
  "Phạm",
  "Hoàng",
  "Vũ",
  "Đặng",
  "Bùi",
  "Đỗ",
  "Hồ",
  "Ngô",
  "Dương",
];
const MIDDLE = ["Văn", "Thị", "Minh", "Ngọc", "Thanh", "Quốc", "Gia", "Hải"];
const FILLER_SKUS: readonly SampleSku[] = [
  "CG24",
  "CG26",
  "CG28",
  "NI20",
  "DB3",
  "TG35",
  "HT1L",
  "BG6",
  "KB4-XA",
  "KB4-BE",
  "NRC750",
  "NMC500",
  "CCD28",
  "MT200",
  "TG25",
  "TGT30",
];

export const numberOf = (n: number) => `BM-2611-${String(n).padStart(4, "0")}`;
const seqOf = (number: string) => Number(number.slice(-4));

/** Ca thu ngân của một cửa hàng trong một ngày (giờ Việt Nam): ID cố định để đơn tại quầy trỏ tới. */
export function shiftIdFor(orgId: string, day: string): string {
  return `${orgId.slice(-3)}-${day}`;
}

interface Built {
  status: OrderStatus;
  history: StatusChange[];
  paidAt: string | null;
}

/**
 * Lịch sử trạng thái theo đường đi chuẩn của bảng chuyển, từ lúc đặt tới trạng thái cuối. Mốc thời gian
 * không vượt quá hiện tại.
 */
function lifecycle(
  seq: number,
  placed: number,
  status: OrderStatus,
  method: PaymentMethod,
  channel: Channel,
  pickup: boolean,
  seller: Seller | null,
): Built {
  const now = Date.now() - MINUTE;
  const history: StatusChange[] = [];
  let at = placed;
  let current: OrderStatus | null = null;
  const push = (
    to: OrderStatus,
    cause: ChangeCause,
    after: number,
    actor: Ref | null = null,
    reason: string | null = null,
  ) => {
    at = Math.min(Math.max(at + after, at + 1000), now);
    history.push({
      id: `${seq}-${history.length + 1}`,
      from: current,
      to,
      cause,
      actor,
      reason,
      at: new Date(at).toISOString(),
      undo: false,
    });
    current = to;
  };
  const prepaid = ["card", "vietqr", "ewallet"].includes(method);
  // Nút có chính sách "nhận đơn" (sàn; cửa hàng đặt `acceptance_hours > 0`): chờ xác nhận trước.
  const accept = seller !== null || status === "awaiting_acceptance";
  let paidAt: string | null = null;
  if (prepaid) {
    push("pending_payment", "buyer", 0, null);
    at = placed;
    if (status === "pending_payment") return { status, history, paidAt };
    if (status === "cancelled") {
      push("cancelled", "system", DAY, SYSTEM, "payment_expired");
      return { status, history, paidAt };
    }
    paidAt = new Date(Math.min(placed + 2 * MINUTE, now)).toISOString();
    push(accept ? "awaiting_acceptance" : "confirmed", "payment", 2 * MINUTE);
  } else {
    push(accept ? "awaiting_acceptance" : "confirmed", "buyer", 0);
    if (method === "cash" || method === "card_terminal") paidAt = history[0]?.at ?? null;
  }
  if (status === "awaiting_acceptance") return { status, history, paidAt };
  if (accept)
    push("confirmed", "staff", 30 * MINUTE, seller ? { id: "seller", name: seller.name } : KHAI);
  if (status === "cancelled") {
    push("cancelled", "buyer", 2 * HOUR, null, "buyer_changed_mind");
    return { status, history, paidAt };
  }
  if (channel === "pos") {
    push("delivered", "staff", 0, KHAI);
    if (status === "completed") push("completed", "system", RETURN_WINDOW_DAYS * DAY, SYSTEM);
    return { status, history, paidAt };
  }
  if (status === "confirmed") return { status, history, paidAt };
  push("preparing", "staff", 40 * MINUTE, KHAI);
  if (status === "preparing") return { status, history, paidAt };
  if (pickup) {
    push("delivered", "staff", DAY, KHAI);
  } else {
    push("shipping", "shipping", DAY);
    if (status === "shipping") return { status, history, paidAt };
    if (status === "delivery_failed") {
      push("delivery_failed", "shipping", 2 * DAY);
      return { status, history, paidAt };
    }
    push("delivered", "shipping", DAY + 3 * HOUR);
  }
  if (method === "cod") paidAt = history.at(-1)?.at ?? null;
  if (status === "completed") push("completed", "system", RETURN_WINDOW_DAYS * DAY, SYSTEM);
  return { status, history, paidAt };
}

interface Store {
  orders: Order[];
  /** Mã nhận tại cửa hàng theo ID đơn — chỉ người mua nhận được; API không bao giờ trả về. */
  pickupCodes: Map<string, string>;
  returns: OrderReturn[];
  carts: AbandonedCart[];
  views: OrderView[];
  invoiceSeq: { sales: number; cash_register: number };
  seq: number;
}

async function makeOrder(
  s: Pick<Store, "invoiceSeq">,
  input: {
    number: string;
    org_id: string;
    org_name: string;
    channel: Channel;
    seller: Seller | null;
    buyer: string;
    items: readonly (readonly [string, number])[];
    codes: readonly string[];
    method: PaymentMethod;
    fee: number;
    status: OrderStatus;
    placed: number;
    pickup: OrderSeed["pickup"] | null;
    province: "79" | "01";
    received?: number;
    late?: boolean;
    /** Đơn nhập từ kênh bán (`OrderIntake::import` của đặc tả 48). */
    account?: AccountSeed;
  },
): Promise<SampleOutcome<Order>> {
  const seq = seqOf(input.number);
  const priced = await priceCart(
    input.org_id,
    input.items,
    input.codes,
    input.fee,
    input.placed,
    `ol${seq}`,
    input.account?.id ?? null,
  );
  if (!priced.ok) return priced;
  const p = priced.data;
  const funds: FundsFlow = input.account
    ? "channel_collect"
    : input.channel === "marketplace"
      ? "partner_collect"
      : "self_collect";
  const built = lifecycle(
    seq,
    input.placed,
    input.status,
    input.method,
    input.channel,
    input.pickup !== null && input.pickup !== undefined,
    input.seller,
  );
  const placedIso = new Date(input.placed).toISOString();
  const payments: OrderPayment[] = [];
  const partner = partnerOf(input.method, funds, input.account?.name ?? input.org_name);
  const reference = `pay-${input.number}`;
  if (input.late) {
    payments.push({
      id: uid("71", seq),
      method: input.method,
      partner,
      reference,
      amount: vnd(p.total),
      received: vnd(p.total),
      status: "late",
      succeeded_at: new Date(
        Math.min(input.placed + DAY + 22 * HOUR, Date.now() - HOUR),
      ).toISOString(),
    });
  } else if (input.received !== undefined) {
    payments.push({
      id: uid("71", seq),
      method: input.method,
      partner,
      reference,
      amount: vnd(p.total),
      received: vnd(input.received),
      status: "needs_review",
      succeeded_at: null,
    });
  } else if (built.paidAt) {
    payments.push({
      id: uid("71", seq),
      method: input.method,
      partner,
      reference,
      amount: vnd(p.total),
      received: null,
      status: "succeeded",
      succeeded_at: built.paidAt,
    });
  } else if (input.status === "pending_payment") {
    payments.push({
      id: uid("71", seq),
      method: input.method,
      partner,
      reference,
      amount: vnd(p.total),
      received: null,
      status: "pending",
      succeeded_at: null,
    });
  } else if (input.status === "cancelled" && input.method !== "cod") {
    payments.push({
      id: uid("71", seq),
      method: input.method,
      partner,
      reference,
      amount: vnd(p.total),
      received: null,
      status: "expired",
      succeeded_at: null,
    });
  }
  const refunds: Refund[] = [];
  if (input.late) {
    const at = new Date(
      Math.min(Date.parse(payments[0]?.succeeded_at ?? placedIso) + 5 * MINUTE, Date.now()),
    ).toISOString();
    refunds.push({
      id: uid("72", seq),
      return_id: null,
      reference: `late_payment:${input.number}`,
      amount: vnd(p.total),
      destination: refundDestination(input.method),
      status: "succeeded",
      reason: "late_payment",
      created_by: SYSTEM,
      created_at: at,
    });
  }
  const pickup: Pickup | null = input.pickup
    ? {
        org_id: input.org_id,
        org_name: input.org_name,
        status: input.pickup.status,
        ready_at: input.pickup.ready ? at3(input.pickup.ready) : null,
        hold_until: input.pickup.hold ? at3(input.pickup.hold) : null,
        proxy: input.pickup.proxy ? { name: input.pickup.proxy, phone: SAMPLE_PHONE } : null,
        handed_at: null,
      }
    : null;
  const order: Order = {
    id: orderByNumber(input.number)?.id ?? uid("70", seq),
    number: input.number,
    org_id: input.org_id,
    org_name: input.channel === "marketplace" ? MARKET_NAME : input.org_name,
    channel: input.channel,
    channel_account: input.account ? { id: input.account.id, name: input.account.name } : null,
    external_ref: input.account
      ? externalRef(input.account.kind, seq, vietnamDay(input.placed))
      : null,
    seller: input.seller,
    buyer: {
      name: input.buyer,
      phone: SAMPLE_PHONE,
      email: input.channel === "pos" ? null : `${slug(input.buyer) || "khach"}@example.com`,
    },
    ship_to:
      input.channel === "pos" || pickup
        ? null
        : input.province === "01"
          ? { line: `${seq} phố Mẫu`, commune: "Phường Cầu Giấy", province: "Hà Nội" }
          : { line: `${seq} đường Mẫu`, commune: "Phường Xuân Hoà", province: "TP. Hồ Chí Minh" },
    status: built.status,
    payment_status: "unpaid",
    fulfillment_status: "unfulfilled",
    payment_method: input.method,
    funds_flow: funds,
    flow: flowOf(input.method, funds),
    subtotal: vnd(p.subtotal),
    discount: vnd(p.discount),
    shipping_fee: vnd(p.shipping_fee),
    shipping_discount: vnd(p.shipping_discount),
    tax: vnd(p.tax),
    total: vnd(p.total),
    paid: vnd(0),
    refunded: vnd(0),
    payment_due_at:
      input.status === "pending_payment"
        ? new Date(input.placed + (input.method === "vietqr" ? DAY : 30 * MINUTE)).toISOString()
        : null,
    placed_at: placedIso,
    confirmed_at: null,
    delivered_at: null,
    completed_at: null,
    cancelled_at: null,
    cancel_reason: built.history.findLast((h) => h.to === "cancelled")?.reason ?? null,
    return_deadline_at: null,
    invoice: null,
    pickup,
    shift_id: input.channel === "pos" ? shiftIdFor(input.org_id, vietnamDay(input.placed)) : null,
    lines: p.lines,
    promotions: p.promotions,
    payments,
    refunds,
    history: built.history,
    notes: [],
    updated_at: built.history.at(-1)?.at ?? placedIso,
  };
  if (input.status === "pending_payment" && seqOf(input.number) === LAST_NUMBER) {
    // Đơn mới nhất: hạn thanh toán VietQR còn ít phút (màn Tài chính hiện "đang chờ").
    order.payment_due_at = new Date(Date.now() + 25 * MINUTE).toISOString();
  }
  settle(order, order.updated_at);
  issueInvoice(s, order);
  return { ok: true, data: order };
}

function at3([d, h, m]: At): string {
  return new Date(today() + d * DAY + h * HOUR + m * MINUTE).toISOString();
}

/** Hoá đơn điện tử lập khi giao (web) hay từ máy tính tiền (quầy); đơn sàn do người bán lập. */
function issueInvoice(s: Pick<Store, "invoiceSeq">, o: Order): void {
  if (o.invoice || !o.delivered_at || o.channel === "marketplace") return;
  const kind = o.channel === "pos" ? "cash_register" : "sales";
  s.invoiceSeq[kind] += 1;
  o.invoice = {
    kind,
    series: kind === "cash_register" ? "1C26MBM" : "1C26TBM",
    number: String(s.invoiceSeq[kind]).padStart(8, "0"),
    issued_at: o.delivered_at,
  };
}

async function seedOrders(s: Pick<Store, "invoiceSeq" | "pickupCodes">): Promise<Order[]> {
  const { data: units } = await listUnits();
  const name = (id: string) => units.find((u) => u.id === id)?.name ?? id;
  const ref = (number: string) => {
    const found = ORDER_REFS.find((r) => r.number === number);
    if (!found) throw new Error(`Thiếu ${number} trong order-refs.ts`);
    return found;
  };
  const anchors = new Map<number, number>();
  const recent = Date.now() - 2 * HOUR;
  for (const seed of SEEDS)
    anchors.set(seqOf(seed.number), seed.at === "recent" ? recent : Date.parse(at3(seed.at)));
  // Đơn đầu tiên của cửa sổ 30 ngày: vừa trong hạn (giờ tính theo lúc khởi động).
  anchors.set(FIRST_NUMBER - 1, Date.now() - 29 * DAY - 12 * HOUR);
  const keys = [...anchors.keys()].sort((a, b) => a - b);
  /** Giờ đặt của một số đơn: nội suy giữa hai đơn viết tay gần nhất (số tăng theo thời gian). */
  const placedOf = (n: number): number => {
    const own = anchors.get(n);
    if (own !== undefined) return own;
    const before = keys.filter((k) => k < n).at(-1) ?? keys[0] ?? n;
    const after = keys.find((k) => k > n) ?? before;
    const a = anchors.get(before) ?? recent;
    const b = anchors.get(after) ?? recent;
    return Math.round(a + ((b - a) * (n - before)) / Math.max(1, after - before));
  };
  const orders: Order[] = [];
  for (const seed of SEEDS) {
    const r = ref(seed.number);
    const made = await makeOrder(s, {
      number: seed.number,
      org_id: r.org_id,
      org_name: name(r.org_id),
      channel: seed.channel,
      seller: seed.seller ?? null,
      buyer: seed.buyer,
      items: seed.items,
      codes: seed.codes ?? [],
      method: seed.method,
      fee: seed.fee,
      status: seed.status,
      placed: placedOf(seqOf(seed.number)),
      pickup: seed.pickup ?? null,
      province: seed.province ?? "79",
      ...(seed.received !== undefined ? { received: seed.received } : {}),
      ...(seed.late ? { late: true } : {}),
    });
    if (!made.ok) throw new Error(`Không dựng được ${seed.number}: ${made.problem.code}`);
    if (seed.pickup) s.pickupCodes.set(made.data.id, seed.pickup.code);
    if (seed.note) {
      made.data.notes.push({
        id: `${made.data.id}-n1`,
        author: seed.note[0],
        text: seed.note[1],
        at: made.data.placed_at,
      });
    }
    orders.push(made.data);
  }
  // Đơn sinh: mọi số còn lại trong 30 ngày.
  const explicit = new Set(SEEDS.map((x) => seqOf(x.number)));
  const rand = random(45);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;
  const stores = [ORG.Q3, ORG.TD, ORG.CG] as const;
  const plans: {
    n: number;
    placed: number;
    channel: Channel;
    org: string;
    seller: Seller | null;
    method: PaymentMethod;
    items: [SampleSku, number][];
    buyer: string;
    status: OrderStatus;
    account?: AccountSeed;
  }[] = [];
  for (let n = FIRST_NUMBER; n <= LAST_NUMBER; n += 1) {
    if (explicit.has(n) && !REPLACED_FILLERS.has(n)) continue;
    const placed = placedOf(n);
    const roll = rand();
    const channel: Channel = roll < 0.22 ? "marketplace" : roll < 0.42 ? "pos" : "web";
    const org = channel === "marketplace" ? ORG.ROOT : pick(stores);
    const seller = channel === "marketplace" ? (pick(FILLER_SELLERS) as Seller) : null;
    const method: PaymentMethod =
      channel === "pos"
        ? pick(["cash", "cash", "card_terminal", "vietqr"] as const)
        : channel === "marketplace"
          ? pick(["ewallet", "ewallet", "cod"] as const)
          : pick(["card", "vietqr", "vietqr", "cod"] as const);
    const count = rand() < 0.7 ? 1 : 2;
    const items: [SampleSku, number][] = [];
    while (items.length < count) {
      const sku = pick(FILLER_SKUS);
      if (!items.some(([s2]) => s2 === sku)) items.push([sku, 1]);
    }
    const age = (Date.now() - placed) / DAY;
    const r2 = rand();
    let status: OrderStatus;
    if (channel === "pos") status = age > RETURN_WINDOW_DAYS + 0.5 ? "completed" : "delivered";
    else if (age > 10) status = r2 < 0.06 ? "cancelled" : "completed";
    else if (age > 3)
      status =
        r2 < 0.05
          ? "cancelled"
          : r2 < 0.08
            ? "delivery_failed"
            : age > 8
              ? "completed"
              : "delivered";
    else status = "shipping";
    const buyer =
      channel === "pos" && rand() < 0.7
        ? "Khách tại quầy"
        : `${pick(LAST_NAMES)} ${pick(MIDDLE)} ${pick(FIRST_NAMES)}`;
    // Mã nay đã viết tay (`REPLACED_FILLERS`): vẫn rút đủ số ngẫu nhiên như trước rồi bỏ, để các đơn
    // sinh sau giữ nguyên.
    if (explicit.has(n)) continue;
    plans.push({ n, placed, channel, org, seller, method, items, buyer, status });
  }
  // Đơn nhập từ kênh bán (W-019): một phần đơn web của cửa hàng có tài khoản kênh. Chỉ đổi kênh, cách
  // trả và phí của đơn đó; không gọi thêm bộ sinh số, nên các đơn sinh khác giữ nguyên.
  for (const plan of plans) {
    if (plan.channel !== "web") continue;
    const account = channelForGenerated(
      plan.n,
      plan.org,
      plan.placed,
      plan.items.map(([sku]) => sku),
    );
    if (!account) continue;
    plan.channel = account.kind as Channel;
    plan.account = account;
    plan.method = plan.method === "cod" ? "cod" : "ewallet";
  }
  // "Chờ xử lý" = 37: đơn viết tay đang chờ cộng các đơn sinh gần nhất (không phải tại quầy).
  const explicitPending = SEEDS.filter((x) => PENDING_STATUSES.includes(x.status)).length;
  let need = PENDING_TARGET - explicitPending;
  for (const plan of [...plans].reverse()) {
    if (need <= 0) break;
    if (plan.channel === "pos") continue;
    plan.status =
      plan.channel === "marketplace"
        ? "awaiting_acceptance"
        : need % 3 === 0
          ? "confirmed"
          : need % 3 === 1
            ? "preparing"
            : "awaiting_acceptance";
    need -= 1;
  }
  for (const plan of plans) {
    const made = await makeOrder(s, {
      number: numberOf(plan.n),
      org_id: plan.org,
      org_name: name(plan.org),
      channel: plan.channel,
      seller: plan.seller,
      buyer: plan.buyer,
      items: plan.items,
      codes: [],
      method: plan.method,
      fee:
        plan.channel === "pos"
          ? 0
          : plan.channel === "marketplace"
            ? 25_000
            : plan.org === ORG.CG
              ? 35_000
              : 30_000,
      status: plan.status,
      placed: plan.placed,
      pickup: null,
      province: plan.org === ORG.CG ? "01" : "79",
      ...(plan.account ? { account: plan.account } : {}),
    });
    if (!made.ok) throw new Error(`Không dựng được ${numberOf(plan.n)}: ${made.problem.code}`);
    // Đơn chờ nhận ở cửa hàng có chính sách "cửa hàng nhận đơn" (acceptance_hours > 0).
    orders.push(made.data);
  }
  return orders.sort(
    (a, b) => b.placed_at.localeCompare(a.placed_at) || b.number.localeCompare(a.number),
  );
}

function seedReturns(orders: readonly Order[]): OrderReturn[] {
  const byNumber = (n: string) => {
    const o = orders.find((x) => x.number === n);
    if (!o) throw new Error(`Thiếu đơn ${n}`);
    return o;
  };
  const lineOf = (
    o: Order,
    sku: string,
    quantity = 1,
    condition: ReturnLine["condition"] = null,
  ): ReturnLine => {
    const l = o.lines.find((x) => x.sku === sku);
    if (!l) throw new Error(`Đơn ${o.number} không có ${sku}`);
    return {
      line_id: l.id,
      sku,
      name: l.name,
      quantity,
      amount: vnd(Math.round((num(l.net) / l.quantity) * quantity)),
      condition,
    };
  };
  const make = (
    n: number,
    number: string,
    status: ReturnStatus,
    reason: ReturnReason,
    note: string,
    method: ReturnMethod,
    returnTo: string,
    lines: ReturnLine[],
    extra: Partial<OrderReturn> & { requested: number; resolution?: "refund" | "exchange" },
  ): OrderReturn => {
    const o = byNumber(number);
    const requested = new Date(
      Math.min(Date.parse(o.delivered_at ?? o.placed_at) + extra.requested, Date.now() - 2 * HOUR),
    ).toISOString();
    const r: OrderReturn = {
      id: uid("73", n),
      number: `TH-2611-${String(n).padStart(4, "0")}`,
      order_id: o.id,
      order_number: o.number,
      org_id: o.org_id,
      org_name: o.org_name,
      buyer_name: o.buyer.name,
      status,
      reason_code: reason,
      buyer_note: note,
      resolution: extra.resolution ?? "refund",
      return_method: method,
      return_to: returnTo,
      lines,
      refund_amount: vnd(lines.reduce((s2, l) => s2 + num(l.amount), 0)),
      media: extra.media ?? [],
      requested_at: requested,
      respond_by: new Date(Date.parse(requested) + 2 * DAY).toISOString(),
      return_deadline_at: o.return_deadline_at ?? requested,
      decided_by: extra.decided_by ?? null,
      decided_at: extra.decided_at ?? null,
      reject: extra.reject ?? null,
      proposal: extra.proposal ?? null,
      history: [{ at: requested, event: "requested", by: o.buyer.name }],
      updated_at: requested,
    };
    return r;
  };
  const o409 = byNumber("BM-2611-0409");
  const now = Date.now();
  const iso = (t: number) => new Date(t).toISOString();
  const list = [
    make(
      21,
      "BM-2611-0409",
      "requested",
      "damaged_on_arrival",
      "Chảo nứt ở quai khi nhận, kèm ảnh và video mở hộp.",
      "pickup",
      o409.org_name,
      [lineOf(o409, "CG26")],
      {
        requested: 22 * HOUR,
        media: [
          { id: uid("74", 1), kind: "image", name: "chao-nut-quai-1.jpg" },
          { id: uid("74", 2), kind: "image", name: "chao-nut-quai-2.jpg" },
          { id: uid("74", 3), kind: "video", name: "mo-hop.mp4" },
        ],
        proposal: {
          agent: "cskh-bot",
          amount: vnd(690_000),
          expires_at: iso(now + 23 * HOUR),
          status: "pending",
        },
      },
    ),
    make(
      22,
      "BM-2611-0395",
      "requested",
      "wrong_item",
      "Giao màu xanh, tôi đặt màu be.",
      "in_store",
      "CN Quận 3",
      [lineOf(byNumber("BM-2611-0395"), "KB4-XA")],
      {
        requested: 2 * DAY,
        resolution: "exchange",
        media: [{ id: uid("74", 4), kind: "image", name: "khan-sai-mau.jpg" }],
      },
    ),
    make(
      19,
      "BM-2611-0386",
      "approved",
      "defective",
      "Lưỡi dao bị mẻ sau lần dùng đầu.",
      "drop_off",
      "Kho Thủ Đức",
      [lineOf(byNumber("BM-2611-0386"), "DB3")],
      {
        requested: 3 * DAY,
        decided_by: LAN,
        decided_at: iso(now - 4 * DAY),
      },
    ),
    make(
      18,
      "BM-2611-0379",
      "received",
      "changed_mind",
      "Không vừa nhu cầu.",
      "pickup",
      "CN Quận 3",
      [
        lineOf(byNumber("BM-2611-0379"), "HT1L", 1, "restock"),
        lineOf(byNumber("BM-2611-0379"), "TG35", 1, "damaged"),
      ],
      {
        requested: 2 * DAY,
        decided_by: LAN,
        decided_at: iso(now - 6 * DAY),
      },
    ),
    make(
      15,
      "BM-2611-0352",
      "refunded",
      "defective",
      "Mặt chống dính bị trầy khi nhận.",
      "in_store",
      "CN Thủ Đức",
      [lineOf(byNumber("BM-2611-0352"), "CCD28", 1, "damaged")],
      {
        requested: DAY,
        decided_by: LAN,
        decided_at: iso(now - 14 * DAY),
      },
    ),
    make(
      9,
      "BM-2611-0317",
      "closed",
      "near_expiry",
      "Hạn sử dụng còn dưới 1 tháng.",
      "in_store",
      "CN Quận 3",
      [lineOf(byNumber("BM-2611-0317"), "NRC750", 1, "damaged")],
      {
        requested: DAY,
        decided_by: LAN,
        decided_at: iso(now - 20 * DAY),
      },
    ),
    make(
      12,
      "BM-2611-0331",
      "rejected",
      "changed_mind",
      "Đổi ý, không dùng tới.",
      "pickup",
      "CN Quận 3",
      [lineOf(byNumber("BM-2611-0331"), "TG35")],
      {
        requested: 9 * DAY,
        decided_by: LAN,
        decided_at: iso(now - 2 * DAY),
        reject: { code: "window_closed", note: "Quá hạn đổi trả 7 ngày kể từ khi giao." },
      },
    ),
    make(
      23,
      "BM-2611-0416",
      "requested",
      "defective",
      "Lưỡi dao mẻ, xin đổi bộ khác tại quầy.",
      "in_store",
      "CN Thủ Đức",
      [lineOf(byNumber("BM-2611-0416"), "DB3")],
      {
        requested: 6 * HOUR,
        resolution: "exchange",
      },
    ),
  ];
  for (const r of list) {
    if (r.status !== "requested")
      r.history.push({
        at: r.decided_at ?? r.requested_at,
        event: r.status === "rejected" ? "rejected" : "approved",
        by: r.decided_by?.name ?? "",
      });
    if (r.proposal)
      r.history.push({
        at: iso(Date.parse(r.requested_at) + 2 * MINUTE),
        event: "proposal",
        by: r.proposal.agent,
      });
    const o = byNumber(r.order_number);
    if (["received", "refunded", "closed"].includes(r.status)) {
      r.history.push({ at: r.decided_at ?? r.requested_at, event: "received", by: KHAI.name });
      for (const l of r.lines) {
        const line = o.lines.find((x) => x.id === l.line_id);
        if (line) line.returned_quantity += l.quantity;
      }
    }
    if (["refunded", "closed"].includes(r.status)) {
      const at = r.decided_at ?? r.requested_at;
      o.refunds.push({
        id: uid("72", 100 + seqOf(r.number)),
        return_id: r.id,
        reference: `return:${r.number}`,
        amount: r.refund_amount,
        destination: refundDestination(o.payment_method),
        status: "succeeded",
        reason: "return",
        created_by: LAN,
        created_at: at,
      });
      r.history.push({ at, event: "refunded", by: LAN.name });
      settle(o, o.updated_at);
    }
    if (r.status === "closed")
      r.history.push({ at: r.decided_at ?? r.requested_at, event: "closed", by: LAN.name });
    r.updated_at = r.history.at(-1)?.at ?? r.requested_at;
  }
  return list.sort((a, b) => b.requested_at.localeCompare(a.requested_at));
}

async function seedCarts(): Promise<AbandonedCart[]> {
  const seeds: [
    number,
    string,
    string | null,
    boolean,
    [SampleSku, number][],
    number,
    number,
    string,
  ][] = [
    [
      1,
      "Nguyễn Hải Đăng",
      "09•• ••• 218 (mẫu)",
      true,
      [
        ["DB3", 1],
        ["BG6", 1],
      ],
      3,
      0,
      ORG.Q3,
    ],
    [2, "Trịnh Mỹ Linh", "li•••@example.com", true, [["CG26", 1]], 7, 1, ORG.Q3],
    [
      3,
      "Khách chưa đăng nhập",
      null,
      false,
      [
        ["TG35", 1],
        ["KB4-BE", 1],
      ],
      18,
      0,
      ORG.TD,
    ],
    [
      4,
      "Phan Gia Huy",
      "09•• ••• 504 (mẫu)",
      true,
      [
        ["CG28", 1],
        ["NI20", 1],
        ["KB4-XA", 2],
      ],
      22,
      0,
      ORG.TD,
    ],
    [5, "Đoàn Thu Hà", "ha•••@example.com", false, [["NI20", 1]], 30, 0, ORG.CG],
    [
      6,
      "Vũ Minh Quân",
      "09•• ••• 377 (mẫu)",
      true,
      [
        ["CCD28", 1],
        ["DB3", 1],
      ],
      76,
      2,
      ORG.CG,
    ],
  ];
  const { data: units } = await listUnits();
  const out: AbandonedCart[] = [];
  for (const [n, buyer, contact, consent, items, hoursAgo, sent, org] of seeds) {
    const ids: string[] = [];
    const lines: AbandonedCart["lines"] = [];
    for (const [sku, quantity] of items) {
      const { data } = await variantByCode(sku);
      if (!data) continue;
      ids.push(data.variant_id);
      lines.push({
        sku,
        name: `${data.name}${data.variant_label ? ` ${data.variant_label}` : ""}`,
        quantity,
      });
    }
    const prices = await pricesAt(org, ids);
    const value = items.reduce(
      (s, [, q], i) => s + q * num(prices.get(ids[i] ?? "")?.price?.amount),
      0,
    );
    out.push({
      id: uid("75", n),
      org_id: org,
      org_name: units.find((u) => u.id === org)?.name ?? org,
      buyer_name: buyer,
      contact,
      consent,
      lines,
      value: vnd(value),
      abandoned_at: new Date(Date.now() - hoursAgo * HOUR).toISOString(),
      reminders_sent: sent,
      reminder_scheduled_at: null,
    });
  }
  return out;
}

function seedViews(): OrderView[] {
  const system = (key: string, query: string): OrderView => ({
    id: `sys-${key}`,
    key,
    name: key,
    query,
    scope: "system",
    scope_org: null,
  });
  return [
    system("all", ""),
    system("pending", `status=${PENDING_STATUSES.join("%2C")}`),
    system("awaiting", "status=awaiting_acceptance"),
    system("shipping", "status=shipping"),
    {
      id: uid("76", 1),
      key: null,
      name: "Đơn sàn",
      query: "channel=marketplace",
      scope: "node",
      scope_org: ORG.ROOT,
    },
    {
      id: uid("76", 2),
      key: null,
      name: "COD chưa giao",
      query: `status=${UNDELIVERED_STATUSES.join("%2C")}&flow=cod`,
      scope: "personal",
      scope_org: null,
    },
  ];
}

async function seed(): Promise<Store> {
  const s: Store = {
    orders: [],
    pickupCodes: new Map(),
    returns: [],
    carts: [],
    views: seedViews(),
    invoiceSeq: { sales: 4100, cash_register: 300 },
    seq: 0,
  };
  s.orders = await seedOrders(s);
  s.returns = seedReturns(s.orders);
  s.carts = await seedCarts();
  return s;
}

// Kho giữ trên `globalThis`: Next.js có thể nạp lại module khi chạy thử, kho vẫn còn. Dựng kho cần đọc
// giá và khuyến mại (hàm async), nên giữ Promise của lần dựng đầu.
const KEY = Symbol.for("autoxide.sample.orders");
type Holder = { [KEY]?: Promise<Store> };

function store(): Promise<Store> {
  const holder = globalThis as Holder;
  holder[KEY] ??= seed();
  return holder[KEY];
}

/** Dựng lại kho mẫu (test). */
export function resetSampleOrders(): void {
  (globalThis as Holder)[KEY] = seed();
}

/** Kho mẫu cho `sample/stores.ts` (ca thu ngân, đánh giá dùng chung đơn). */
export async function ordersState(): Promise<{ orders: Order[]; returns: OrderReturn[] }> {
  const s = await store();
  return { orders: s.orders, returns: s.returns };
}

// ---------------------------------------------------------------- Danh sách đơn

function matches(o: Order, f: OrderFilters): boolean {
  if (f.status.length > 0 && !f.status.includes(o.status)) return false;
  if (f.channel && o.channel !== f.channel) return false;
  if (f.org && o.org_id !== f.org) return false;
  if (f.flow && o.flow !== f.flow) return false;
  if (f.pay && o.payment_status !== f.pay) return false;
  if (f.from && vietnamDay(Date.parse(o.placed_at)) < f.from) return false;
  if (f.q) {
    const needle = fold(f.q).replace(/\s+/g, "");
    const hay = fold(`${o.number}${o.buyer.name}${o.seller?.name ?? ""}`).replace(/\s+/g, "");
    if (!hay.includes(needle)) return false;
  }
  return true;
}

// Thay bằng GET /api/v1/orders?status=&payment_status=&org_id=&channel=&from=&number= (bước 45) khi
// core có. `flow` (dòng tiền) và `q` (tìm theo mã, người mua) là dự kiến. Mới nhất trước.
export async function listOrders(
  filters: OrderFilters = NO_FILTERS,
  { limit = 25, cursor = null }: { limit?: number; cursor?: string | null } = {},
): Promise<SamplePage<Order>> {
  const s = await store();
  return samplePage(
    s.orders.filter((o) => matches(o, filters)),
    { limit, cursor },
  );
}

// Dự kiến: số đơn khớp bộ lọc (`GET /api/v1/orders?count=true`), cho số đếm của view.
export async function countOrders(filters: OrderFilters = NO_FILTERS): Promise<number> {
  const s = await store();
  return s.orders.filter((o) => matches(o, filters)).length;
}

/**
 * Số ở đầu màn và trên menu (dự kiến, bước 51 hộp việc): đơn đặt trong 30 ngày qua và đơn chờ xử lý.
 */
export async function orderSummary(): Promise<{
  last_30_days: number;
  pending: number;
  returns_open: number;
  carts: number;
}> {
  const s = await store();
  const since = Date.now() - 30 * DAY;
  return {
    last_30_days: s.orders.filter((o) => Date.parse(o.placed_at) >= since).length,
    pending: s.orders.filter((o) => PENDING_STATUSES.includes(o.status)).length,
    returns_open: s.returns.filter((r) => ["requested", "approved", "received"].includes(r.status))
      .length,
    carts: s.carts.length,
  };
}

// Thay bằng GET /api/v1/orders/{id} (bước 45) khi core có.
export async function getOrder(id: string): Promise<{ data: Order } | null> {
  const s = await store();
  const o = s.orders.find((x) => x.id === id);
  return o ? { data: o } : null;
}

export async function getOrders(ids: readonly string[]): Promise<{ data: Order[] }> {
  const s = await store();
  return {
    data: ids
      .map((id) => s.orders.find((o) => o.id === id))
      .filter((o): o is Order => o !== undefined),
  };
}

// Thay bằng GET /api/v1/orders?number= (bước 45).
export async function findOrderByNumber(number: string): Promise<Order | null> {
  const s = await store();
  const key = number.trim().toUpperCase();
  return s.orders.find((o) => o.number === key) ?? null;
}

/** Yêu cầu đổi trả của một đơn. */
export async function returnsOf(orderId: string): Promise<OrderReturn[]> {
  const s = await store();
  return s.returns.filter((r) => r.order_id === orderId);
}

// ---------------------------------------------------------------- View đã lưu

// Dự kiến (bước 52): GET /api/v1/kernel/views?resource=orders — view của hệ thống, của nút, của tôi.
export async function listViews(): Promise<{ data: OrderView[] }> {
  const s = await store();
  return { data: s.views.map((v) => ({ ...v })) };
}

// Dự kiến (bước 52): POST /api/v1/kernel/views {resource, name, query, scope}.
export async function saveView(input: {
  name: string;
  scope: string;
  query: string;
}): Promise<SampleOutcome<OrderView>> {
  const s = await store();
  const name = input.name.trim();
  const errors: NonNullable<Problem["errors"]> = [];
  if (!name) errors.push(fieldError("name", "required"));
  else if (name.length > 40) errors.push(fieldError("name", "too_long"));
  else if (s.views.some((v) => v.scope !== "system" && fold(v.name) === fold(name)))
    errors.push(fieldError("name", "orders.view_name_taken", name));
  if (input.scope !== "personal" && input.scope !== "node")
    errors.push(fieldError("scope", "unknown"));
  if (errors.length > 0) return invalid(errors);
  s.seq += 1;
  const view: OrderView = {
    id: uid("76", 100 + s.seq),
    key: null,
    name,
    query: input.query,
    scope: input.scope === "node" ? "node" : "personal",
    scope_org: input.scope === "node" ? ORG.ROOT : null,
  };
  s.views.push(view);
  return { ok: true, data: view };
}

// ---------------------------------------------------------------- Chuyển trạng thái

function stale(o: Order, expect: string | undefined): SampleOutcome<never> | null {
  if (expect && expect !== o.updated_at) {
    return fail(412, "precondition_failed", "The order changed since you read it.");
  }
  return null;
}

function move(
  o: Order,
  to: OrderStatus,
  cause: ChangeCause,
  actor: Ref,
  reason: string | null,
  undo = false,
): void {
  const now = new Date().toISOString();
  o.history.push({
    id: `${o.number}-${o.history.length + 1}`,
    from: o.status,
    to,
    cause,
    actor,
    reason,
    at: now,
    undo,
  });
  o.status = to;
  settle(o, now);
}

/** Lần chuyển gần nhất của nhân viên, nếu còn trong hạn hoàn tác và đảo được. */
function undoable(o: Order): StatusChange | null {
  const last = o.history.at(-1);
  if (!last || last.undo || last.cause !== "staff" || !last.from) return null;
  if (["delivered", "cancelled", "completed"].includes(last.to)) return null;
  if (Date.now() - Date.parse(last.at) > UNDO_WINDOW_MS) return null;
  return last;
}

// Thay bằng POST /api/v1/orders/{id}/transitions {to, reason} kèm If-Match (bước 45). Hoàn tác (`to` là
// trạng thái ngay trước, trong 15 phút, do nhân viên chuyển) là dự kiến: bảng chuyển của đặc tả không có
// chiều ngược. Huỷ đơn đã thu tiền tự tạo hoàn tiền toàn phần (đặc tả: "đã thu thì tạo hoàn tiền").
export async function transitionOrder(
  id: string,
  to: OrderStatus,
  options: { expect?: string; reason?: string; actor?: Ref } = {},
): Promise<SampleOutcome<{ order: Order; previous: OrderStatus }>> {
  const s = await store();
  const o = s.orders.find((x) => x.id === id);
  if (!o) return notFound();
  const conflict = stale(o, options.expect);
  if (conflict) return conflict;
  const actor = options.actor ?? SAMPLE_ACTOR;
  const previous = o.status;
  if (to === previous) return { ok: true, data: { order: o, previous } };
  const last = undoable(o);
  if (last && last.from === to) {
    move(o, to, "staff", actor, null, true);
    if (o.pickup && previous === "preparing" && to !== "preparing") o.pickup.status = "preparing";
    return { ok: true, data: { order: o, previous } };
  }
  if (!canMove(previous, to)) {
    return fail(
      409,
      "orders.invalid_transition",
      `The order is ${previous} and cannot move to ${to}.`,
      [fieldError("to", "orders.invalid_transition", `${previous}→${to}`)],
    );
  }
  if (to === "shipping" && previous === "preparing" && o.pickup) {
    return fail(409, "orders.invalid_transition", "Pickup orders are handed over at the store.");
  }
  move(o, to, "staff", actor, options.reason ?? null);
  if (to === "cancelled") {
    const remaining = num(o.paid) - num(o.refunded);
    if (remaining > 0) {
      s.seq += 1;
      o.refunds.push({
        id: uid("72", 5000 + s.seq),
        return_id: null,
        reference: `cancel:${o.number}`,
        amount: vnd(remaining),
        destination: refundDestination(o.payment_method),
        status: "succeeded",
        reason: "cancelled",
        created_by: actor,
        created_at: new Date().toISOString(),
      });
    }
    if (o.pickup) o.pickup.status = "expired_cancel";
    for (const p of o.payments) if (p.status === "pending") p.status = "expired";
    settle(o, o.updated_at);
  }
  if (to === "delivered") {
    if (o.payment_method === "cod" && num(o.paid) === 0) {
      o.payments.push({
        id: uid("71", 9000 + seqOf(o.number)),
        method: "cod",
        partner: partnerOf("cod", o.funds_flow, o.org_name),
        reference: `cod-${o.number}`,
        amount: o.total,
        received: null,
        status: "succeeded",
        succeeded_at: new Date().toISOString(),
      });
      settle(o, o.updated_at);
    }
    issueInvoice(s, o);
  }
  return { ok: true, data: { order: o, previous } };
}

// Dự kiến: POST /api/v1/orders/transitions:batch {ids, to} — xác nhận nhiều đơn một lần; đơn ở trạng thái
// khác được bỏ qua (không làm hỏng cả lô).
export async function acceptOrders(
  ids: readonly string[],
): Promise<{ changed: string[]; skipped: number }> {
  const s = await store();
  const changed: string[] = [];
  let skipped = 0;
  for (const id of ids) {
    const o = s.orders.find((x) => x.id === id);
    if (o?.status !== "awaiting_acceptance" || !o) {
      skipped += 1;
      continue;
    }
    move(o, "confirmed", "staff", SAMPLE_ACTOR, null);
    changed.push(o.id);
  }
  return { changed, skipped };
}

/** Hoàn tác "xác nhận hàng loạt": đưa các đơn vừa xác nhận về chờ xác nhận. */
export async function undoAccept(ids: readonly string[]): Promise<number> {
  let n = 0;
  for (const id of ids) {
    const out = await transitionOrder(id, "awaiting_acceptance");
    if (out.ok) n += 1;
  }
  return n;
}

/** Mọi đơn đang chờ xác nhận khớp bộ lọc ("Chọn cả N đơn khớp bộ lọc"). */
export async function matchingIds(filters: OrderFilters): Promise<string[]> {
  const s = await store();
  return s.orders.filter((o) => matches(o, filters)).map((o) => o.id);
}

// Thay bằng POST /api/v1/orders/{id}/notes (dự kiến, bước 45: ghi chú nội bộ, người mua không thấy).
export async function addNote(id: string, text: string): Promise<SampleOutcome<OrderNote>> {
  const s = await store();
  const o = s.orders.find((x) => x.id === id);
  if (!o) return notFound();
  const body = text.trim();
  if (!body) return invalid([fieldError("text", "required")]);
  if (body.length > 1000) return invalid([fieldError("text", "too_long")]);
  const note: OrderNote = {
    id: `${o.id}-n${o.notes.length + 1}`,
    author: SAMPLE_ACTOR,
    text: body,
    at: new Date().toISOString(),
  };
  o.notes.unshift(note);
  return { ok: true, data: note };
}

// Thay bằng POST /api/v1/orders/{id}/payments/manual {reference, amount} (bước 45, D-184).
export async function recordManualPayment(
  id: string,
  reference: string,
): Promise<SampleOutcome<Order>> {
  const s = await store();
  const o = s.orders.find((x) => x.id === id);
  if (!o) return notFound();
  const ref = reference.trim();
  if (!ref) return invalid([fieldError("reference", "required")]);
  if (o.status !== "pending_payment") {
    return fail(
      409,
      "orders.invalid_transition",
      "Only an order waiting for payment takes a manual payment.",
    );
  }
  for (const p of o.payments) {
    if (p.status === "pending" || p.status === "needs_review") {
      p.status = "succeeded";
      p.reference = ref;
      p.succeeded_at = new Date().toISOString();
    }
  }
  move(
    o,
    o.seller ? "awaiting_acceptance" : "confirmed",
    "staff",
    SAMPLE_ACTOR,
    `manual_payment:${ref}`,
  );
  return { ok: true, data: o };
}

// Dự kiến (bước 45, `docs/prompts/ui-trace-roadmap.md`): POST /api/v1/orders/{id}/payment-link — gửi lại
// link thanh toán cho người mua qua `notifications`.
export async function resendPaymentLink(id: string): Promise<SampleOutcome<{ sent_to: string }>> {
  const s = await store();
  const o = s.orders.find((x) => x.id === id);
  if (!o) return notFound();
  if (o.status !== "pending_payment") {
    return fail(409, "orders.payment_not_pending", "This order is not waiting for payment.");
  }
  return { ok: true, data: { sent_to: o.buyer.email ?? o.buyer.phone } };
}

// ---------------------------------------------------------------- Hoàn tiền

// Thay bằng POST /api/v1/orders/{id}/refunds {amount, reason, reference} (bước 45). Tiền đi từ bên giữ
// dòng tiền (cổng, đối tác thu hộ, két) về đúng cách người mua đã trả; hệ thống ghi bút toán đảo và
// lập hoá đơn điều chỉnh. Gửi lại cùng `reference` trả kết quả cũ.
export async function refundOrder(
  id: string,
  input: { amount: string; reason: string; reference: string; return_id?: string; actor?: Ref },
): Promise<SampleOutcome<{ refund: Refund; replayed: boolean }>> {
  const s = await store();
  const o = s.orders.find((x) => x.id === id);
  if (!o) return notFound();
  const replay = input.reference
    ? o.refunds.find((r) => r.reference === input.reference)
    : undefined;
  if (replay) return { ok: true, data: { refund: replay, replayed: true } };
  const errors: NonNullable<Problem["errors"]> = [];
  const text = input.amount.replace(/[\s.,₫]/g, "");
  const amount = Number(text);
  if (!/^\d{1,12}$/.test(text) || amount <= 0) errors.push(fieldError("amount", "money_minor"));
  if (!input.reason.trim()) errors.push(fieldError("reason", "required"));
  if (errors.length > 0) return invalid(errors);
  const remaining = num(o.paid) - num(o.refunded);
  if (remaining <= 0)
    return fail(409, "orders.nothing_to_refund", "Nothing paid is left to refund.");
  if (amount > remaining) {
    return fail(
      422,
      "orders.refund_exceeds_paid",
      `Refund (${amount}) exceeds what is left (${remaining}).`,
      [fieldError("amount", "orders.refund_exceeds_paid", String(remaining))],
    );
  }
  const refund: Refund = {
    id: uid("72", 5000 + ++s.seq),
    return_id: input.return_id ?? null,
    reference: input.reference || `refund:${o.number}:${o.refunds.length + 1}`,
    amount: vnd(amount),
    destination: refundDestination(o.payment_method),
    status: "succeeded",
    reason: input.reason.trim(),
    created_by: input.actor ?? SAMPLE_ACTOR,
    created_at: new Date().toISOString(),
  };
  o.refunds.push(refund);
  settle(o, refund.created_at);
  return { ok: true, data: { refund, replayed: false } };
}

// ---------------------------------------------------------------- Đổi trả

export interface ReturnQuery {
  status?: ReturnStatus;
  method?: ReturnMethod;
  org_id?: string;
}

// Thay bằng GET /api/v1/orders/returns?status=&org_id= (bước 45). `method` là dự kiến.
export async function listReturns(query: ReturnQuery = {}): Promise<{ data: OrderReturn[] }> {
  const s = await store();
  return {
    data: s.returns.filter(
      (r) =>
        (!query.status || r.status === query.status) &&
        (!query.method || r.return_method === query.method) &&
        (!query.org_id || r.org_id === query.org_id),
    ),
  };
}

export async function returnCounts(
  method?: ReturnMethod,
): Promise<Record<ReturnStatus | "all", number>> {
  const s = await store();
  const out = {
    all: 0,
    requested: 0,
    approved: 0,
    rejected: 0,
    received: 0,
    refunded: 0,
    closed: 0,
  };
  for (const r of s.returns) {
    if (method && r.return_method !== method) continue;
    out[r.status] += 1;
    out.all += 1;
  }
  return out;
}

function returnEvent(r: OrderReturn, event: string, by: Ref): void {
  const at = new Date().toISOString();
  r.history.push({ at, event, by: by.name });
  r.updated_at = at;
}

export type ReturnStep =
  | { step: "approve" }
  | { step: "reject"; code: string; note: string }
  | { step: "receive"; condition: string }
  | { step: "refund" }
  | { step: "close" };

// Thay bằng POST /api/v1/orders/returns/{id}/transitions (bước 45): duyệt, từ chối kèm lý do, nhận
// hàng (tình trạng từng dòng), hoàn tiền (bút toán đảo + hoá đơn điều chỉnh), đóng. Đổi hàng thì nhận
// về rồi đóng, không hoàn tiền.
export async function decideReturn(
  id: string,
  input: ReturnStep,
): Promise<SampleOutcome<OrderReturn>> {
  const s = await store();
  const r = s.returns.find((x) => x.id === id);
  if (!r) return fail(404, "orders.return_not_found", "Return request not found.");
  const wrong = () => fail(409, "orders.return_invalid_transition", `The request is ${r.status}.`);
  const now = new Date().toISOString();
  switch (input.step) {
    case "approve":
      if (r.status !== "requested") return wrong();
      r.status = "approved";
      r.decided_by = SAMPLE_ACTOR;
      r.decided_at = now;
      returnEvent(r, "approved", SAMPLE_ACTOR);
      return { ok: true, data: r };
    case "reject": {
      if (r.status !== "requested") return wrong();
      const errors: NonNullable<Problem["errors"]> = [];
      if (!(REJECT_REASONS as readonly string[]).includes(input.code))
        errors.push(fieldError("code", "unknown"));
      if (!input.note.trim()) errors.push(fieldError("note", "required"));
      if (errors.length > 0) return invalid(errors);
      r.status = "rejected";
      r.reject = { code: input.code as RejectReason, note: input.note.trim() };
      r.decided_by = SAMPLE_ACTOR;
      r.decided_at = now;
      if (r.proposal?.status === "pending") r.proposal.status = "rejected";
      returnEvent(r, "rejected", SAMPLE_ACTOR);
      return { ok: true, data: r };
    }
    case "receive": {
      if (r.status !== "approved" && !(r.status === "requested" && r.return_method === "in_store"))
        return wrong();
      if (input.condition !== "restock" && input.condition !== "damaged")
        return invalid([fieldError("condition", "unknown")]);
      const o = s.orders.find((x) => x.id === r.order_id);
      for (const l of r.lines) {
        l.condition = input.condition;
        const line = o?.lines.find((x) => x.id === l.line_id);
        if (line) line.returned_quantity += l.quantity;
      }
      if (o) settle(o, now);
      r.status = "received";
      r.decided_by ??= SAMPLE_ACTOR;
      r.decided_at ??= now;
      returnEvent(r, "received", SAMPLE_ACTOR);
      return { ok: true, data: r };
    }
    case "refund": {
      if (r.status !== "received") return wrong();
      if (r.resolution === "exchange")
        return fail(
          409,
          "orders.return_is_exchange",
          "This request is an exchange; close it after handing over the new item.",
        );
      const out = await refundOrder(r.order_id, {
        amount: r.refund_amount.amount,
        reason: "return",
        reference: `return:${r.number}`,
        return_id: r.id,
      });
      if (!out.ok) return out;
      r.status = "refunded";
      returnEvent(r, "refunded", SAMPLE_ACTOR);
      return { ok: true, data: r };
    }
    case "close":
      if (r.status !== "refunded" && !(r.status === "received" && r.resolution === "exchange"))
        return wrong();
      r.status = "closed";
      returnEvent(r, "closed", SAMPLE_ACTOR);
      return { ok: true, data: r };
  }
}

// Dự kiến (bước 51 P12, D-109): POST /api/v1/kernel/approvals/{id}/approve | reject. Agent chỉ đề xuất;
// người có `orders.refund` duyệt thì hoàn ngay (hàng vỡ khi nhận: không cần gửi trả). Từ chối thì đảo
// được (`reopen`) tới khi đề xuất hết hạn.
export async function decideProposal(
  returnId: string,
  decision: "approve" | "reject" | "reopen",
): Promise<SampleOutcome<OrderReturn>> {
  const s = await store();
  const r = s.returns.find((x) => x.id === returnId);
  if (!r?.proposal)
    return fail(404, "kernel.approval_not_found", "This approval request does not exist.");
  const p = r.proposal;
  if (decision === "reopen") {
    if (p.status !== "rejected") return fail(409, "kernel.approval_not_pending", "Not rejected.");
    p.status = "pending";
    returnEvent(r, "proposal_reopened", SAMPLE_ACTOR);
    return { ok: true, data: r };
  }
  if (p.status !== "pending" || Date.parse(p.expires_at) < Date.now()) {
    return fail(
      409,
      "kernel.approval_not_pending",
      "This request was already decided or has expired.",
    );
  }
  if (decision === "reject") {
    p.status = "rejected";
    returnEvent(r, "proposal_rejected", SAMPLE_ACTOR);
    return { ok: true, data: r };
  }
  const out = await refundOrder(r.order_id, {
    amount: p.amount.amount,
    reason: "return",
    reference: `return:${r.number}`,
    return_id: r.id,
  });
  if (!out.ok) return out;
  p.status = "approved";
  r.status = "refunded";
  r.decided_by = SAMPLE_ACTOR;
  r.decided_at = new Date().toISOString();
  returnEvent(r, "refunded", SAMPLE_ACTOR);
  return { ok: true, data: r };
}

// Dự kiến (bước 45): đổi trả nhận tại quầy — nhân viên tạo yêu cầu đã nhận hàng (POST
// /api/v1/orders/returns {order_id, lines, reason_code, return_method: in_store, condition}).
export async function createStoreReturn(input: {
  order_number: string;
  sku: string;
  quantity: string;
  reason_code: string;
  condition: string;
  resolution: string;
}): Promise<SampleOutcome<OrderReturn>> {
  const s = await store();
  const errors: NonNullable<Problem["errors"]> = [];
  const o = s.orders.find((x) => x.number === input.order_number.trim().toUpperCase());
  if (!input.order_number.trim()) errors.push(fieldError("order_number", "required"));
  else if (!o) errors.push(fieldError("order_number", "orders.order_not_found"));
  const line = o?.lines.find((l) => l.sku === input.sku.trim().toUpperCase() && !l.gift);
  if (!input.sku.trim()) errors.push(fieldError("sku", "required"));
  else if (o && !line)
    errors.push(fieldError("sku", "orders.line_not_in_order", input.sku.trim().toUpperCase()));
  const quantity = Number(input.quantity);
  if (!/^\d{1,3}$/.test(input.quantity.trim()) || quantity < 1)
    errors.push(fieldError("quantity", "whole_number"));
  else if (line && quantity > line.quantity - line.returned_quantity)
    errors.push(
      fieldError(
        "quantity",
        "orders.return_quantity_invalid",
        String(line.quantity - line.returned_quantity),
      ),
    );
  if (!(RETURN_REASONS as readonly string[]).includes(input.reason_code))
    errors.push(fieldError("reason_code", "unknown"));
  if (input.condition !== "restock" && input.condition !== "damaged")
    errors.push(fieldError("condition", "unknown"));
  if (input.resolution !== "refund" && input.resolution !== "exchange")
    errors.push(fieldError("resolution", "unknown"));
  if (errors.length > 0 || !o || !line) return invalid(errors);
  if (
    !o.return_deadline_at ||
    Date.parse(o.return_deadline_at) < Date.now() ||
    o.status === "completed"
  ) {
    return fail(
      409,
      "orders.return_window_closed",
      `The return window (${RETURN_WINDOW_DAYS} days) has closed.`,
    );
  }
  s.seq += 1;
  const now = new Date().toISOString();
  const n = 30 + s.seq;
  const r: OrderReturn = {
    id: uid("73", n),
    number: `TH-2611-${String(n).padStart(4, "0")}`,
    order_id: o.id,
    order_number: o.number,
    org_id: o.org_id,
    org_name: o.org_name,
    buyer_name: o.buyer.name,
    status: "received",
    reason_code: input.reason_code as ReturnReason,
    buyer_note: "",
    resolution: input.resolution as "refund" | "exchange",
    return_method: "in_store",
    return_to: o.org_name,
    lines: [
      {
        line_id: line.id,
        sku: line.sku,
        name: line.name,
        quantity,
        amount: vnd(Math.round((num(line.net) / line.quantity) * quantity)),
        condition: input.condition as "restock" | "damaged",
      },
    ],
    refund_amount: vnd(
      input.resolution === "exchange" ? 0 : Math.round((num(line.net) / line.quantity) * quantity),
    ),
    media: [],
    requested_at: now,
    respond_by: now,
    return_deadline_at: o.return_deadline_at,
    decided_by: SAMPLE_ACTOR,
    decided_at: now,
    reject: null,
    proposal: null,
    history: [{ at: now, event: "received", by: SAMPLE_ACTOR.name }],
    updated_at: now,
  };
  line.returned_quantity += quantity;
  settle(o, now);
  s.returns.unshift(r);
  return { ok: true, data: r };
}

// ---------------------------------------------------------------- Giỏ hàng bỏ dở

// Thay bằng GET /api/v1/orders/carts?status=abandoned (dự kiến, `docs/prompts/ui-trace-roadmap.md`).
export async function listCarts(): Promise<{ data: AbandonedCart[] }> {
  const s = await store();
  return { data: s.carts.map((c) => ({ ...c })) };
}

// Dự kiến: POST /api/v1/orders/carts/{id}/reminders — xếp lịch gửi thư nhắc (mẫu "Giỏ hàng bỏ dở"
// của Tiếp thị) sau 1 phút; chỉ khi người mua đã đồng ý nhận tin, tối đa 2 lần mỗi giỏ. `undo` huỷ lần
// nhắc chưa gửi.
export async function remindCart(id: string, undo = false): Promise<SampleOutcome<AbandonedCart>> {
  const s = await store();
  const c = s.carts.find((x) => x.id === id);
  if (!c) return fail(404, "orders.cart_not_found", "Cart not found.");
  if (undo) {
    if (!c.reminder_scheduled_at || Date.parse(c.reminder_scheduled_at) < Date.now()) {
      return fail(409, "orders.cart_reminder_sent", "The reminder was already sent.");
    }
    c.reminders_sent -= 1;
    c.reminder_scheduled_at = null;
    return { ok: true, data: c };
  }
  if (!c.consent || !c.contact)
    return fail(409, "orders.cart_no_consent", "The buyer has not agreed to receive messages.");
  if (c.reminders_sent >= MAX_CART_REMINDERS) {
    return fail(
      409,
      "orders.cart_reminder_limit",
      `A cart is reminded at most ${MAX_CART_REMINDERS} times.`,
    );
  }
  c.reminders_sent += 1;
  c.reminder_scheduled_at = new Date(Date.now() + MINUTE).toISOString();
  return { ok: true, data: c };
}

// ---------------------------------------------------------------- Nhận tại cửa hàng

// Dự kiến: GET /api/v1/orders?pickup_org_id=&pickup_status= (`docs/prompts/ui-trace-roadmap.md`).
export async function listPickups(): Promise<{ data: Order[] }> {
  const s = await store();
  return {
    data: s.orders
      .filter((o) => o.pickup && o.status !== "cancelled" && o.status !== "pending_payment")
      .sort((a, b) => (a.pickup?.hold_until ?? "9").localeCompare(b.pickup?.hold_until ?? "9")),
  };
}

// Dự kiến: POST /api/v1/orders/{id}/pickup/ready — gửi mã nhận 6 số cho người mua, giữ hàng 3 ngày.
// `undo` đưa về "đang soạn" và huỷ mã vừa gửi.
export async function pickupReady(id: string, undo = false): Promise<SampleOutcome<Order>> {
  const s = await store();
  const o = s.orders.find((x) => x.id === id);
  if (!o?.pickup) return notFound();
  const now = Date.now();
  if (undo) {
    if (o.pickup.status !== "ready") return fail(409, "orders.pickup_invalid_state", "Not ready.");
    o.pickup.status = "preparing";
    o.pickup.ready_at = null;
    o.pickup.hold_until = null;
  } else {
    if (o.pickup.status !== "preparing" || o.status !== "preparing") {
      return fail(
        409,
        "orders.pickup_invalid_state",
        "Only an order being prepared can be marked ready.",
      );
    }
    o.pickup.status = "ready";
    o.pickup.ready_at = new Date(now).toISOString();
    o.pickup.hold_until = new Date(now + PICKUP_HOLD_DAYS * DAY).toISOString();
    s.pickupCodes.set(o.id, String(100000 + Math.floor(random(now)() * 900000)));
  }
  o.updated_at = new Date(now).toISOString();
  return { ok: true, data: o };
}

// Dự kiến: POST /api/v1/orders/{id}/pickup/code — gửi lại mã nhận (mã cũ hết hiệu lực).
export async function resendPickupCode(id: string): Promise<SampleOutcome<Order>> {
  const s = await store();
  const o = s.orders.find((x) => x.id === id);
  if (!o?.pickup) return notFound();
  if (o.pickup.status !== "ready") return fail(409, "orders.pickup_invalid_state", "Not ready.");
  s.pickupCodes.set(o.id, String(100000 + Math.floor(random(Date.now() + 7)() * 900000)));
  return { ok: true, data: o };
}

/** Mã nhận hiện tại — CHỈ cho test (giả làm người mua đọc mã); trang không gọi hàm này. */
export async function pickupCodeForTest(id: string): Promise<string | null> {
  return (await store()).pickupCodes.get(id) ?? null;
}

// Dự kiến: POST /api/v1/orders/{id}/pickup/handover {code | proxy_name} — người nhận đọc mã, hệ thống so;
// người nhận hộ phải khớp tên đã khai trên đơn. Xong thì đơn "đã giao" và lập hoá đơn.
export async function handOver(
  id: string,
  input: { who: string; code: string; proxy_name: string },
): Promise<SampleOutcome<Order>> {
  const s = await store();
  const o = s.orders.find((x) => x.id === id);
  if (!o?.pickup) return notFound();
  if (o.pickup.status !== "ready")
    return fail(409, "orders.pickup_invalid_state", "The order is not ready for pickup.");
  const errors: NonNullable<Problem["errors"]> = [];
  const code = input.code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) errors.push(fieldError("code", "orders.pickup_code_format"));
  else if (code !== s.pickupCodes.get(o.id))
    errors.push(fieldError("code", "orders.pickup_code_invalid"));
  if (input.who === "proxy") {
    if (!input.proxy_name.trim()) errors.push(fieldError("proxy_name", "required"));
    else if (!o.pickup.proxy || fold(o.pickup.proxy.name) !== fold(input.proxy_name))
      errors.push(fieldError("proxy_name", "orders.pickup_proxy_mismatch"));
  } else if (input.who !== "buyer") errors.push(fieldError("who", "unknown"));
  if (errors.length > 0) return invalid(errors);
  move(o, "delivered", "staff", SAMPLE_ACTOR, input.who === "proxy" ? "pickup_proxy" : "pickup");
  o.pickup.status = "handed";
  o.pickup.handed_at = o.updated_at;
  s.pickupCodes.delete(o.id);
  issueInvoice(s, o);
  return { ok: true, data: o };
}

// ---------------------------------------------------------------- Bán tại quầy

/**
 * Tạo đơn tại quầy (đặc tả 45: `POST /orders/pos/sales`): đơn vào thẳng "đã giao" và lập hoá đơn từ máy
 * tính tiền. `sample/stores.ts` kiểm ca thu ngân và tồn trước khi gọi.
 */
export async function placePosOrder(input: {
  org_id: string;
  org_name: string;
  items: readonly (readonly [string, number])[];
  method: PaymentMethod;
  codes?: readonly string[];
  /** Tên khách đã chọn ở quầy; `null` = khách lẻ. */
  buyer?: string | null;
  shift_id: string;
  reference: string;
}): Promise<SampleOutcome<{ order: Order; replayed: boolean }>> {
  const s = await store();
  const replay = s.orders.find((o) =>
    o.payments.some((p) => p.reference === `pos:${input.reference}`),
  );
  if (replay) return { ok: true, data: { order: replay, replayed: true } };
  const next = Math.max(...s.orders.map((o) => seqOf(o.number))) + 1;
  const made = await makeOrder(s, {
    number: numberOf(next),
    org_id: input.org_id,
    org_name: input.org_name,
    channel: "pos",
    seller: null,
    buyer: input.buyer || "Khách tại quầy",
    items: input.items,
    codes: input.codes ?? [],
    method: input.method,
    fee: 0,
    status: "delivered",
    placed: Date.now() - 1000,
    pickup: null,
    province: "79",
  });
  if (!made.ok) return made;
  const o = made.data;
  o.shift_id = input.shift_id;
  for (const p of o.payments) p.reference = `pos:${input.reference}`;
  s.orders.unshift(o);
  return { ok: true, data: { order: o, replayed: false } };
}

// Thay bằng `OrderIntake::import` (bước 45) — module `channels` (bước 48) gọi khi nhập đơn từ kênh.
/**
 * Nhập một đơn từ kênh bán: không trùng theo (kênh, mã đơn trên kênh) — gọi lại trả đơn đã có
 * (`replayed`, không phải lỗi). Đơn mới lấy số kế tiếp như bán tại quầy; giá dòng là giá kênh.
 */
export async function importChannelOrder(input: {
  account_id: string;
  external_ref: string;
  buyer: string;
  items: readonly (readonly [string, number])[];
  method: "ewallet" | "cod";
  placed_at: string;
}): Promise<SampleOutcome<{ order: Order; replayed: boolean }>> {
  const s = await store();
  const account = ACCOUNT_SEEDS.find((a) => a.id === input.account_id);
  if (!account) return fail(404, "channels.account_not_found", "Channel account not found.");
  const replay = s.orders.find(
    (o) => o.channel === account.kind && o.external_ref === input.external_ref,
  );
  if (replay) return { ok: true, data: { order: replay, replayed: true } };
  const { data: units } = await listUnits();
  const next = Math.max(...s.orders.map((o) => seqOf(o.number))) + 1;
  const made = await makeOrder(s, {
    number: numberOf(next),
    org_id: account.org_id,
    org_name: units.find((u) => u.id === account.org_id)?.name ?? "",
    channel: account.kind as Channel,
    seller: null,
    buyer: input.buyer,
    items: input.items,
    codes: [],
    method: input.method,
    fee: account.org_id === ORG.CG ? 35_000 : 30_000,
    status: "confirmed",
    placed: Date.parse(input.placed_at),
    pickup: null,
    province: account.org_id === ORG.CG ? "01" : "79",
    account,
  });
  if (!made.ok) return made;
  made.data.external_ref = input.external_ref;
  s.orders.unshift(made.data);
  return { ok: true, data: { order: made.data, replayed: false } };
}

// ---------------------------------------------------------------- Lọc bằng lời (AI, mẫu)

export interface ParsedFilter {
  filters: OrderFilters;
  /** Phần câu không thành tham số lọc nào. */
  unknown: string;
}

const NL_RULES: readonly [RegExp, (f: OrderFilters, now: number) => void][] = [
  [
    /chua giao|chua gui|not (yet )?(delivered|shipped)|undelivered/,
    (f) => {
      f.status = [...UNDELIVERED_STATUSES];
    },
  ],
  [
    /giao (loi|that bai|hong)|failed deliver(y|ies)|delivery failed/,
    (f) => {
      f.status = ["delivery_failed"];
    },
  ],
  [
    /dang giao|in transit|being delivered|shipping/,
    (f) => {
      f.status = ["shipping"];
    },
  ],
  [
    /da giao|delivered/,
    (f) => {
      f.status = ["delivered", "completed"];
    },
  ],
  [
    /cho xac nhan|awaiting acceptance|to accept/,
    (f) => {
      f.status = ["awaiting_acceptance"];
    },
  ],
  [
    /cho xu ly|pending|to do/,
    (f) => {
      f.status = [...PENDING_STATUSES];
    },
  ],
  [
    /(bi |da )?huy|cancell?ed/,
    (f) => {
      f.status = ["cancelled"];
    },
  ],
  [
    /cho thanh toan|chua thanh toan|awaiting payment|unpaid/,
    (f) => {
      f.status = ["pending_payment"];
    },
  ],
  [
    /\bcod\b|thu ho|thu khi giao|cash on delivery/,
    (f) => {
      f.flow = "cod";
    },
  ],
  [
    /tien mat|\bcash\b/,
    (f) => {
      f.flow = "cash";
    },
  ],
  [
    /(tai )?quay|\bpos\b|in store|counter/,
    (f) => {
      f.channel = "pos";
    },
  ],
  [
    /(tren )?san|cho bep moc|marketplace/,
    (f) => {
      f.channel = "marketplace";
    },
  ],
  [
    /website|\bweb\b|online/,
    (f) => {
      f.channel = "web";
    },
  ],
  [
    /(cn |chi nhanh |cua hang )?(quan 3|q3|q\.3)|district 3/,
    (f) => {
      f.org = ORG.Q3;
    },
  ],
  [
    /(cn |chi nhanh |cua hang )?thu duc/,
    (f) => {
      f.org = ORG.TD;
    },
  ],
  [
    /(cn |chi nhanh |cua hang )?cau giay/,
    (f) => {
      f.org = ORG.CG;
    },
  ],
  [
    /hom nay|today/,
    (f, now) => {
      f.from = vietnamDay(now);
    },
  ],
  [
    /hom qua|yesterday/,
    (f, now) => {
      f.from = vietnamDay(now - DAY);
    },
  ],
  [
    /tuan nay|this week/,
    (f, now) => {
      const day = new Date(Date.parse(`${vietnamDay(now)}T00:00:00Z`)).getUTCDay();
      f.from = vietnamDay(now - ((day + 6) % 7) * DAY);
    },
  ],
  [
    /thang nay|this month/,
    (f, now) => {
      f.from = `${vietnamDay(now).slice(0, 8)}01`;
    },
  ],
];

const NL_STOP = new Set([
  "don",
  "don hang",
  "cac",
  "nhung",
  "o",
  "tai",
  "cua",
  "va",
  "trong",
  "cho",
  "co",
  "ma",
  "la",
  "nao",
  "hang",
  "toi",
  "xem",
  "loc",
  "tim",
  "giup",
  "can",
  "orders",
  "order",
  "show",
  "me",
  "all",
  "the",
  "from",
  "at",
  "in",
  "of",
  "and",
  "with",
  "that",
  "are",
  "is",
  "yet",
]);

/**
 * Câu thường → tham số lọc của danh sách đơn. Bản mẫu của `POST /api/v1/ai/filters/parse` (bước 52,
 * D-201): AI chỉ trả tham số có trong schema bộ lọc, phần không hiểu để riêng; không đọc, không sửa
 * đơn nào. Ở đây là luật từ khoá (tiếng Việt có / không dấu, tiếng Anh). Hàm thuần (test).
 */
export function parseFilterText(text: string, now = Date.now()): ParsedFilter {
  let rest = ` ${fold(text).replace(/[.,;!?«»"]/g, " ")} `;
  const filters: OrderFilters = { ...NO_FILTERS, status: [] };
  const used = new Set<string>();
  for (const [pattern, apply] of NL_RULES) {
    const probe: OrderFilters = { ...NO_FILTERS, status: [] };
    apply(probe, now);
    const key =
      probe.status.length > 0
        ? "status"
        : probe.flow
          ? "flow"
          : probe.channel
            ? "channel"
            : probe.org
              ? "org"
              : "from";
    if (used.has(key) || !pattern.test(rest)) continue;
    apply(filters, now);
    used.add(key);
    rest = rest.replace(pattern, " ");
  }
  const unknown = rest
    .split(/\s+/)
    .filter((w) => w && !NL_STOP.has(w))
    .join(" ");
  return { filters, unknown };
}

// ---------------------------------------------------------------- Xuất CSV

// Dự kiến: xuất theo bộ lọc bằng job chung của bước 51 (`docs/prompts/ui-trace-roadmap.md`, "Xuất danh
// sách theo bộ lọc"). Ô bắt đầu bằng = + - @ được chặn (`csvCell`).
export async function exportOrdersCsv(filters: OrderFilters): Promise<string> {
  const s = await store();
  const head = [
    "number",
    "placed_at",
    "org",
    "channel",
    "seller",
    "status",
    "payment_status",
    "payment_method",
    "flow",
    "total",
    "currency",
  ];
  const rows = s.orders
    .filter((o) => matches(o, filters))
    .map((o) => [
      o.number,
      o.placed_at,
      o.org_name,
      o.channel,
      o.seller?.name ?? "",
      o.status,
      o.payment_status,
      o.payment_method,
      o.flow,
      o.total.amount,
      o.total.currency,
    ]);
  return [head, ...rows].map((r) => r.map((c) => csvCell(String(c))).join(",")).join("\n");
}

/** Giỏ dòng `SKU × số` (ô của form bán tại quầy) thành cặp SKU, số lượng. */
export function posLines(text: string): { items: [string, number][]; bad: string[] } {
  const { lines, bad } = parseCartLines(text);
  return { items: lines.map((l) => [l.sku, l.quantity]), bad };
}
