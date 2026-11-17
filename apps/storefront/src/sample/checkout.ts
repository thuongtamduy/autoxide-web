// Báo giá giỏ hàng và kiểm form đặt hàng (mẫu, W-030). Hàm thuần: trình duyệt dùng để tổng tiền đổi
// ngay khi người mua đổi tỉnh, cách nhận, điểm; Server Action đặt hàng dùng lại đúng các hàm này để
// kiểm lần cuối (như core kiểm lại mọi thứ ở `POST /checkout`).
//
// Thay bằng (bước 45): `GET /api/v1/orders/carts/{id}` (báo giá tính lại: dòng, giảm kèm lý do, thuế,
// phí theo từng nơi bán, `free_shipping_remaining`, `quote_token`), `PUT /carts/{id}/codes`,
// `PUT /carts/{id}/delivery`, `POST /api/v1/orders/checkout` (lỗi 422 `validation_failed` liệt kê mọi
// trường một lần — luật 5 của core). Điểm: `GET /api/v1/customers/me/points` (bước 47).
//
// Một giỏ có nhiều nơi bán (D-216): hàng Bếp Mộc là một nhóm, mỗi người bán trên sàn một nhóm; mỗi nhóm
// thành một đơn riêng (mã đơn riêng, phí giao riêng, người giao riêng) trong cùng một lần thanh toán.
// Tiền đi qua đối tác thanh toán được cấp phép (D-187): core và cửa hàng không giữ tiền của người mua.
import type { CartLine } from "./cart";
import { COUPON, type StoreCode, storeByCode } from "./catalog";
import { sellerBySlug } from "./market";
import { type Offer, offerBySku } from "./offers";
import {
  deliveryWindow,
  FREE_SHIPPING_OVER,
  MAX_PARCEL_GRAMS,
  STANDARD_DAYS,
  standardFee,
} from "./shipping";

export type PaymentMethod = "vietqr" | "card" | "cod";
export const PAYMENT_METHODS: readonly PaymentMethod[] = ["vietqr", "card", "cod"];
export type DeliveryMethod = "ship" | "pickup";

/** Quy tắc điểm (`customers_loyalty_rules` của bước 47, dữ liệu có ngày hiệu lực). */
export const LOYALTY = {
  /** Giá trị một điểm khi trả tiền, VND. */
  point_value: 100,
  min_redeem_points: 100,
  /** Điểm trả tối đa 30% giá trị đơn Bếp Mộc (hàng sau giảm + phí giao). */
  max_redeem_ratio_bp: 3000,
} as const;

/**
 * Thuế suất GTGT của hàng gia dụng: mức giảm 8% tới hết 31/12/2026, rồi 10% (như `tax.ts` của trang
 * quản trị; dữ liệu có ngày hiệu lực — cần đối chiếu văn bản gốc trước khi chạy thật).
 */
const VAT_RATES: readonly { percent: number; from: string; to: string | null }[] = [
  { percent: 8, from: "2025-07-01", to: "2027-01-01" },
  { percent: 10, from: "2027-01-01", to: null },
];

export function vatPercentOn(day: string): number {
  return (
    VAT_RATES.find((rate) => rate.from <= day && (rate.to === null || day < rate.to))?.percent ?? 10
  );
}

/** Phần thuế GTGT trong giá đã gồm thuế (làm tròn tới đồng). */
export function vatIncluded(gross: number, percent: number): number {
  return Math.round((gross * percent) / (100 + percent));
}

// ---------------------------------------------------------------- Mã giảm

export type CodeStatus = "applied" | "unknown" | "not_eligible";

/** Mã có áp được cho giỏ không (mã công khai mẫu: BEPMOC10 của `catalog.ts`). */
export function checkCode(code: string, lines: readonly CartLine[]): CodeStatus {
  if (code.trim().toUpperCase() !== COUPON.code) return "unknown";
  return lines.some((line) => COUPON.skus.includes(line.sku)) ? "applied" : "not_eligible";
}

function lineDiscount(sku: string, amount: number, applied: boolean): number {
  if (!applied || !COUPON.skus.includes(sku)) return 0;
  return Math.round((amount * COUPON.value_bp) / 10_000);
}

// ---------------------------------------------------------------- Báo giá

