// Sàn "Chợ Bếp Mộc" trên website (mẫu, W-030): hồ sơ công khai của người bán, sản phẩm người bán
// đăng, chính sách, đánh giá tóm tắt, phí sàn cho trang mời bán hàng.
//
// Thay bằng (khi core có, bước 46):
// - `GET /api/v1/marketplace/public/sellers`, `GET /api/v1/marketplace/public/sellers/{slug}` — thông tin
//   người bán bắt buộc công khai (tên theo đăng ký, MST / số ĐKKD, địa chỉ, liên hệ) + gian hàng;
// - `GET /api/v1/marketplace/public/sellers/{slug}/reviews` — đánh giá gom theo người bán;
// - sản phẩm của người bán: `GET /api/v1/catalog/public/products?owner_org_id=` (bước 41);
// - phí: `GET /api/v1/marketplace/fee-rules/preview` (bước 46; bản công khai chưa có — ghi ở W-030).
//
// Nguồn: `apps/admin/src/sample/market-data.ts` (tên, slug, loại người bán, cách giao, COD, trạng thái,
// điểm, số sản phẩm, dòng phí có ngày hiệu lực) — đủ sáu người bán của file đó, để mọi link tới gian hàng
// (trang sản phẩm, menu) mở được; người bán chưa bán được hiện "chưa mở bán". "Mây Tre Đan Phú Vinh" chỉ
// có ở menu mẫu của trang quản trị nên số liệu là của website. Tên pháp lý, MST, địa chỉ, liên hệ để trống `[...]` (repo
// công khai). Gia Dụng Nhà Na đang tạm khoá ở trang quản trị (định danh hết hạn) nên gian hàng hiện
// "tạm ngừng nhận đơn" và không thêm vào giỏ được — như luật sàn: người bán chưa xác thực thì không bán.
import type { ArtName, Tone } from "@/components/icon";
import { type Localized, text } from "./index";

const L = (vi: string, en: string): Localized => ({ vi, en });

export type SellerType = "enterprise" | "household" | "individual";

/** Một nhóm hàng của gian hàng (chip lọc). */
export interface SellerKind {
  key: string;
  names: Localized;
  /** Số sản phẩm của nhóm trong cả gian hàng (không chỉ phần mẫu). */
  count: number;
}

/** Hồ sơ công khai của người bán (`PublicSellerProfile` của bước 46). */
export interface SellerProfile {
  slug: string;
  display_name: string;
  description: Localized;
  seller_type: SellerType;
  /**
   * `active`: đang bán; `suspended`: tạm khoá (định danh hết hạn…); `pending`: đã đăng ký, đang xác thực
   * danh tính hay chờ sàn duyệt (`pending_verification`, `pending_review` của bước 46) — chưa bán được.
   */
  status: "active" | "suspended" | "pending";
  /** `self`: người bán tự giao; `platform`: gửi kho sàn, sàn giao. */
  fulfillment: "self" | "platform";
  cod_enabled: boolean;
  /** Điểm trung bình và số lượt; `null` khi chưa có. */
  rating: { average: number; count: number } | null;
  product_count: number;
  /** Tỉ lệ giao đúng hạn 90 ngày (`marketplace_seller_metrics`), phần trăm. */
  on_time_percent: number;
  /** Tháng tham gia, `YYYY-MM`. */
  joined: string;
  /** Tỉnh lấy hàng (giao từ đâu) và số ngày giao dự kiến. */
  ships_from: Localized;
  ship_days: readonly [number, number];
  /** Phí giao của người bán cho một đơn (VND), như bản thiết kế. */
  ship_fee: number;
  /** Thông tin người bán bắt buộc công khai (Luật Thương mại điện tử 2025). */
  legal: {
    name: string;
    tax_code: string;
    address: Localized;
    contact: string;
    /** Ngày xác thực danh tính, `YYYY-MM-DD`; `null` khi chưa xác thực lại. */
    verified_on: string | null;
  };
  kinds: readonly SellerKind[];
  art: ArtName;
  tone: Tone;
}

