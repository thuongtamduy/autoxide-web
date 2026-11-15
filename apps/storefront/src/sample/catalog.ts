// Sản phẩm, giá, danh mục, cửa hàng và tồn theo cửa hàng — mẫu cho website (W-026).
//
// Thay bằng (khi core có):
// - `GET /api/v1/catalog/public/products`, `/products/{slug}`, `/categories` (bước 41);
// - `GET /api/v1/inventory/public/availability?variant_ids&org_id` (bước 42, mục D-200);
// - `GET /api/v1/promotions/public/prices` — giá khi áp mã cho từng sản phẩm (bước 43, mục D-200);
// - `GET /api/v1/org/public/stores` — hồ sơ công khai của cửa hàng (bước 34, mục D-200).
//
// Nguồn: `apps/admin/src/sample/catalog.ts` (sản phẩm đang bán `active`, SKU, tên, giá bán lẻ quý 4,
// danh mục), `inventory.ts` (tồn ở CN Quận 3, Thủ Đức, Cầu Giấy: `on_hand − reserved`), `org.ts`
// (cửa hàng, giờ mở cửa), `promotions.ts` (mã BEPMOC10: −10% chảo gang 26 và 28 cm). Điểm đánh giá
// và số lượt đánh giá chỉ có ở website (đánh giá là bước 45).
import type { ArtName, Tone } from "@/components/icon";
import { fold, matchRank } from "@/lib/fold";
import { type Localized, text, uid } from "./index";

const L = (vi: string, en: string): Localized => ({ vi, en });

// ---------------------------------------------------------------- Danh mục

export interface SampleCategory {
  id: string;
  parent_id: string | null;
  names: Localized;
  /** Slug theo ngôn ngữ, như `slugs` của trang quản trị (`<slug>-en` cho tiếng Anh). */
  slugs: Localized;
  art: ArtName;
  tone: Tone;
}

/** ID danh mục, như `CATEGORY_ID` của trang quản trị. */
export const CATEGORY_ID = {
  kitchen: uid("c3", 1),
  pans: uid("c3", 2),
  pots: uid("c3", 3),
  knives: uid("c3", 4),
  tableware: uid("c3", 5),
  ceramics: uid("c3", 6),
  care: uid("c3", 7),
  food: uid("c3", 8),
  spices: uid("c3", 9),
  storage: uid("c3", 10),
  textiles: uid("c3", 11),
} as const;

const C = CATEGORY_ID;
const cat = (
  id: string,
  parent: string | null,
  vi: string,
  en: string,
  slug: string,
  art: ArtName,
  tone: Tone,
): SampleCategory => ({
  id,
  parent_id: parent,
  names: L(vi, en),
  slugs: L(slug, `${slug}-en`),
  art,
  tone,
});

export const CATEGORIES: readonly SampleCategory[] = [
  cat(C.kitchen, null, "Bếp", "Kitchen", "bep", "pan", "t1"),
  cat(C.pans, C.kitchen, "Chảo", "Pans", "chao", "pan", "t1"),
  cat(C.pots, C.kitchen, "Nồi", "Pots", "noi", "pot", "t3"),
  cat(C.knives, null, "Dao và thớt", "Knives and boards", "dao-va-thot", "knife", "t2"),
  cat(C.tableware, null, "Bát đĩa", "Tableware", "bat-dia", "bowl", "t4"),
  cat(C.ceramics, C.tableware, "Gốm sứ", "Ceramics", "gom-su", "bowl", "t4"),
  cat(C.care, null, "Chăm sóc bếp", "Kitchen care", "cham-soc-bep", "bottle", "t2"),
  cat(C.food, null, "Thực phẩm", "Food", "thuc-pham", "jar", "t5"),
  cat(C.spices, C.food, "Gia vị", "Spices", "gia-vi", "jar", "t5"),
  cat(C.storage, null, "Hộp đựng thực phẩm", "Food storage", "hop-dung-thuc-pham", "glass", "t3"),
  cat(C.textiles, null, "Khăn và vải bếp", "Kitchen textiles", "khan-va-vai-bep", "towel", "t5"),
];

export function categoryById(id: string): SampleCategory | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

/** Danh mục theo slug của một ngôn ngữ (slug của ngôn ngữ kia cũng nhận, để link cũ còn mở được). */
export function categoryBySlug(slug: string): SampleCategory | undefined {
  return CATEGORIES.find((c) => c.slugs.vi === slug || c.slugs.en === slug);
}

