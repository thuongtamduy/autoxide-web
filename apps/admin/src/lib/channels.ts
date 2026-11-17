// Phần dùng chung (không đọc dữ liệu) của màn Kênh bán: permission dự kiến của đặc tả 48
// (`docs/steps/48-channels.md` của core). Hàm thuần, chạy được ở cả máy chủ và trình duyệt.

import { fold } from "./fold";

export const CHANNELS_READ = "channels.read";
export const CHANNELS_MANAGE = "channels.manage";
export const CHANNELS_ORDERS_MANAGE = "channels.orders.manage";
export const CHANNELS_FINANCE_READ = "channels.finance.read";
export const CHANNELS_FINANCE_MANAGE = "channels.finance.manage";
/** Báo cáo theo kênh cần thêm quyền đọc báo cáo của `orders` (đặc tả 48). */
export const ORDERS_REPORTS_READ = "orders.reports.read";

/** Phần vạn thành phần trăm để hiện (`800` → "8"; `-250` → "−2,5" theo dấu thập phân của ngôn ngữ). */
export function percentText(bp: number, locale: string): string {
  const value = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    Math.abs(bp) / 100,
  );
  return bp < 0 ? `−${value}` : value;
}

// ---------------------------------------------------------------- Tin đăng gom theo sản phẩm

/**
 * Trạng thái gộp của một sản phẩm trên một tài khoản kênh (chip trên dòng và bộ lọc): "live" đang
 * bán, "error" kênh từ chối hay đẩy lỗi, "pending" đang đăng, "off" chưa đăng (bản nháp, đã gỡ hay
 * chưa gắn mã).
 */
export type ChannelState = "live" | "error" | "pending" | "off";
export const CHANNEL_STATES: readonly ChannelState[] = ["live", "error", "pending", "off"];

export function channelState(status: string | null): ChannelState {
  if (status === "live") return "live";
  if (status === "error" || status === "rejected") return "error";
  if (status === "pending") return "pending";
  return "off";
}

/** Phần của một liên kết mà việc gom nhóm cần (kiểu đầy đủ ở dữ liệu mẫu, sau này ở SDK). */
export interface ListingLike {
  account_id: string;
  account_name: string;
  kind: string;
  variant_id: string;
  sku: string;
  name: string;
  external_sku: string;
  status: string;
}

export interface SlotAccount {
  id: string;
  name: string;
  kind: string;
}

/** Một ô "sản phẩm × tài khoản": `listing` rỗng khi sản phẩm chưa gắn mã trên tài khoản đó. */
export interface ChannelSlot<L extends ListingLike> {
  account: SlotAccount;
  listing: L | null;
  state: ChannelState;
}

export interface ProductListings<L extends ListingLike> {
  variant_id: string;
  sku: string;
  name: string;
  /** Mỗi tài khoản một ô, theo thứ tự `accounts`. */
  slots: ChannelSlot<L>[];
}

/**
 * Gom liên kết theo sản phẩm (biến thể): mỗi sản phẩm một dòng, mỗi tài khoản kênh một ô. Tài khoản
 * không nằm trong `accounts` (đã ngắt, kênh chưa mở) mà vẫn còn liên kết thì thêm vào cuối, để không
 * mất liên kết nào. Sản phẩm xếp theo tên.
 */
export function groupListings<L extends ListingLike>(
  listings: readonly L[],
  accounts: readonly SlotAccount[],
): ProductListings<L>[] {
  const order: SlotAccount[] = accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind }));
  for (const l of listings) {
    if (!order.some((a) => a.id === l.account_id)) {
      order.push({ id: l.account_id, name: l.account_name, kind: l.kind });
    }
  }
  const byProduct = new Map<string, L[]>();
  for (const l of listings) {
    const list = byProduct.get(l.variant_id) ?? [];
    list.push(l);
    byProduct.set(l.variant_id, list);
  }
  return [...byProduct.values()]
    .map((list) => {
      const first = list[0] as L;
      return {
        variant_id: first.variant_id,
        sku: first.sku,
        name: first.name,
        slots: order.map((account) => {
          const listing = list.find((l) => l.account_id === account.id) ?? null;
          return { account, listing, state: channelState(listing?.status ?? null) };
        }),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "vi") || a.sku.localeCompare(b.sku));
}

export interface ListingFilter {
  /** Chữ tìm: tên, SKU hay mã trên kênh (không dấu, không phân biệt hoa thường). */
  q?: string;
  account?: string;
  state?: ChannelState | null;
}

/**
 * Sản phẩm có khớp bộ lọc không. Có tài khoản mà không chọn trạng thái: sản phẩm đã gắn mã trên tài
 * khoản đó. Có trạng thái: ít nhất một ô (trong tài khoản đã chọn, nếu có) ở trạng thái đó — "chưa
 * đăng" tính cả tài khoản chưa gắn mã, để tìm chỗ còn trống.
 */
export function matchesListing<L extends ListingLike>(
  product: ProductListings<L>,
  filter: ListingFilter,
): boolean {
  const q = fold(filter.q ?? "");
  if (q) {
    const texts = [
      product.name,
      product.sku,
      ...product.slots.map((s) => s.listing?.external_sku ?? ""),
    ];
    if (!texts.some((x) => fold(x).includes(q))) return false;
  }
  if (!filter.account && !filter.state) return true;
  return product.slots.some(
    (s) =>
      (!filter.account || s.account.id === filter.account) &&
      (filter.state ? s.state === filter.state : s.listing !== null),
  );
}

/**
 * Số sản phẩm cho bộ lọc: theo từng trạng thái (giữ chữ tìm và tài khoản đang chọn) và theo từng
 * tài khoản (giữ chữ tìm và trạng thái đang chọn) — số đếm luôn khớp kết quả khi bấm vào.
 */
export function listingCounts<L extends ListingLike>(
  products: readonly ProductListings<L>[],
  filter: ListingFilter,
): { all: number; states: Record<ChannelState, number>; accounts: Record<string, number> } {
  const count = (f: ListingFilter) => products.filter((p) => matchesListing(p, f)).length;
  const states = Object.fromEntries(
    CHANNEL_STATES.map((s) => [s, count({ ...filter, state: s })]),
  ) as Record<ChannelState, number>;
  const accounts: Record<string, number> = {};
  for (const slot of products[0]?.slots ?? []) {
    accounts[slot.account.id] = count({ ...filter, account: slot.account.id });
  }
  return { all: count({ ...filter, state: null }), states, accounts };
}

/** Cắt một trang (đánh số từ 1); số trang ngoài khoảng thì về trang gần nhất. */
export function pageOf<T>(
  items: readonly T[],
  page: number,
  size: number,
): { items: T[]; page: number; pages: number; from: number; to: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(pages, Math.max(1, Number.isFinite(page) ? Math.trunc(page) : 1));
  const start = (current - 1) * size;
  const slice = items.slice(start, start + size);
  return {
    items: slice,
    page: current,
    pages,
    from: slice.length > 0 ? start + 1 : 0,
    to: start + slice.length,
  };
}