const legal = (
  type: SellerType,
  province: Localized,
  verified: string | null,
): SellerProfile["legal"] => ({
  name:
    type === "enterprise"
      ? "[TÊN DOANH NGHIỆP THEO GIẤY ĐĂNG KÝ]"
      : "[TÊN HỘ / CÁ NHÂN KINH DOANH]",
  tax_code: "[MÃ SỐ THUẾ]",
  address: L(`[Địa chỉ], ${province.vi}`, `[Address], ${province.en}`),
  contact: "[Số điện thoại] · [Email]",
  verified_on: verified,
});

const HANOI = L("Hà Nội", "Hanoi");
const QUANG_NINH = L("Quảng Ninh", "Quảng Ninh");

export const SELLER_PROFILES: readonly SellerProfile[] = [
  {
    slug: "gom-su-bat-trang-xua",
    display_name: "Gốm Sứ Bát Tràng Xưa",
    description: L(
      "Gốm men lam, men rạn làm tay ở Bát Tràng.",
      "Hand-made blue glaze and crackle ceramics from Bát Tràng.",
    ),
    seller_type: "enterprise",
    status: "active",
    fulfillment: "self",
    cod_enabled: false,
    rating: { average: 4.8, count: 530 },
    product_count: 86,
    on_time_percent: 97,
    joined: "2026-03",
    ships_from: HANOI,
    ship_days: [2, 4],
    ship_fee: 30_000,
    legal: legal("enterprise", HANOI, "2026-03-12"),
    kinds: [
      { key: "bat", names: L("Bát đĩa", "Bowls and plates"), count: 41 },
      { key: "am", names: L("Ấm chén", "Tea sets"), count: 18 },
      { key: "noi", names: L("Nồi đất", "Clay pots"), count: 15 },
      { key: "lo", names: L("Lọ hoa", "Vases"), count: 12 },
    ],
    art: "bowl",
    tone: "t4",
  },
  {
    slug: "gia-dung-nha-na",
    display_name: "Gia Dụng Nhà Na",
    description: L(
      "Đồ gia dụng bền, giá thật, giao nhanh trong nội thành Hà Nội.",
      "Durable household goods at honest prices, fast delivery in central Hanoi.",
    ),
    seller_type: "household",
    status: "suspended",
    fulfillment: "platform",
    cod_enabled: true,
    rating: { average: 4.5, count: 212 },
    product_count: 46,
    on_time_percent: 91,
    joined: "2026-01",
    ships_from: HANOI,
    ship_days: [1, 3],
    ship_fee: 25_000,
    legal: legal("household", HANOI, null),
    kinds: [
      { key: "chao", names: L("Chảo, nồi", "Pans and pots"), count: 28 },
      { key: "hop", names: L("Hộp, bình", "Boxes and bottles"), count: 18 },
    ],
    art: "glass",
    tone: "t3",
  },
  {
    slug: "khan-bong-ha-long",
    display_name: "Khăn Bông Hạ Long",
    description: L(
      "Khăn bếp, khăn lau cotton dệt ở Quảng Ninh.",
      "Cotton kitchen towels and cloths woven in Quảng Ninh.",
    ),
    seller_type: "household",
    status: "active",
    fulfillment: "platform",
    cod_enabled: true,
    rating: { average: 4.1, count: 96 },
    product_count: 18,
    on_time_percent: 88,
    joined: "2026-04",
    ships_from: QUANG_NINH,
    ship_days: [2, 4],
    ship_fee: 25_000,
    legal: legal("household", QUANG_NINH, "2026-04-29"),
    kinds: [
      { key: "khan", names: L("Khăn", "Towels"), count: 12 },
      { key: "tapde", names: L("Tạp dề, găng", "Aprons and mitts"), count: 6 },
    ],
    art: "towel",
    tone: "t5",
  },
  {
    slug: "may-tre-dan-phu-vinh",
    display_name: "Mây Tre Đan Phú Vinh",
    description: L(
      "Giỏ, khay, rổ mây tre đan tay ở làng Phú Vinh.",
      "Hand-woven rattan and bamboo baskets and trays from Phú Vinh village.",
    ),
    seller_type: "household",
    status: "active",
    fulfillment: "self",
    cod_enabled: false,
    rating: { average: 4.9, count: 140 },
    product_count: 52,
    on_time_percent: 95,
    joined: "2026-02",
    ships_from: HANOI,
    ship_days: [2, 5],
    ship_fee: 30_000,
    legal: legal("household", HANOI, "2026-02-18"),
    kinds: [
      { key: "gio", names: L("Giỏ, rổ", "Baskets"), count: 34 },
      { key: "khay", names: L("Khay", "Trays"), count: 18 },
    ],
    art: "basket",
    tone: "t5",
  },
  // Ba người bán đã đăng ký nhưng chưa bán được (trang quản trị: `pending_review`,
  // `pending_verification`): gian hàng hiện "chưa mở bán", chưa có sản phẩm nào.
  {
    slug: "bep-nha-tho",
    display_name: "Bếp Nhà Thỏ",
    description: L(
      "Chảo, nồi nhỏ cho bếp một người; bán cả qua livestream.",
      "Small pans and pots for one-person kitchens; also sells on livestream.",
    ),
    seller_type: "individual",
    status: "pending",
    fulfillment: "self",
    cod_enabled: false,
    rating: null,
    product_count: 0,
    on_time_percent: 0,
    joined: "2026-11",
    ships_from: HANOI,
    ship_days: [2, 4],
    ship_fee: 30_000,
    legal: legal("individual", HANOI, "2026-11-12"),
    kinds: [],
    art: "pan",
    tone: "t1",
  },
  {
    slug: "dao-keo-da-sy",
    display_name: "Dao Kéo Đa Sỹ Truyền Thống",
    description: L("Dao rèn tay làng Đa Sỹ.", "Hand-forged knives from Đa Sỹ village."),
    seller_type: "household",
    status: "pending",
    fulfillment: "self",
    cod_enabled: false,
    rating: null,
    product_count: 12,
    on_time_percent: 0,
    joined: "2026-11",
    ships_from: HANOI,
    ship_days: [2, 4],
    ship_fee: 30_000,
    legal: legal("household", HANOI, null),
    kinds: [{ key: "dao", names: L("Dao", "Knives"), count: 12 }],
    art: "knife",
    tone: "t2",
  },
  {
    slug: "thuc-pham-sach-an-nhien",
    display_name: "Thực Phẩm Sạch An Nhiên",
    description: L("Gia vị, muối chấm đóng gói.", "Packed spices and dipping salts."),
    seller_type: "enterprise",
    status: "pending",
    fulfillment: "platform",
    cod_enabled: true,
    rating: null,
    product_count: 0,
    on_time_percent: 0,
    joined: "2026-11",
    ships_from: HANOI,
    ship_days: [1, 3],
    ship_fee: 25_000,
    legal: legal("enterprise", HANOI, null),
    kinds: [],
    art: "jar",
    tone: "t5",
  },
];