/** `id` và mọi danh mục con cháu của nó. */
export function categoryTree(id: string): string[] {
  const children = CATEGORIES.filter((c) => c.parent_id === id).flatMap((c) => categoryTree(c.id));
  return [id, ...children];
}

// ---------------------------------------------------------------- Sản phẩm

export interface SampleVariant {
  id: string;
  sku: string;
  /** Nhãn của tuỳ chọn ("26 cm", "Xanh"); trống khi sản phẩm một biến thể. */
  labels: Localized | null;
  /** Giá bán lẻ đang hiệu lực, VND (số nguyên). */
  price: number;
}

export interface SampleProduct {
  id: string;
  key: string;
  names: Localized;
  slugs: Localized;
  category_id: string;
  variants: SampleVariant[];
  /** Biến thể hiện ở thẻ sản phẩm (giá, mã giảm). */
  default_sku: string;
  art: ArtName;
  tone: Tone;
  rating: number;
  reviews: number;
  /** Nhãn góc ảnh: `new` = "Mới". Nhãn giảm giá tự có khi có mã áp được. */
  flag: "new" | null;
}

/** Mã giảm giá công khai đang chạy (bước 43): áp cho các SKU, giảm theo basis point. */
export interface SampleCoupon {
  code: string;
  skus: string[];
  /** 1000 = 10%. */
  value_bp: number;
  /** Hết hạn (giờ Việt Nam), `YYYY-MM-DD`. */
  ends_on: string;
  remaining: number;
  title: Localized;
  terms: Localized;
}

export const COUPON: SampleCoupon = {
  code: "BEPMOC10",
  skus: ["CG26", "CG28"],
  value_bp: 1000,
  ends_on: "2026-11-30",
  remaining: 732,
  title: L("Giảm 10% chảo gang với mã BEPMOC10", "10% off cast iron pans with code BEPMOC10"),
  terms: L(
    "Áp dụng cho chảo gang 26 cm và 28 cm, mỗi đơn một mã, không cộng với chương trình khác. Mức giảm tính trên giá bán ngay trước khuyến mại.",
    "For the 26 cm and 28 cm cast iron pans, one code per order, not combined with other offers. The discount applies to the price right before the promotion.",
  ),
};

const v = (n: number, sku: string, price: number, labels: Localized | null = null) => ({
  id: uid("c2", n),
  sku,
  labels,
  price,
});

const product = (
  n: number,
  key: string,
  vi: string,
  en: string,
  slug: string,
  category: string,
  variants: SampleVariant[],
  art: ArtName,
  tone: Tone,
  rating: number,
  reviews: number,
  extra: { default_sku?: string; flag?: "new" } = {},
): SampleProduct => ({
  id: uid("c1", n),
  key,
  names: L(vi, en),
  slugs: L(slug, `${slug}-en`),
  category_id: category,
  variants,
  default_sku: extra.default_sku ?? variants[0]?.sku ?? "",
  art,
  tone,
  rating,
  reviews,
  flag: extra.flag ?? null,
});

