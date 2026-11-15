// Lọc, sắp xếp và chia trang danh sách sản phẩm (trang danh mục, W-029). Hàm thuần: không biết dữ
// liệu đến từ đâu. Hôm nay trang danh mục đưa vào sản phẩm mẫu; khi core có
// `GET /api/v1/catalog/public/products?category&attr.<code>&price_min&price_max&sort&facets=true`
// (bước 41) thì core lọc, đếm và chia trang, website chỉ còn đọc tham số trên địa chỉ (`parseListing`)
// và dựng lại địa chỉ (`listingHref`) — hai hàm đó giữ nguyên.
//
// Tham số trên địa chỉ theo tên của core để đổi nguồn không đổi link: `material`, `stove` (thuộc
// tính, nhiều giá trị), `price` (khoảng giá đặt sẵn), `rating` (số sao tối thiểu), `seller` (`shop`:
// cửa hàng bán, `market`: người bán trên sàn), `in_store=1` (có sẵn ở cửa hàng đang chọn), `sort`,
// `cursor` (con trỏ trang, như mọi danh sách của core).

export const SORT_KEYS = [
  "best_selling",
  "rating",
  "price_asc",
  "price_desc",
  "discount",
  "newest",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** Khoảng giá đặt sẵn (VND), như chip "Khoảng giá" của bản thiết kế. */
export const PRICE_BANDS = [
  { id: "0-200000", min: 0, max: 200_000 },
  { id: "200000-500000", min: 200_000, max: 500_000 },
  { id: "500000-800000", min: 500_000, max: 800_000 },
  { id: "800000-", min: 800_000, max: null },
] as const;
export type PriceBandId = (typeof PRICE_BANDS)[number]["id"];

export const SELLER_KINDS = ["shop", "market"] as const;
export type SellerKind = (typeof SELLER_KINDS)[number];

/** Số sao tối thiểu chọn được. */
export const RATING_STEPS = [4.5, 4.7] as const;

/** Số sản phẩm một trang: chia hết cho 4, 3, 2 (lưới 4 / 3 / 2 cột) — không thẻ lẻ ở trang đầy. */
export const PAGE_SIZE = 12;

export interface ListingFilter {
  material: string[];
  stove: string[];
  price: PriceBandId | null;
  rating: number | null;
  seller: SellerKind[];
  inStore: boolean;
  sort: SortKey;
  cursor: string | null;
}

/** Một dòng để lọc: chỉ những gì bộ lọc và cách sắp cần. */
export interface ListingItem {
  id: string;
  price: number;
  /** Phần giảm (basis point) lớn nhất đang áp được: giá tự giảm hay mã công khai. */
  discountBp: number;
  rating: number;
  /** Thứ hạng bán chạy (nhỏ = bán chạy hơn). */
  rank: number;
  /** `YYYY-MM-DD`. */
  addedOn: string;
  material: readonly string[];
  stove: readonly string[];
  seller: SellerKind;
  inStore: boolean;
}

type Params = Record<string, string | string[] | undefined>;

function all(params: Params, key: string): string[] {
  const value = params[key];
  const list = Array.isArray(value) ? value : value === undefined ? [] : [value];
  // Cả hai cách viết: `material=wood&material=cast_iron` (form GET) và `material=wood,cast_iron`.
  return [...new Set(list.flatMap((item) => item.split(",")).map((item) => item.trim()))].filter(
    (item) => /^[a-z0-9_]{1,40}$/.test(item),
  );
}

function one(params: Params, key: string): string | null {
  const value = params[key];
  const first = Array.isArray(value) ? value[0] : value;
  return first === undefined || first === "" ? null : first;
}

/** Đọc bộ lọc từ tham số trên địa chỉ. Giá trị lạ bị bỏ (không lỗi): link cũ, link sửa tay vẫn mở. */
export function parseListing(params: Params): ListingFilter {
  const sort = one(params, "sort");
  const price = one(params, "price");
  const rating = Number(one(params, "rating"));
  const cursor = one(params, "cursor");
  return {
    material: all(params, "material"),
    stove: all(params, "stove"),
    price: PRICE_BANDS.some((band) => band.id === price) ? (price as PriceBandId) : null,
    rating: (RATING_STEPS as readonly number[]).includes(rating) ? rating : null,
    seller: all(params, "seller").filter((s): s is SellerKind =>
      (SELLER_KINDS as readonly string[]).includes(s),
    ),
    inStore: one(params, "in_store") === "1",
    sort: (SORT_KEYS as readonly string[]).includes(sort ?? "")
      ? (sort as SortKey)
      : "best_selling",
    cursor: cursor && /^[A-Za-z0-9_-]{1,64}$/.test(cursor) ? cursor : null,
  };
}

/** Có bộ lọc nào đang bật không (không tính cách sắp và trang). */
export function hasFilters(filter: ListingFilter): boolean {
  return (
    filter.material.length > 0 ||
    filter.stove.length > 0 ||
    filter.price !== null ||
    filter.rating !== null ||
    filter.seller.length > 0 ||
    filter.inStore
  );
}

/** Chuỗi truy vấn của bộ lọc (bỏ giá trị mặc định), thứ tự cố định để link không lặp kiểu khác. */
export function listingQuery(filter: ListingFilter): string {
  const query = new URLSearchParams();
  for (const value of filter.material) query.append("material", value);
  for (const value of filter.stove) query.append("stove", value);
  if (filter.price) query.set("price", filter.price);
  if (filter.rating !== null) query.set("rating", String(filter.rating));
  for (const value of filter.seller) query.append("seller", value);
  if (filter.inStore) query.set("in_store", "1");
  if (filter.sort !== "best_selling") query.set("sort", filter.sort);
  if (filter.cursor) query.set("cursor", filter.cursor);
  return query.toString();
}

/** Đường dẫn của trang danh sách với bộ lọc đã đổi; đổi bộ lọc thì về trang đầu. */
export function listingHref(
  path: string,
  filter: ListingFilter,
  change: Partial<ListingFilter> = {},
): string {
  const next = { ...filter, cursor: null, ...change };
  const query = listingQuery(next);
  return query ? `${path}?${query}` : path;
}

function inBand(price: number, id: PriceBandId): boolean {
  const band = PRICE_BANDS.find((b) => b.id === id);
  if (!band) return true;
  return price >= band.min && (band.max === null || price < band.max);
}

/** Khớp bộ lọc; `skip` bỏ qua một nhóm (để đếm số của chính nhóm đó, như facet của core). */
function matches(item: ListingItem, filter: ListingFilter, skip?: keyof ListingFilter): boolean {
  if (skip !== "material" && filter.material.length > 0) {
    if (!filter.material.some((m) => item.material.includes(m))) return false;
  }
  // Loại bếp: chọn nhiều thì phải dùng được trên mọi loại đã chọn.
  if (skip !== "stove" && !filter.stove.every((s) => item.stove.includes(s))) return false;
  if (skip !== "price" && filter.price && !inBand(item.price, filter.price)) return false;
  if (skip !== "rating" && filter.rating !== null && item.rating < filter.rating) return false;
  if (skip !== "seller" && filter.seller.length > 0 && !filter.seller.includes(item.seller)) {
    return false;
  }
  if (skip !== "inStore" && filter.inStore && !item.inStore) return false;
  return true;
}

const COMPARE: Record<SortKey, (a: ListingItem, b: ListingItem) => number> = {
  best_selling: (a, b) => a.rank - b.rank,
  rating: (a, b) => b.rating - a.rating || a.rank - b.rank,
  price_asc: (a, b) => a.price - b.price || a.rank - b.rank,
  price_desc: (a, b) => b.price - a.price || a.rank - b.rank,
  discount: (a, b) => b.discountBp - a.discountBp || a.rank - b.rank,
  newest: (a, b) => b.addedOn.localeCompare(a.addedOn) || a.rank - b.rank,
};

/** Lọc rồi sắp (không chia trang). */
export function applyListing<T extends ListingItem>(items: readonly T[], filter: ListingFilter) {
  return items.filter((item) => matches(item, filter)).sort(COMPARE[filter.sort]);
}

/** Số sản phẩm khớp cho từng giá trị của một nhóm lọc, khi giữ nguyên các nhóm khác. */
export function facetCounts(
  items: readonly ListingItem[],
  filter: ListingFilter,
  group: "material" | "stove" | "price" | "rating" | "seller" | "inStore",
): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const item of items) {
    if (!matches(item, filter, group)) continue;
    if (group === "material") item.material.forEach(add);
    else if (group === "stove") item.stove.forEach(add);
    else if (group === "seller") add(item.seller);
    else if (group === "inStore") {
      if (item.inStore) add("1");
    } else if (group === "price") {
      for (const band of PRICE_BANDS) if (inBand(item.price, band.id)) add(band.id);
    } else {
      for (const step of RATING_STEPS) if (item.rating >= step) add(String(step));
    }
  }
  return counts;
}