export function sellerBySlug(slug: string): SellerProfile | undefined {
  return SELLER_PROFILES.find((seller) => seller.slug === slug);
}

/** Người bán đang bán được (đã xác thực, không bị tạm khoá). */
export function sellerOpen(seller: SellerProfile): boolean {
  return seller.status === "active";
}

// ---------------------------------------------------------------- Sản phẩm của người bán

/** Một sản phẩm một biến thể người bán đăng trên sàn (đã qua duyệt). */
export interface SellerProduct {
  sku: string;
  seller: string;
  kind: string;
  names: Localized;
  /** Giá gồm thuế, VND. */
  price: number;
  grams: number;
  art: ArtName;
  tone: Tone;
  rating: number;
  reviews: number;
  sold: number;
}

const p = (
  seller: string,
  sku: string,
  kind: string,
  vi: string,
  en: string,
  price: number,
  grams: number,
  art: ArtName,
  tone: Tone,
  rating: number,
  reviews: number,
  sold: number,
): SellerProduct => ({
  sku,
  seller,
  kind,
  names: L(vi, en),
  price,
  grams,
  art,
  tone,
  rating,
  reviews,
  sold,
});

const GS = "gom-su-bat-trang-xua";
const NA = "gia-dung-nha-na";
const KB = "khan-bong-ha-long";
const MT = "may-tre-dan-phu-vinh";