/** Sản phẩm đang bán (`active`) của trang quản trị, theo thứ tự "bán chạy". */
export const PRODUCTS: readonly SampleProduct[] = [
  product(
    1,
    "castIronPan",
    "Chảo gang",
    "Cast iron pan",
    "chao-gang",
    C.pans,
    [
      v(1, "CG24", 590_000, L("24 cm", "24 cm")),
      v(2, "CG26", 690_000, L("26 cm", "26 cm")),
      v(3, "CG28", 760_000, L("28 cm", "28 cm")),
    ],
    "pan",
    "t1",
    4.8,
    212,
    { default_sku: "CG26" },
  ),
  product(
    3,
    "knifeSet",
    "Bộ dao bếp 3 món",
    "Kitchen knife set, 3 pieces",
    "bo-dao-bep-3-mon",
    C.knives,
    [v(5, "DB3", 820_000)],
    "knife",
    "t2",
    4.9,
    154,
  ),
  product(
    2,
    "steelPot20",
    "Nồi inox 3 đáy 20 cm",
    "Tri-ply stainless pot 20 cm",
    "noi-inox-3-day-20",
    C.pots,
    [v(4, "NI20", 540_000)],
    "pot",
    "t3",
    4.7,
    98,
  ),
  product(
    12,
    "starterBundle",
    "Combo bếp mới",
    "New kitchen bundle",
    "combo-bep-moi",
    C.kitchen,
    [v(15, "COMBO1", 899_000)],
    "dutch",
    "t4",
    4.9,
    41,
    { flag: "new" },
  ),
  product(
    4,
    "tamarindBoard35",
    "Thớt gỗ me tây 35 cm",
    "Rain tree cutting board 35 cm",
    "thot-go-me-tay-35",
    C.knives,
    [v(6, "TG35", 260_000)],
    "board",
    "t5",
    4.6,
    301,
  ),
  product(
    6,
    "blueBowls",
    "Bát gốm men lam (bộ 6)",
    "Blue glaze ceramic bowls (set of 6)",
    "bat-gom-men-lam",
    C.ceramics,
    [v(8, "BG6", 420_000)],
    "bowl",
    "t4",
    4.8,
    63,
  ),
  product(
    5,
    "glassBox",
    "Hộp thuỷ tinh 1 lít (bộ 3)",
    "Glass food box 1 L (set of 3)",
    "hop-thuy-tinh-1-lit",
    C.storage,
    [v(7, "HT1L", 315_000)],
    "glass",
    "t3",
    4.5,
    77,
  ),
  product(
    7,
    "towels",
    "Khăn bếp cotton (bộ 4)",
    "Cotton kitchen towels (set of 4)",
    "khan-bep-cotton",
    C.textiles,
    [v(9, "KB4-XA", 99_000, L("Xanh", "Blue")), v(10, "KB4-BE", 99_000, L("Be", "Beige"))],
    "towel",
    "t5",
    4.7,
    120,
  ),
  product(
    8,
    "dishSoap",
    "Nước rửa chén hữu cơ 750 ml",
    "Organic dish soap 750 ml",
    "nuoc-rua-chen-huu-co",
    C.care,
    [v(11, "NRC750", 89_000)],
    "bottle",
    "t2",
    4.6,
    88,
  ),
  product(
    13,
    "shrimpSalt",
    "Muối tôm 200 g",
    "Shrimp salt 200 g",
    "muoi-tom-200g",
    C.spices,
    [v(16, "MT200", 45_000)],
    "jar",
    "t5",
    4.8,
    140,
  ),
  product(
    14,
    "tamarindBoard25",
    "Thớt gỗ me tây 25 cm",
    "Rain tree cutting board 25 cm",
    "thot-go-me-tay-25",
    C.knives,
    [v(17, "TG25", 190_000)],
    "board",
    "t5",
    4.6,
    57,
  ),
  product(
    15,
    "roundBoard30",
    "Thớt gỗ tròn 30 cm",
    "Round wooden board 30 cm",
    "thot-go-tron-30",
    C.knives,
    [v(18, "TGT30", 220_000)],
    "board",
    "t1",
    4.5,
    22,
  ),
];

export function productBySlug(slug: string): SampleProduct | undefined {
  return PRODUCTS.find((p) => p.slugs.vi === slug || p.slugs.en === slug);
}

export function productBySku(sku: string): SampleProduct | undefined {
  return PRODUCTS.find((p) => p.variants.some((variant) => variant.sku === sku));
}

export function variantBySku(sku: string): SampleVariant | undefined {
  return PRODUCTS.flatMap((p) => p.variants).find((variant) => variant.sku === sku);
}

/** Sản phẩm của một danh mục (kể cả danh mục con). */
export function productsInCategory(categoryId: string): SampleProduct[] {
  const ids = new Set(categoryTree(categoryId));
  return PRODUCTS.filter((p) => ids.has(p.category_id));
}

/** Giá sau mã giảm của một SKU, hay `null` khi mã không áp cho SKU đó. */
export function couponPrice(sku: string): number | null {
  const variant = variantBySku(sku);
  if (!variant || !COUPON.skus.includes(sku)) return null;
  return Math.round((variant.price * (10_000 - COUPON.value_bp)) / 10_000);
}

/** Tìm sản phẩm theo tên (bỏ dấu); khớp đúng dấu xếp trước. */
export function searchProducts(query: string, locale: string, limit = 8): SampleProduct[] {
  const q = fold(query);
  if (!q) return [];
  return PRODUCTS.filter((p) => fold(text(p.names, locale)).includes(q))
    .sort(
      (a, b) => matchRank(text(a.names, locale), query) - matchRank(text(b.names, locale), query),
    )
    .slice(0, limit);
}

