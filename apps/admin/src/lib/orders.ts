// Phần dùng chung (không đọc dữ liệu) của hai màn Đơn hàng và Cửa hàng: permission dự kiến của đặc tả
// 45 (`docs/steps/45-orders.md` của core), bảng chuyển trạng thái, đọc / ghi bộ lọc của danh sách đơn
// trên địa chỉ trang. Hàm thuần, chạy được ở cả máy chủ và trình duyệt (có test).

// Permission của module `orders`, đúng tên đặc tả 45 (mục "Permission").
export const ORDERS_READ = "orders.read";
export const ORDERS_MANAGE = "orders.manage";
export const ORDERS_REFUND = "orders.refund";
export const ORDERS_RETURNS_MANAGE = "orders.returns.manage";
export const ORDERS_POS_SELL = "orders.pos.sell";
export const ORDERS_POS_SHIFT = "orders.pos.shift";
export const ORDERS_REVIEWS_MODERATE = "orders.reviews.moderate";

/**
 * Trạng thái đơn của đặc tả 45, cộng `awaiting_acceptance` (dự kiến: "chờ cửa hàng / người bán nhận
 * đơn" khi chính sách `acceptance_hours > 0`, mục H2 của `docs/prompts/ui-trace-roadmap.md`).
 */
export const ORDER_STATUSES = [
  "pending_payment",
  "awaiting_acceptance",
  "confirmed",
  "preparing",
  "shipping",
  "delivered",
  "delivery_failed",
  "completed",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** "Chờ xử lý": đơn cửa hàng còn phải làm (nhận đơn, chuẩn bị) — số ở đầu trang và menu. */
export const PENDING_STATUSES: readonly OrderStatus[] = [
  "awaiting_acceptance",
  "confirmed",
  "preparing",
];
/** "Chưa giao": đã nhận tiền hoặc COD, hàng chưa tới tay người mua. */
export const UNDELIVERED_STATUSES: readonly OrderStatus[] = [
  "confirmed",
  "preparing",
  "shipping",
  "delivery_failed",
];

/**
 * Bảng chuyển hợp lệ (bảng "Máy trạng thái đơn" của đặc tả 45; thêm nhánh `awaiting_acceptance`).
 * Chuyển khác → 409 `orders.invalid_transition`.
 */
export const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending_payment: ["awaiting_acceptance", "confirmed", "cancelled"],
  awaiting_acceptance: ["confirmed", "cancelled"],
  confirmed: ["preparing", "delivered", "cancelled"],
  preparing: ["shipping", "delivered", "cancelled"],
  shipping: ["delivered", "delivery_failed"],
  delivery_failed: ["shipping", "cancelled"],
  delivered: ["completed"],
  completed: [],
  cancelled: [],
};

export function canMove(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Kênh của đơn; `shopee`, `tiktok_shop` là đơn nhập từ kênh bán ngoài (bước 48, W-019). */
export const CHANNELS = ["web", "pos", "marketplace", "shopee", "tiktok_shop"] as const;
export type Channel = (typeof CHANNELS)[number];

/**
 * Dòng tiền của một đơn, gộp từ chế độ dòng tiền (`funds_flow`) và cách trả: tự thu qua cổng / VietQR,
 * thu hộ qua đối tác có giấy phép (sàn), thu khi giao (COD), tiền mặt tại quầy. Không có dòng nào
 * để tiền nằm ở nền tảng (D-187 của core).
 */
export const FLOWS = ["self", "partner", "cod", "cash"] as const;
export type Flow = (typeof FLOWS)[number];

export const PAYMENT_STATUSES = [
  "unpaid",
  "cod_pending",
  "paid",
  "partially_refunded",
  "refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Bộ lọc của danh sách đơn (tham số `GET /api/v1/orders` của đặc tả 45, cộng `flow` dự kiến). */
export interface OrderFilters {
  status: OrderStatus[];
  channel: Channel | null;
  org: string | null;
  flow: Flow | null;
  pay: PaymentStatus | null;
  /** Ngày đặt từ (gồm), `YYYY-MM-DD` giờ Việt Nam. */
  from: string | null;
  q: string;
}

export const NO_FILTERS: OrderFilters = {
  status: [],
  channel: null,
  org: null,
  flow: null,
  pay: null,
  from: null,
  q: "",
};

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, name: string): string {
  const value = params[name];
  return typeof value === "string" ? value : "";
}

function member<T extends string>(list: readonly T[], value: string): T | null {
  return (list as readonly string[]).includes(value) ? (value as T) : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Đọc bộ lọc từ địa chỉ trang; giá trị lạ bị bỏ (không báo lỗi, như bộ lọc của core). */
export function readFilters(params: Params): OrderFilters {
  const status = one(params, "status")
    .split(",")
    .map((s) => member(ORDER_STATUSES, s.trim()))
    .filter((s): s is OrderStatus => s !== null);
  const org = one(params, "org");
  const from = one(params, "from");
  return {
    status: ORDER_STATUSES.filter((s) => status.includes(s)),
    channel: member(CHANNELS, one(params, "channel")),
    org: UUID.test(org) ? org : null,
    flow: member(FLOWS, one(params, "flow")),
    pay: member(PAYMENT_STATUSES, one(params, "pay")),
    from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null,
    q: one(params, "q").trim().slice(0, 60),
  };
}

/** Bộ lọc thành chuỗi truy vấn, khoá theo thứ tự cố định (để so hai bộ lọc và lưu view). */
export function filterQuery(filters: OrderFilters): string {
  const out = new URLSearchParams();
  if (filters.status.length > 0) out.set("status", filters.status.join(","));
  if (filters.channel) out.set("channel", filters.channel);
  if (filters.org) out.set("org", filters.org);
  if (filters.flow) out.set("flow", filters.flow);
  if (filters.pay) out.set("pay", filters.pay);
  if (filters.from) out.set("from", filters.from);
  if (filters.q) out.set("q", filters.q);
  return out.toString();
}

/** Địa chỉ danh sách đơn với bộ lọc (và tham số khác, vd con trỏ). */
export function ordersHref(filters: OrderFilters, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams(filterQuery(filters));
  for (const [key, value] of Object.entries(extra)) if (value) query.set(key, value);
  const text = query.toString();
  return text ? `/sales/orders?${text}` : "/sales/orders";
}

/** Đang lọc gì không (ngoài "tất cả"). */
export function hasFilters(filters: OrderFilters): boolean {
  return filterQuery(filters) !== "";
}

/** Bỏ một tham số khỏi bộ lọc (nút × trên chip "Đang lọc"). */
export function without(filters: OrderFilters, key: keyof OrderFilters): OrderFilters {
  return { ...filters, [key]: NO_FILTERS[key] };
}

/** Số tiền gõ tay (đồng, số nguyên, cho phép dấu chấm / phẩy / khoảng trắng ngăn nghìn). */
export function parseDong(text: string): number | null {
  const clean = text.replace(/[\s.,₫]/g, "");
  if (!/^\d{1,12}$/.test(clean)) return null;
  return Number(clean);
}