/**
 * Phần mẫu của mỗi gian hàng (bản thiết kế `Seller`: 12 trên 86 sản phẩm). Bát gốm men lam bộ 6 là
 * hàng Bếp Mộc bán (`catalog.ts`, BG6) nên không lặp ở đây.
 */
export const SELLER_PRODUCTS: readonly SellerProduct[] = [
  p(
    GS,
    "GS-AMLAM",
    "am",
    "Bộ ấm chén men lam",
    "Blue glaze tea set",
    650_000,
    1600,
    "clay",
    "t3",
    4.9,
    74,
    212,
  ),
  p(
    GS,
    "GS-NOI15",
    "noi",
    "Nồi đất Bát Tràng 1,5 lít",
    "Bát Tràng clay pot 1.5 L",
    380_000,
    2200,
    "clay",
    "t4",
    4.8,
    61,
    188,
  ),
  p(
    GS,
    "GS-DIA26",
    "bat",
    "Đĩa men rạn 26 cm",
    "Crackle glaze plate 26 cm",
    180_000,
    900,
    "bowl",
    "t5",
    4.7,
    133,
    402,
  ),
  p(
    GS,
    "GS-NOIKHO",
    "noi",
    "Nồi kho đất nung men nâu",
    "Brown glaze clay braising pot",
    290_000,
    1900,
    "clay",
    "t5",
    4.6,
    29,
    97,
  ),
  p(
    GS,
    "GS-OVAL30",
    "bat",
    "Đĩa oval men lam 30 cm",
    "Blue glaze oval plate 30 cm",
    240_000,
    1100,
    "bowl",
    "t2",
    4.8,
    48,
    155,
  ),
  p(
    GS,
    "GS-BATCOM10",
    "bat",
    "Bát cơm men trắng (bộ 10)",
    "White rice bowls (set of 10)",
    350_000,
    2600,
    "bowl",
    "t1",
    4.7,
    171,
    530,
  ),
  p(
    GS,
    "GS-LOHB",
    "lo",
    "Lọ hoa men hoả biến",
    "Flambé glaze vase",
    520_000,
    1400,
    "clay",
    "t2",
    4.9,
    22,
    64,
  ),
  p(
    GS,
    "GS-CHENMAM6",
    "bat",
    "Chén mắm men lam (bộ 6)",
    "Blue glaze dipping bowls (set of 6)",
    120_000,
    600,
    "bowl",
    "t3",
    4.8,
    54,
    210,
  ),
  p(
    GS,
    "GS-AMRAN",
    "am",
    "Ấm trà men rạn 0,8 lít",
    "Crackle glaze teapot 0.8 L",
    460_000,
    900,
    "clay",
    "t5",
    4.7,
    19,
    58,
  ),
  p(
    GS,
    "GS-LOTOI",
    "lo",
    "Lọ hoa men lam dáng tỏi",
    "Blue glaze garlic-neck vase",
    340_000,
    1000,
    "clay",
    "t3",
    4.8,
    15,
    41,
  ),
  p(
    GS,
    "GS-DIA20",
    "bat",
    "Đĩa tròn men lam 20 cm",
    "Blue glaze round plate 20 cm",
    150_000,
    600,
    "bowl",
    "t1",
    4.8,
    37,
    126,
  ),
  p(
    NA,
    "NA-CCD28",
    "chao",
    "Chảo chống dính 28 cm",
    "Non-stick frying pan 28 cm",
    450_000,
    1200,
    "pan",
    "t2",
    4.5,
    88,
    310,
  ),
  p(
    NA,
    "NA-BINH1L",
    "hop",
    "Bình giữ nhiệt 1 lít",
    "Vacuum flask 1 L",
    260_000,
    600,
    "bottle",
    "t3",
    4.4,
    41,
    150,
  ),
  p(
    NA,
    "NA-RO24",
    "hop",
    "Rổ inox 24 cm",
    "Stainless colander 24 cm",
    120_000,
    400,
    "basket",
    "t1",
    4.6,
    35,
    220,
  ),
  p(
    KB,
    "KB-TRE5",
    "khan",
    "Khăn lau bếp sợi tre (bộ 5)",
    "Bamboo fibre kitchen cloths (set of 5)",
    125_000,
    300,
    "towel",
    "t5",
    4.2,
    40,
    160,
  ),
  p(
    KB,
    "KB-TAPDE",
    "tapde",
    "Tạp dề cotton có túi",
    "Cotton apron with pocket",
    159_000,
    250,
    "towel",
    "t2",
    4.0,
    22,
    75,
  ),
  p(
    KB,
    "KB-GANG2",
    "tapde",
    "Găng tay nhấc nồi (đôi)",
    "Oven mitts (pair)",
    89_000,
    200,
    "towel",
    "t3",
    4.1,
    18,
    64,
  ),
  p(
    MT,
    "MT-GIORAU",
    "gio",
    "Giỏ mây đựng rau củ",
    "Rattan vegetable basket",
    185_000,
    500,
    "basket",
    "t5",
    4.9,
    52,
    170,
  ),
  p(
    MT,
    "MT-KHAY40",
    "khay",
    "Khay tre chữ nhật 40 cm",
    "Bamboo tray 40 cm",
    210_000,
    700,
    "board",
    "t1",
    4.8,
    31,
    96,
  ),
  p(
    MT,
    "MT-RO3",
    "gio",
    "Rổ mây tròn (bộ 3)",
    "Round rattan baskets (set of 3)",
    245_000,
    900,
    "basket",
    "t4",
    4.9,
    26,
    88,
  ),
];