export interface QuoteInput {
  lines: readonly CartLine[];
  /** Mã người mua đã nhập (giữ trong cookie); báo giá tự xét lại khi giỏ đổi. */
  code: string | null;
  /** Cửa hàng bán (đầu trang): quyết bảng phí (CN Cầu Giấy có phí Hà Nội riêng). */
  store: StoreCode;
  /** Cách nhận hàng Bếp Mộc. Hàng người bán luôn giao tận nơi. */
  delivery: DeliveryMethod;
  province: string | null;
  /** Điểm muốn dùng (0 = không dùng). */
  points: number;
  /** Số dư điểm của người mua đã đăng nhập; `null` = mua không cần tài khoản. */
  balance: number | null;
  now: Date;
}

export interface QuoteLine {
  sku: string;
  offer: Offer;
  quantity: number;
  /** Đơn giá × số lượng. */
  amount: number;
  discount: number;
}

export interface QuoteGroup {
  /** `null` = Bếp Mộc bán; khác = slug người bán. */
  seller: string | null;
  lines: QuoteLine[];
  goods: number;
  discount: number;
  /** `null` khi chưa biết (chưa chọn tỉnh); 0 = miễn phí / nhận tại cửa hàng. */
  shipping: number | null;
  shipping_kind: "standard" | "free" | "pickup" | "seller";
  /** Còn thiếu bao nhiêu để được miễn phí giao (chỉ Bếp Mộc, giao tận nơi). */
  free_remaining: number | null;
  /** Ngày giao dự kiến; `null` khi chưa chọn tỉnh hay nhận tại cửa hàng. */
  eta: [string, string] | null;
  grams: number;
  cod: boolean;
  /** Tổng của nhóm (chưa trừ điểm). */
  total: number;
}

export interface Quote {
  groups: QuoteGroup[];
  subtotal: number;
  discount: number;
  shipping: number;
  /** Mọi nhóm đã có phí giao (đã chọn tỉnh hay nhận tại cửa hàng). */
  shipping_known: boolean;
  points_used: number;
  points_value: number;
  /** Điểm tối đa dùng được cho giỏ này. */
  points_cap: number;
  total: number;
  vat_percent: number;
  vat: number;
  code: { code: string; status: CodeStatus } | null;
  /** Mọi nơi bán trong giỏ nhận trả tiền khi nhận hàng. */
  cod_available: boolean;
  /** Hàng Bếp Mộc giao tận nơi quá cân của phương thức tiêu chuẩn. */
  too_heavy: boolean;
}

export function buildQuote(input: QuoteInput): Quote {
  const codeStatus = input.code ? checkCode(input.code, input.lines) : null;
  const applied = codeStatus === "applied";
  const day = input.now.toISOString().slice(0, 10);
  const vatPercent = vatPercentOn(day);

  const bySeller = new Map<string | null, QuoteLine[]>();
  for (const line of input.lines) {
    const offer = offerBySku(line.sku);
    if (!offer?.sellable) continue;
    const amount = offer.price * line.quantity;
    const quoteLine: QuoteLine = {
      sku: line.sku,
      offer,
      quantity: line.quantity,
      amount,
      discount: lineDiscount(line.sku, amount, applied),
    };
    bySeller.set(offer.seller, [...(bySeller.get(offer.seller) ?? []), quoteLine]);
  }
  // Bếp Mộc trước, người bán theo thứ tự xuất hiện trong giỏ.
  const keys = [...bySeller.keys()].sort((a, b) => (a === null ? -1 : b === null ? 1 : 0));

  let tooHeavy = false;
  const groups: QuoteGroup[] = keys.map((seller) => {
    const lines = bySeller.get(seller) ?? [];
    const goods = lines.reduce((sum, l) => sum + l.amount, 0);
    const discount = lines.reduce((sum, l) => sum + l.discount, 0);
    const grams = lines.reduce((sum, l) => sum + l.offer.grams * l.quantity, 0);
    if (seller === null) {
      if (input.delivery === "pickup") {
        return group(seller, lines, goods, discount, grams, 0, "pickup", null, null, true);
      }
      const net = goods - discount;
      const free = net >= FREE_SHIPPING_OVER;
      const remaining = free ? 0 : FREE_SHIPPING_OVER - net;
      if (grams > MAX_PARCEL_GRAMS) tooHeavy = true;
      if (!input.province) {
        return group(
          seller,
          lines,
          goods,
          discount,
          grams,
          free ? 0 : null,
          free ? "free" : "standard",
          remaining,
          null,
          true,
        );
      }
      const fee = free ? 0 : (standardFee(input.province, grams, input.store) ?? null);
      return group(
        seller,
        lines,
        goods,
        discount,
        grams,
        fee,
        free ? "free" : "standard",
        remaining,
        deliveryWindow(input.now, STANDARD_DAYS),
        true,
      );
    }
    const profile = sellerBySlug(seller);
    return group(
      seller,
      lines,
      goods,
      discount,
      grams,
      profile?.ship_fee ?? 0,
      "seller",
      null,
      input.province && profile ? deliveryWindow(input.now, profile.ship_days) : null,
      profile?.cod_enabled ?? false,
    );
  });

  const subtotal = groups.reduce((sum, g) => sum + g.goods, 0);
  const discount = groups.reduce((sum, g) => sum + g.discount, 0);
  const shipping = groups.reduce((sum, g) => sum + (g.shipping ?? 0), 0);
  const own = groups.find((g) => g.seller === null);
  const pointsCap =
    input.balance === null || !own
      ? 0
      : Math.min(
          input.balance,
          Math.floor(
            ((own.goods - own.discount + (own.shipping ?? 0)) * LOYALTY.max_redeem_ratio_bp) /
              10_000 /
              LOYALTY.point_value,
          ),
        );
  const pointsUsed =
    input.points >= LOYALTY.min_redeem_points && input.points <= pointsCap ? input.points : 0;
  const pointsValue = pointsUsed * LOYALTY.point_value;
  const total = subtotal - discount + shipping - pointsValue;
  const vat = groups.reduce(
    (sum, g) =>
      sum + g.lines.reduce((s, l) => s + vatIncluded(l.amount - l.discount, vatPercent), 0),
    0,
  );
  return {
    groups,
    subtotal,
    discount,
    shipping,
    shipping_known: groups.every((g) => g.shipping !== null),
    points_used: pointsUsed,
    points_value: pointsValue,
    points_cap: pointsCap,
    total,
    vat_percent: vatPercent,
    vat,
    code: input.code && codeStatus ? { code: input.code.toUpperCase(), status: codeStatus } : null,
    cod_available: groups.length > 0 && groups.every((g) => g.cod),
    too_heavy: tooHeavy && input.delivery === "ship",
  };
}