// ---------------------------------------------------------------- Cửa hàng và tồn

export const STORE_CODES = ["q3", "td", "cg"] as const;
export type StoreCode = (typeof STORE_CODES)[number];

export function isStoreCode(value: unknown): value is StoreCode {
  return typeof value === "string" && (STORE_CODES as readonly string[]).includes(value);
}

export interface SampleStore {
  code: StoreCode;
  /** Nút tổ chức của `apps/admin/src/sample/org.ts`. */
  org_id: string;
  name: Localized;
  address: Localized;
  hours: string;
  pickup: boolean;
}

export const STORES: readonly SampleStore[] = [
  {
    code: "q3",
    org_id: "01a1e000-0000-7000-8000-000000000a03",
    name: L("CN Quận 3", "Quận 3 store"),
    address: L(
      "[Số nhà, đường mẫu], Phường Xuân Hoà, TP. Hồ Chí Minh",
      "[Sample street address], Xuân Hoà Ward, Ho Chi Minh City",
    ),
    hours: "08:00 – 21:00",
    pickup: true,
  },
  {
    code: "td",
    org_id: "01a1e000-0000-7000-8000-000000000a04",
    name: L("CN Thủ Đức", "Thủ Đức store"),
    address: L(
      "[Số nhà, đường mẫu], Phường Thủ Đức, TP. Hồ Chí Minh",
      "[Sample street address], Thủ Đức Ward, Ho Chi Minh City",
    ),
    hours: "08:00 – 21:00",
    pickup: true,
  },
  {
    code: "cg",
    org_id: "01a1e000-0000-7000-8000-000000000a06",
    name: L("CN Cầu Giấy", "Cầu Giấy store"),
    address: L(
      "[Số nhà, đường mẫu], Phường Cầu Giấy, Hà Nội",
      "[Sample street address], Cầu Giấy Ward, Hanoi",
    ),
    hours: "09:00 – 21:30",
    pickup: false,
  },
];

export function storeByCode(code: StoreCode): SampleStore {
  return STORES.find((s) => s.code === code) ?? (STORES[0] as SampleStore);
}

/**
 * Hàng có sẵn ở cửa hàng (`on_hand − reserved` của `inventory.ts` trang quản trị). SKU không có
 * dòng ở cửa hàng thì giao từ kho Thủ Đức.
 */
const STOCK: Record<StoreCode, Partial<Record<string, number>>> = {
  q3: { CG26: 12, CG28: 0, HT1L: 0, BG6: 14, NRC750: 0 },
  td: { BG6: 7, "KB4-XA": 20 },
  cg: { DB3: 2, CG26: 3, CG28: 1, NI20: 7, "KB4-XA": 25, NRC750: 18 },
};

/**
 * Tình trạng một SKU ở cửa hàng: còn nhiều, còn ít (≤ 3), hết ở cửa hàng (dòng tồn bằng 0), hay
 * cửa hàng không bày bán SKU này (không có dòng tồn) — cả hai trường hợp sau đều giao từ kho.
 */
export type Availability =
  | { kind: "in_store"; left: number }
  | { kind: "low"; left: number }
  | { kind: "out" }
  | { kind: "warehouse" };

export function availability(sku: string, store: StoreCode): Availability {
  const left = STOCK[store][sku];
  if (left === undefined) return { kind: "warehouse" };
  if (left === 0) return { kind: "out" };
  if (left <= 3) return { kind: "low", left };
  return { kind: "in_store", left };
}

/**
 * Sản phẩm "nhắc tới trong bài" (mẫu): sản phẩm có hai chữ đầu của tên xuất hiện trong bài (bỏ
 * dấu), không có thì ba sản phẩm bán chạy. Thay bằng bản ghi nhúng trong nội dung (bước 51 của core:
 * `content` giữ id đối tượng của `catalog`, website lấy thông tin sản phẩm qua API của catalog).
 */
export function mentionedProducts(articleText: string, locale: string, limit = 3): SampleProduct[] {
  const haystack = fold(articleText);
  const found = PRODUCTS.filter((p) => {
    const words = fold(text(p.names, locale)).split(/\s+/).slice(0, 2).join(" ");
    return words.length > 3 && haystack.includes(words);
  });
  return (found.length > 0 ? found : PRODUCTS).slice(0, limit);
}