export function sellerProducts(slug: string): SellerProduct[] {
  return SELLER_PRODUCTS.filter((product) => product.seller === slug);
}

export function sellerProductBySku(sku: string): SellerProduct | undefined {
  return SELLER_PRODUCTS.find((product) => product.sku === sku);
}

// ---------------------------------------------------------------- Đánh giá và chính sách

export interface SellerReview {
  id: string;
  seller: string;
  /** Tên đã che ("Lan C."), như đánh giá công khai của bước 45. */
  author: string;
  stars: number;
  /** Số ngày trước hôm nay. */
  days_ago: number;
  sku: string;
  body: Localized;
  reply: Localized | null;
  helpful: number;
}

/** Vài đánh giá mới của người đã mua (mẫu); số đếm ở `rating` của hồ sơ là của cả gian hàng. */
export const SELLER_REVIEWS: readonly SellerReview[] = [
  {
    id: "r1",
    seller: GS,
    author: "Lan C.",
    stars: 5,
    days_ago: 3,
    sku: "GS-AMLAM",
    body: L(
      "Men lam đều màu, đóng gói ba lớp, không vỡ cái nào. Ấm rót không bị nhỏ giọt.",
      "Even blue glaze, three layers of packing, nothing broken. The teapot pours without dripping.",
    ),
    reply: L("Cảm ơn chị đã tin Bát Tràng Xưa!", "Thank you for trusting Bát Tràng Xưa!"),
    helpful: 24,
  },
  {
    id: "r2",
    seller: GS,
    author: "Minh T.",
    stars: 4,
    days_ago: 9,
    sku: "GS-BATCOM10",
    body: L(
      "Bát đẹp, nhẹ tay. Giao chậm một ngày so với dự kiến nhưng người bán báo trước.",
      "Nice light bowls. Arrived a day later than estimated, but the seller warned me.",
    ),
    reply: null,
    helpful: 11,
  },
  {
    id: "r3",
    seller: GS,
    author: "Hoà P.",
    stars: 5,
    days_ago: 15,
    sku: "GS-NOI15",
    body: L(
      "Nồi đất kho cá rất ngon, đã ngâm nước trước khi dùng như hướng dẫn kèm theo.",
      "Great clay pot for braised fish; soaked it before first use as the leaflet says.",
    ),
    reply: null,
    helpful: 7,
  },
  {
    id: "r4",
    seller: KB,
    author: "Thu N.",
    stars: 4,
    days_ago: 6,
    sku: "KB-TRE5",
    body: L(
      "Khăn thấm nước tốt, giặt máy không xù.",
      "Absorbs well, no pilling after machine wash.",
    ),
    reply: null,
    helpful: 3,
  },
  {
    id: "r5",
    seller: MT,
    author: "Quang V.",
    stars: 5,
    days_ago: 4,
    sku: "MT-GIORAU",
    body: L("Giỏ đan chắc tay, mùi mây tự nhiên.", "Sturdy weave with a natural rattan smell."),
    reply: L("Cảm ơn anh!", "Thank you!"),
    helpful: 5,
  },
];