function group(
  seller: string | null,
  lines: QuoteLine[],
  goods: number,
  discount: number,
  grams: number,
  shipping: number | null,
  kind: QuoteGroup["shipping_kind"],
  freeRemaining: number | null,
  eta: [string, string] | null,
  cod: boolean,
): QuoteGroup {
  return {
    seller,
    lines,
    goods,
    discount,
    shipping,
    shipping_kind: kind,
    free_remaining: freeRemaining,
    eta,
    grams,
    cod,
    total: goods - discount + (shipping ?? 0),
  };
}

// ---------------------------------------------------------------- Form đặt hàng

export interface CheckoutForm {
  name: string;
  phone: string;
  email: string;
  delivery: DeliveryMethod;
  pickup_store: string;
  province: string;
  ward: string;
  /** Tên tỉnh, phường người mua thấy lúc đặt (danh mục của core); trống thì tra danh sách mẫu. */
  province_name?: string;
  ward_name?: string;
  street: string;
  payment: PaymentMethod | "";
  points: number;
  invoice: boolean;
  tax_code: string;
  company: string;
  terms: boolean;
  marketing: boolean;
}

export const EMPTY_FORM: CheckoutForm = {
  name: "",
  phone: "",
  email: "",
  delivery: "ship",
  pickup_store: "",
  province: "",
  ward: "",
  street: "",
  payment: "",
  points: 0,
  invoice: false,
  tax_code: "",
  company: "",
  terms: false,
  marketing: false,
};

/**
 * Một lỗi của một trường, như `errors[]` của Problem `validation_failed` của core: `field` là tên ô,
 * `code` là mã ổn định (giao diện dịch ở `checkout.errors.<code>`), `params` điền vào câu.
 */
export interface FieldError {
  field: string;
  code: string;
  params?: Record<string, number | string>;
}

export const PHONE = /^0\d{9}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** MST doanh nghiệp 10 số, 10 số kèm 3 số chi nhánh, hay số định danh cá nhân 12 số. */
const TAX_CODE = /^(\d{10}(-?\d{3})?|\d{12})$/;

export function normalizePhone(value: string): string {
  return value.replace(/[\s.-]/g, "");
}

/** Có hàng phải giao tới địa chỉ không (hàng người bán luôn giao; hàng Bếp Mộc khi chọn giao). */
export function needsAddress(quote: Quote, delivery: DeliveryMethod): boolean {
  return quote.groups.some((g) => g.seller !== null || delivery === "ship");
}