/** Con trỏ trang mẫu: vị trí bắt đầu, mã hoá như chuỗi mờ (core trả con trỏ thật). */
export function encodeCursor(offset: number): string {
  return btoa(`o${offset}`).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function decodeCursor(cursor: string | null): number {
  if (!cursor) return 0;
  try {
    const raw = atob(cursor.replace(/-/g, "+").replace(/_/g, "/"));
    const offset = Number(raw.slice(1));
    return raw.startsWith("o") && Number.isInteger(offset) && offset >= 0 ? offset : 0;
  } catch {
    return 0;
  }
}

export interface ListingPage<T> {
  items: T[];
  total: number;
  /** Vị trí (bắt đầu từ 1) của thẻ đầu và cuối trên trang này. */
  from: number;
  to: number;
  next: string | null;
}

/** Một trang của danh sách đã lọc, như `Page<T>` của core (con trỏ trang sau). */
export function paginate<T>(
  items: readonly T[],
  cursor: string | null,
  size = PAGE_SIZE,
): ListingPage<T> {
  const start = Math.min(decodeCursor(cursor), Math.max(0, items.length - 1));
  const page = items.slice(start, start + size);
  const end = start + page.length;
  return {
    items: page,
    total: items.length,
    from: page.length > 0 ? start + 1 : 0,
    to: end,
    next: end < items.length ? encodeCursor(end) : null,
  };
}