export function sellerReviews(slug: string): SellerReview[] {
  return SELLER_REVIEWS.filter((review) => review.seller === slug);
}

/** Phân bố sao (5 → 1) của cả gian hàng, cộng lại bằng `rating.count`. */
export function ratingDistribution(seller: SellerProfile): number[] {
  const count = seller.rating?.count ?? 0;
  const average = seller.rating?.average ?? 0;
  // Mẫu: phân bố cố định theo điểm trung bình, phần dư dồn vào 5 sao để tổng đúng.
  const shares = average >= 4.7 ? [0.86, 0.1, 0.02, 0.01] : [0.6, 0.25, 0.08, 0.04];
  const lower = shares.slice(1).map((share) => Math.round(count * share));
  const rest = count - lower.reduce((sum, n) => sum + n, 0) - Math.round(count * 0.01);
  return [rest, ...lower, Math.round(count * 0.01)];
}

// ---------------------------------------------------------------- Phí sàn

/** Dòng phí có ngày hiệu lực (`marketplace_fee_rules`), chép từ `seedFees` của trang quản trị. */
export interface FeeRule {
  kind: "commission" | "storage";
  /** `null` = mọi ngành hàng; khác = tên ngành của dòng riêng. */
  category: Localized | null;
  rate_bp: number | null;
  fixed: number | null;
  effective_from: string;
  effective_to: string | null;
}

export const FEE_RULES: readonly FeeRule[] = [
  {
    kind: "commission",
    category: null,
    rate_bp: 700,
    fixed: null,
    effective_from: "2026-01-01",
    effective_to: "2026-02-28",
  },
  {
    kind: "commission",
    category: null,
    rate_bp: 600,
    fixed: null,
    effective_from: "2026-03-01",
    effective_to: null,
  },
  {
    kind: "commission",
    category: L("Gốm sứ", "Ceramics"),
    rate_bp: 500,
    fixed: null,
    effective_from: "2026-09-01",
    effective_to: null,
  },
  {
    kind: "storage",
    category: null,
    rate_bp: null,
    fixed: 120_000,
    effective_from: "2026-10-01",
    effective_to: null,
  },
];

/** Dòng phí đang hiệu lực vào ngày `day` (`YYYY-MM-DD`, giờ Việt Nam). */
export function feesOn(day: string): FeeRule[] {
  return FEE_RULES.filter(
    (rule) =>
      rule.effective_from <= day && (rule.effective_to === null || day <= rule.effective_to),
  );
}

/** Tên hiện của một người bán theo ngôn ngữ (tên riêng không dịch). */
export function sellerName(slug: string | null, storeName: string): string {
  if (slug === null) return storeName;
  return sellerBySlug(slug)?.display_name ?? slug;
}

/** Mô tả ngắn của người bán theo ngôn ngữ. */
export function sellerDescription(seller: SellerProfile, locale: string): string {
  return text(seller.description, locale);
}