/** Bước "Giao hàng": người nhận, cách nhận, địa chỉ. Trả mọi lỗi một lần. */
export function validateDelivery(form: CheckoutForm, quote: Quote): FieldError[] {
  const errors: FieldError[] = [];
  if (!form.name.trim()) errors.push({ field: "name", code: "name_required" });
  if (!PHONE.test(normalizePhone(form.phone)))
    errors.push({ field: "phone", code: "phone_invalid" });
  if (form.email.trim() && !EMAIL.test(form.email.trim()))
    errors.push({ field: "email", code: "email_invalid" });
  const own = quote.groups.some((g) => g.seller === null);
  if (own && form.delivery === "pickup") {
    const store = STORE_PICKUP.find((code) => code === form.pickup_store);
    if (!store) errors.push({ field: "pickup_store", code: "pickup_store_required" });
  }
  if (needsAddress(quote, form.delivery)) {
    if (!form.province) errors.push({ field: "province", code: "province_required" });
    if (!form.ward) errors.push({ field: "ward", code: "ward_required" });
    if (!form.street.trim()) errors.push({ field: "street", code: "street_required" });
  }
  if (quote.too_heavy) errors.push({ field: "delivery", code: "too_heavy" });
  return errors;
}

/** Bước "Thanh toán": cách trả, điểm, hoá đơn công ty, điều khoản. */
export function validatePayment(
  form: CheckoutForm,
  quote: Quote,
  balance: number | null,
): FieldError[] {
  const errors: FieldError[] = [];
  if (!form.payment) errors.push({ field: "payment", code: "payment_required" });
  else if (form.payment === "cod" && !quote.cod_available)
    errors.push({ field: "payment", code: "cod_unavailable" });
  if (form.points > 0) {
    if (balance === null) errors.push({ field: "points", code: "points_sign_in" });
    else if (form.points < LOYALTY.min_redeem_points)
      errors.push({
        field: "points",
        code: "points_below_min",
        params: { min: LOYALTY.min_redeem_points },
      });
    else if (form.points > balance)
      errors.push({ field: "points", code: "points_over_balance", params: { balance } });
    else if (form.points > quote.points_cap)
      errors.push({ field: "points", code: "points_over_cap", params: { cap: quote.points_cap } });
  }
  if (form.invoice) {
    if (!TAX_CODE.test(form.tax_code.trim()))
      errors.push({ field: "tax_code", code: "tax_code_invalid" });
    if (!form.email.trim()) errors.push({ field: "email", code: "email_required_invoice" });
    else if (!EMAIL.test(form.email.trim())) errors.push({ field: "email", code: "email_invalid" });
  }
  if (!form.terms) errors.push({ field: "terms", code: "terms_required" });
  return errors;
}

/** Kiểm cả form (lúc đặt hàng): giỏ trống, rồi mọi lỗi của hai bước, mỗi trường một lỗi. */
export function validateCheckout(
  form: CheckoutForm,
  quote: Quote,
  balance: number | null,
): FieldError[] {
  if (quote.groups.length === 0) return [{ field: "lines", code: "cart_empty" }];
  const all = [...validateDelivery(form, quote), ...validatePayment(form, quote, balance)];
  const seen = new Set<string>();
  const errors: FieldError[] = [];
  for (const error of all) {
    if (seen.has(error.field)) continue;
    seen.add(error.field);
    errors.push(error);
  }
  return errors;
}

/** Cửa hàng nhận hàng tại chỗ (`shipping_pickup_points`): cửa hàng có `pickup`. */
export const STORE_PICKUP: readonly StoreCode[] = (["q3", "td", "cg"] as const).filter(
  (code) => storeByCode(code).pickup,
);

/** Đọc form gửi lên (Server Action); giá trị lạ thành rỗng. */
export function readCheckoutForm(form: FormData): CheckoutForm {
  const str = (key: string, max = 200) => String(form.get(key) ?? "").slice(0, max);
  const payment = str("payment");
  const points = Number.parseInt(str("points", 9).replace(/\D/g, ""), 10);
  return {
    name: str("name"),
    phone: str("phone", 30),
    email: str("email"),
    delivery: str("delivery") === "pickup" ? "pickup" : "ship",
    pickup_store: str("pickup_store", 10),
    province: str("province", 10),
    ward: str("ward", 10),
    province_name: str("province_name"),
    ward_name: str("ward_name"),
    street: str("street"),
    payment: (PAYMENT_METHODS as readonly string[]).includes(payment)
      ? (payment as PaymentMethod)
      : "",
    points: Number.isFinite(points) ? points : 0,
    invoice: form.get("invoice") === "on",
    tax_code: str("tax_code", 20),
    company: str("company"),
    terms: form.get("terms") === "on",
    marketing: form.get("marketing") === "on",
  };
}
