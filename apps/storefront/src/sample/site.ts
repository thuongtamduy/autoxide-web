// Thông tin của khách mẫu "Bếp Mộc" (cửa hàng dụng cụ bếp có sàn "Chợ Bếp Mộc") — tên, khẩu hiệu,
// lời mở đầu trang chủ, người bán, món ăn gợi ý. Thay bằng hồ sơ công khai của khách (bước 34) và
// dữ liệu của module tương ứng (sàn: bước 46) khi core có. Chữ của giao diện (tiêu đề khối, nút)
// không ở đây mà ở `messages/`.
import type { ArtName, Tone } from "@/components/icon";
import type { Localized } from "./index";

const L = (vi: string, en: string): Localized => ({ vi, en });

export const SITE = {
  name: "Bếp Mộc",
  blogName: L("Góc bếp", "Kitchen notes"),
  marketplace: L("Chợ Bếp Mộc", "Bếp Mộc Market"),
  /** Dải cam kết trên đầu trang. */
  strip: [
    L("Miễn phí giao từ 1.000.000 ₫", "Free delivery from 1,000,000 ₫"),
    L("Đổi trả trong 7 ngày", "Returns within 7 days"),
    L("Đặt online, nhận tại cửa hàng sau 2 giờ", "Order online, pick up in store in 2 hours"),
  ],
  hero: {
    kicker: L("Bộ sưu tập mùa đông", "Winter collection"),
    title: L(
      "Dụng cụ bếp bền, nấu ngon mỗi ngày",
      "Kitchen tools that last, for good food every day",
    ),
    lead: L(
      "Chảo gang, nồi inox, dao và đồ gốm chọn từ xưởng trong nước. Giá đã gồm thuế, đặt online rồi nhận ở cửa hàng gần bạn.",
      "Cast iron pans, stainless pots, knives and ceramics from local workshops. Prices include tax; order online and pick up at a store near you.",
    ),
  },
  /** Ba cam kết (trang chủ, đầu trang). */
  trust: [
    L("Giá đã gồm thuế GTGT", "Prices include VAT"),
    L("Đổi trả trong 7 ngày", "Returns within 7 days"),
    L("Thanh toán qua đối tác được cấp phép", "Payments through licensed partners"),
  ],
  /** Số người bán đã xác thực trên sàn. */
  verifiedSellers: 123,
} as const;

export interface SampleSeller {
  slug: string;
  name: string;
  rating: number;
  products: number;
  art: ArtName;
  tone: Tone;
}

/**
 * Người bán trên sàn (`apps/admin/src/sample/market-data.ts` và menu mẫu của trang quản trị), cùng số
 * liệu với hồ sơ gian hàng ở `market.ts`. Chỉ người bán đang bán: Gia Dụng Nhà Na đang tạm khoá ở
 * trang quản trị nên không giới thiệu ở trang chủ (W-030).
 */
export const SELLERS: readonly SampleSeller[] = [
  {
    slug: "gom-su-bat-trang-xua",
    name: "Gốm Sứ Bát Tràng Xưa",
    rating: 4.8,
    products: 86,
    art: "bowl",
    tone: "t4",
  },
  {
    slug: "khan-bong-ha-long",
    name: "Khăn Bông Hạ Long",
    rating: 4.1,
    products: 18,
    art: "towel",
    tone: "t3",
  },
  {
    slug: "may-tre-dan-phu-vinh",
    name: "Mây Tre Đan Phú Vinh",
    rating: 4.9,
    products: 52,
    art: "basket",
    tone: "t5",
  },
];

export interface SampleMeal {
  id: string;
  name: Localized;
  minutes: number;
  people: number;
  art: ArtName;
  tone: Tone;
  blurb: Localized;
  /** Từ khoá tìm bài cách làm ở mục bài viết. */
  query: string;
  /** SKU dụng cụ dùng trong món (sản phẩm của `catalog.ts`). */
  tools: string[];
}

/** "Hôm nay nấu gì?": món mẫu → dụng cụ dùng trong món, gom vào giỏ một lần. */
export const MEALS: readonly SampleMeal[] = [
  {
    id: "steak",
    name: L("Bò bít tết áp chảo", "Pan-seared steak"),
    minutes: 25,
    people: 2,
    art: "pan",
    tone: "t1",
    blurb: L(
      "Chảo gang giữ nhiệt nên mặt thịt lên màu đều, bên trong vẫn mềm. Làm nóng chảo 5 phút, áp mỗi mặt 2–3 phút, nghỉ thịt trên thớt rồi mới cắt.",
      "Cast iron holds heat, so the meat browns evenly and stays tender inside. Heat the pan for 5 minutes, sear 2–3 minutes a side, rest the meat on the board before slicing.",
    ),
    query: "chảo gang",
    tools: ["CG26", "TG35", "DB3"],
  },
  {
    id: "soup",
    name: L("Canh chua cá", "Sour fish soup"),
    minutes: 30,
    people: 4,
    art: "bowl",
    tone: "t3",
    blurb: L(
      "Nồi inox 3 đáy sôi đều, không cháy đáy khi xào cà chua. Nấu nước me, thả cá khi nước sôi, cho rau sau cùng để còn giòn.",
      "A tri-ply pot boils evenly and does not scorch the tomatoes. Make the tamarind broth, add the fish when it boils, and the greens last so they stay crisp.",
    ),
    query: "canh",
    tools: ["NI20", "BG6", "TG25"],
  },
  {
    id: "salad",
    name: L("Gỏi gà xé phay", "Shredded chicken salad"),
    minutes: 40,
    people: 4,
    art: "board",
    tone: "t5",
    blurb: L(
      "Thớt gỗ lớn đủ chỗ xé gà và thái rau một lần. Luộc gà lửa nhỏ, ngâm nước đá cho da giòn, trộn với muối tôm ngay trước khi ăn.",
      "A large wooden board has room to shred the chicken and slice the herbs at once. Simmer the chicken, chill it in ice water for crisp skin, and toss with shrimp salt just before serving.",
    ),
    query: "thớt",
    tools: ["TG35", "DB3", "MT200"],
  },
];
