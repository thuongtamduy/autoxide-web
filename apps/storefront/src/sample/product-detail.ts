// Phần chi tiết của trang sản phẩm (W-029): mô tả, điểm nổi bật, dùng và chăm sóc, trong hộp có gì,
// đánh giá, hỏi đáp, hàng dùng kèm, phí giao theo tỉnh.
//
// Thay bằng (khi core có):
// - mô tả, thuộc tính, thông tin nhãn: `GET /api/v1/catalog/public/products/by-slug/{slug}` (bước 41);
// - đánh giá: `GET /api/v1/orders/public/products/{id}/reviews` + tóm tắt AI đã duyệt, phiếu "hữu ích"
//   `PUT /public/reviews/{id}/helpful` (bước 45);
// - hỏi đáp: `comments` với đối tượng `catalog.product` (bước 41, D-202);
// - "Thường mua cùng": `GET /api/v1/catalog/public/products/{id}/frequently-bought-together` (bước 41);
// - phí và ngày giao theo tỉnh: báo giá vận chuyển (bước 44).
//
// Nguồn: dùng và chăm sóc, trong hộp có gì, máy rửa bát lấy từ `kitchen` của `catalog.ts` trang quản
// trị; mô tả, đánh giá, hỏi đáp, phí giao theo bản thiết kế `Product`. Đánh giá và hỏi đáp là lời
// người mua viết, giữ nguyên tiếng Việt ở cả trang tiếng Anh (core không dịch nội dung của người dùng).
import type { ArtName, Tone } from "@/components/icon";
import type { Localized } from "./index";

const L = (vi: string, en: string): Localized => ({ vi, en });

export interface ProductDetail {
  /** Một câu tóm tắt (đầu trang và mô tả cho máy tìm kiếm). */
  summary: Localized;
  body: Localized[];
  highlights: Localized[];
  /** Các bước dùng và chăm sóc (tiêu đề, nội dung). */
  care: { title: Localized; text: Localized }[];
  avoid: Localized[];
  in_box: { quantity: number; name: Localized }[];
  not_included: Localized[];
  dishwasher_safe: boolean | null;
}

const DETAILS: Partial<Record<string, ProductDetail>> = {
  castIronPan: {
    summary: L(
      "Chảo gang đúc nguyên khối, giữ nhiệt đều, dùng được trên mọi loại bếp và trong lò.",
      "Solid cast iron pan that holds heat evenly; works on every stove and in the oven.",
    ),
    body: [
      L(
        "Chảo đúc nguyên khối từ gang, đã tráng dầu sẵn tại xưởng nên dùng được ngay. Gang giữ nhiệt lâu và toả đều, hợp áp chảo thịt, chiên trứng, làm bánh xèo và nướng trong lò.",
        "Cast in one piece and pre-seasoned at the workshop, so it is ready to use. Cast iron holds heat and spreads it evenly — good for searing meat, frying eggs, making bánh xèo and baking in the oven.",
      ),
      L(
        "Chảo nặng hơn chảo nhôm, bù lại dùng được nhiều chục năm. Lớp dầu đen bóng dày dần sau mỗi lần nấu và làm chảo ít dính hơn.",
        "It is heavier than an aluminium pan but lasts for decades. The glossy black seasoning builds up with every use and makes the pan less sticky.",
      ),
    ],
    highlights: [
      L(
        "Dùng được trên bếp từ, bếp gas, bếp hồng ngoại và lò nướng tới 260 °C",
        "Works on induction, gas, infrared and in the oven up to 260 °C",
      ),
      L(
        "Đã tráng dầu thực vật tại xưởng, không có lớp phủ chống dính hoá chất",
        "Pre-seasoned with vegetable oil, no chemical non-stick coating",
      ),
      L(
        "Giữ nhiệt lâu: áp chảo lên màu đều, cho đồ ăn vào không bị tụt nhiệt",
        "Holds heat: even browning, no temperature drop when food goes in",
      ),
      L(
        "Tay cầm đúc liền thân, không có ốc vít để lỏng",
        "Handle cast with the body, no screws to loosen",
      ),
    ],
    care: [
      {
        title: L("Lần đầu dùng", "First use"),
        text: L(
          "Rửa qua bằng nước ấm, lau khô, đun lửa nhỏ 2 phút rồi tráng một lớp dầu ăn thật mỏng.",
          "Rinse with warm water, dry, heat on low for 2 minutes and wipe on a very thin layer of oil.",
        ),
      },
      {
        title: L("Khi nấu", "Cooking"),
        text: L(
          "Làm nóng chảo từ từ ở lửa vừa 3–5 phút rồi mới cho đồ ăn. Tay cầm nóng theo chảo, luôn dùng lót tay.",
          "Preheat slowly on medium heat for 3–5 minutes before adding food. The handle gets hot — always use a holder.",
        ),
      },
      {
        title: L("Rửa", "Washing"),
        text: L(
          "Rửa tay bằng nước ấm, lau khô ngay và thoa một lớp dầu mỏng. Không ngâm nước lâu.",
          "Hand wash in warm water, dry at once and wipe with a thin coat of oil. Do not soak.",
        ),
      },
    ],
    avoid: [
      L("Máy rửa bát, ngâm nước qua đêm", "Dishwashers, soaking overnight"),
      L(
        "Đổ nước lạnh vào chảo đang nóng: gang có thể nứt",
        "Cold water in a hot pan: cast iron can crack",
      ),
      L("Cất chảo khi còn ướt hoặc úp kín", "Storing the pan wet or covered"),
    ],
    in_box: [
      { quantity: 1, name: L("Chảo gang", "Cast iron pan") },
      { quantity: 1, name: L("Bọc tay cầm silicon", "Silicone handle cover") },
    ],
    not_included: [L("Nắp kính (bán riêng theo cỡ)", "Glass lid (sold separately by size)")],
    dishwasher_safe: false,
  },
  steelPot20: {
    summary: L(
      "Nồi inox 304 ba lớp đáy, nắp kính có lỗ thoát hơi.",
      "Tri-ply 304 stainless pot with a vented glass lid.",
    ),
    body: [
      L(
        "Đáy ba lớp inox – nhôm – inox truyền nhiệt đều, sôi nhanh, không cháy đáy khi xào hay kho.",
        "The steel–aluminium–steel base spreads heat evenly, boils fast and does not scorch when frying or braising.",
      ),
    ],
    highlights: [
      L("Dùng được trên mọi loại bếp, kể cả bếp từ", "Works on every stove, induction included"),
      L(
        "Nắp kính có lỗ thoát hơi, nhìn được món đang nấu",
        "Vented glass lid lets you watch the food",
      ),
    ],
    care: [
      {
        title: L("Rửa", "Washing"),
        text: L("Rửa được bằng máy rửa bát.", "Dishwasher safe."),
      },
    ],
    avoid: [L("Đun nồi rỗng ở lửa lớn", "Heating the empty pot on high heat")],
    in_box: [
      { quantity: 1, name: L("Nồi", "Pot") },
      { quantity: 1, name: L("Nắp kính", "Glass lid") },
    ],
    not_included: [],
    dishwasher_safe: true,
  },
};

/** Tóm tắt một câu của sản phẩm chưa có mô tả đủ. */
const SUMMARIES: Partial<Record<string, Localized>> = {
  knifeSet: L(
    "Dao thái, dao chặt và dao gọt thép không gỉ, cán gỗ, mỗi con có số sê-ri.",
    "Slicing, chopping and paring knives in stainless steel with wooden handles, each with a serial number.",
  ),
  starterBundle: L(
    "Chảo gang 26 cm và thớt gỗ me tây 35 cm trong một hộp, cho bếp mới.",
    "A 26 cm cast iron pan and a 35 cm rain tree board in one box, for a new kitchen.",
  ),
  tamarindBoard35: L(
    "Thớt gỗ me tây nguyên tấm, dày 3 cm, đủ chỗ thái rau và chặt thịt.",
    "Solid rain tree board, 3 cm thick, room for chopping vegetables and meat.",
  ),
  blueBowls: L(
    "Sáu bát gốm men lam vẽ tay, men an toàn thực phẩm.",
    "Six hand-painted blue glaze bowls with a food-safe glaze.",
  ),
  glassBox: L(
    "Ba hộp thuỷ tinh chịu nhiệt 1 lít, nắp gài bốn cạnh, dùng được trong lò vi sóng (bỏ nắp).",
    "Three 1 L heat-resistant glass boxes with four-clip lids, microwave safe (without the lid).",
  ),
  towels: L(
    "Bốn khăn bếp cotton dệt dày, thấm nước, giặt máy được.",
    "Four thick woven cotton towels, absorbent and machine washable.",
  ),
  dishSoap: L(
    "Nước rửa chén gốc thực vật, tinh dầu sả, chai 750 ml.",
    "Plant-based dish soap with lemongrass oil, 750 ml bottle.",
  ),
  shrimpSalt: L(
    "Muối tôm Tây Ninh: muối, tôm khô, ớt; hũ 200 g.",
    "Tây Ninh shrimp salt: salt, dried shrimp and chilli; 200 g jar.",
  ),
  tamarindBoard25: L(
    "Thớt gỗ me tây cỡ nhỏ 25 cm cho trái cây, rau thơm.",
    "Small 25 cm rain tree board for fruit and herbs.",
  ),
  roundBoard30: L(
    "Thớt gỗ tròn 30 cm, dùng chặt và bày món.",
    "Round 30 cm wooden board for chopping and serving.",
  ),
  marketTowels: L(
    "Ba khăn lau bếp cotton dệt ở Quảng Ninh, do người bán trên sàn bán và giao.",
    "Three cotton kitchen cloths woven in Quảng Ninh, sold and shipped by a marketplace seller.",
  ),
};

/** Chi tiết của một sản phẩm; chưa có bản đủ thì dựng từ câu tóm tắt. */
export function productDetail(key: string): ProductDetail {
  const full = DETAILS[key];
  if (full) return full;
  const summary = SUMMARIES[key] ?? L("", "");
  return {
    summary,
    body: [summary],
    highlights: [],
    care: [],
    avoid: [],
    in_box: [],
    not_included: [],
    dishwasher_safe: null,
  };
}

// ---------------------------------------------------------------- Đánh giá

export interface SampleReview {
  id: string;
  stars: number;
  /** Tên đầy đủ trong hồ sơ; website chỉ hiện tên rút gọn (`shortName`). */
  author: string;
  sku: string;
  /** Viết bao nhiêu ngày trước (ngày tính theo "bây giờ" khi dựng trang). */
  days_ago: number;
  body: string;
  photos: { art: ArtName; tone: Tone }[];
  helpful: number;
  /** Cửa hàng trả lời. */
  reply: string | null;
}

const r = (
  id: string,
  stars: number,
  author: string,
  sku: string,
  days: number,
  body: string,
  helpful: number,
  extra: { photos?: [ArtName, Tone][]; reply?: string } = {},
): SampleReview => ({
  id,
  stars,
  author,
  sku,
  days_ago: days,
  body,
  photos: (extra.photos ?? []).map(([art, tone]) => ({ art, tone })),
  helpful,
  reply: extra.reply ?? null,
});

const REVIEWS: Partial<Record<string, SampleReview[]>> = {
  castIronPan: [
    r(
      "rv-cg-1",
      5,
      "Nguyễn Hoài Thương",
      "CG26",
      7,
      "Chảo nặng tay nhưng giữ nhiệt rất tốt, áp chảo thịt lên màu đẹp. Lần đầu nhớ tráng dầu như hướng dẫn đi kèm.",
      18,
      {
        photos: [
          ["pan", "t1"],
          ["pan", "t4"],
        ],
      },
    ),
    r(
      "rv-cg-2",
      4,
      "Trần Quốc Việt",
      "CG26",
      13,
      "Dùng trên bếp từ ổn, đáy phẳng. Trừ một sao vì tay cầm nóng, phải dùng lót tay.",
      9,
    ),
    r(
      "rv-cg-3",
      2,
      "Phạm Ngọc Diệp",
      "CG28",
      18,
      "Giao chậm hơn hẹn 2 ngày, chảo có vết xước nhỏ ở mép.",
      14,
      {
        photos: [["pan", "t3"]],
        reply:
          "Bếp Mộc xin lỗi chị. Bộ phận chăm sóc đã liên hệ đổi chảo mới và hoàn phí giao hàng.",
      },
    ),
    r(
      "rv-cg-4",
      5,
      "Lê Minh Châu",
      "CG24",
      26,
      "Mua tặng mẹ, mẹ dùng chiên cá không dính sau tuần đầu. Hộp đóng gói chắc chắn.",
      3,
    ),
    r(
      "rv-cg-5",
      5,
      "Đỗ Thanh Tâm",
      "CG28",
      31,
      "Cỡ 28 cm đủ cho nhà 4 người, áp chảo bít tết giữ nhiệt tốt, lên màu đều cả mặt.",
      7,
      { photos: [["pan", "t5"]] },
    ),
    r(
      "rv-cg-6",
      3,
      "Hồ Gia Bảo",
      "CG26",
      40,
      "Chảo tốt nhưng nặng tay, người lớn tuổi khó nhấc bằng một tay.",
      5,
    ),
    r(
      "rv-cg-7",
      5,
      "Vũ Lan Anh",
      "CG24",
      52,
      "Cỡ 24 cm vừa chiên trứng buổi sáng, giữ nhiệt lâu nên tắt bếp sớm vẫn chín.",
      2,
    ),
    r(
      "rv-cg-8",
      1,
      "Bùi Văn Khoa",
      "CG26",
      60,
      "Chảo lên gỉ sau khi để ướt qua đêm. Cửa hàng hướng dẫn chà và tráng dầu lại thì dùng tiếp được.",
      11,
      {
        reply:
          "Bếp Mộc cảm ơn anh đã chia sẻ. Gang không được để ướt; cách tráng dầu lại có trong hướng dẫn ở mục Dùng & chăm sóc.",
      },
    ),
  ],
  steelPot20: [
    r(
      "rv-ni-1",
      5,
      "Mai Phương Thảo",
      "NI20",
      9,
      "Nồi sôi nhanh, đáy dày không cháy khi kho cá.",
      6,
    ),
    r("rv-ni-2", 4, "Ngô Đức Huy", "NI20", 22, "Dùng bếp từ tốt, nắp kính hơi nặng.", 2),
  ],
  knifeSet: [
    r(
      "rv-db-1",
      5,
      "Tạ Thu Hà",
      "DB3",
      5,
      "Dao sắc, cán gỗ cầm chắc tay, có số sê-ri để bảo hành.",
      12,
      { photos: [["knife", "t2"]] },
    ),
    r("rv-db-2", 5, "Lý Quang Minh", "DB3", 19, "Dao chặt nặng vừa, chặt xương gà gọn.", 4),
  ],
};

/** Đánh giá mẫu đọc được của một sản phẩm (một phần của tổng số đánh giá). */
export function productReviews(key: string): SampleReview[] {
  return REVIEWS[key] ?? [];
}

/** Phân bố sao thật của chảo gang theo bản thiết kế (5 → 1); sản phẩm khác dùng `ratingDistribution`. */
export const DISTRIBUTIONS: Partial<Record<string, [number, number, number, number, number]>> = {
  castIronPan: [180, 24, 5, 2, 1],
};

/** Tóm tắt từ đánh giá: AI tạo, nhân viên duyệt (bản `approved` của `orders_review_summaries`). */
export interface ReviewSummary {
  body: Localized;
  /** Chủ đề người mua hay nhắc: nhãn, số lần nhắc, từ khoá để lọc. */
  topics: { label: Localized; count: number; keyword: string }[];
}

const SUMMARIES_AI: Partial<Record<string, ReviewSummary>> = {
  castIronPan: {
    body: L(
      "Người mua khen chảo giữ nhiệt tốt, áp chảo lên màu đẹp, dùng tốt trên bếp từ. Điều hay được nhắc: chảo nặng và tay cầm nóng khi nấu; vài người gặp giao chậm hoặc trầy xước nhẹ khi nhận.",
      "Buyers praise how well the pan holds heat, the even browning and how it works on induction. Often mentioned: it is heavy and the handle gets hot; a few had late delivery or light scratches on arrival.",
    ),
    topics: [
      { label: L("Giữ nhiệt tốt", "Holds heat"), count: 48, keyword: "giữ nhiệt" },
      { label: L("Lên màu đẹp", "Even browning"), count: 37, keyword: "lên màu" },
      { label: L("Nặng tay", "Heavy"), count: 31, keyword: "nặng" },
      { label: L("Tay cầm nóng", "Hot handle"), count: 12, keyword: "tay cầm" },
    ],
  },
};

export function reviewSummary(key: string): ReviewSummary | null {
  return SUMMARIES_AI[key] ?? null;
}

// ---------------------------------------------------------------- Hỏi đáp

export interface SampleAnswer {
  name: string;
  /** `shop`: cửa hàng trả lời; `buyer`: người đã mua. */
  role: "shop" | "buyer";
  days_ago: number;
  body: string;
  helpful: number;
}

export interface SampleQuestion {
  id: string;
  body: string;
  author: string;
  days_ago: number;
  answers: SampleAnswer[];
}

const QUESTIONS: Partial<Record<string, SampleQuestion[]>> = {
  castIronPan: [
    {
      id: "qa-cg-1",
      body: "Chảo dùng được bếp hồng ngoại không?",
      author: "Trần Mai",
      days_ago: 5,
      answers: [
        {
          name: "Bếp Mộc",
          role: "shop",
          days_ago: 5,
          body: "Được bạn nhé. Chảo dùng được bếp từ, gas, hồng ngoại và lò nướng tới 260 °C.",
          helpful: 14,
        },
        {
          name: "Lê Hưng",
          role: "buyer",
          days_ago: 4,
          body: "Mình dùng bếp hồng ngoại 6 tháng, ổn.",
          helpful: 6,
        },
      ],
    },
    {
      id: "qa-cg-2",
      body: "Chảo có tráng lớp chống dính hoá chất không?",
      author: "Phạm Dũng",
      days_ago: 10,
      answers: [
        {
          name: "Bếp Mộc",
          role: "shop",
          days_ago: 10,
          body: "Không. Chảo chỉ tráng dầu thực vật ở xưởng; lớp đen bóng dày dần khi bạn nấu.",
          helpful: 21,
        },
      ],
    },
    {
      id: "qa-cg-3",
      body: "Cỡ 26 cm có vừa nắp kính của cửa hàng không?",
      author: "Võ An",
      days_ago: 14,
      answers: [
        {
          name: "Bếp Mộc",
          role: "shop",
          days_ago: 13,
          body: "Nắp kính bán riêng theo cỡ; chọn nắp 26 cm là vừa.",
          helpful: 9,
        },
      ],
    },
    {
      id: "qa-cg-4",
      body: "Chảo nặng bao nhiêu, người già cầm được không?",
      author: "Nguyễn Thu",
      days_ago: 20,
      answers: [
        {
          name: "Bếp Mộc",
          role: "shop",
          days_ago: 20,
          body: "Cả hộp cỡ 26 cm nặng 3,1 kg; chảo nặng hơn chảo nhôm nhiều, nên nhấc bằng hai tay.",
          helpful: 8,
        },
        {
          name: "Đỗ Thanh Tâm",
          role: "buyer",
          days_ago: 18,
          body: "Mẹ mình 65 tuổi dùng cỡ 24 cm thấy vừa.",
          helpful: 3,
        },
      ],
    },
    {
      id: "qa-cg-5",
      body: "Chảo bị gỉ thì xử lý sao?",
      author: "Bùi Khoa",
      days_ago: 33,
      answers: [
        {
          name: "Bếp Mộc",
          role: "shop",
          days_ago: 33,
          body: "Chà sạch chỗ gỉ, rửa, lau khô rồi tráng dầu lại; chảo dùng tiếp bình thường.",
          helpful: 5,
        },
      ],
    },
  ],
  steelPot20: [
    {
      id: "qa-ni-1",
      body: "Nồi có dùng được bếp từ không?",
      author: "Lê Hạnh",
      days_ago: 8,
      answers: [
        {
          name: "Bếp Mộc",
          role: "shop",
          days_ago: 8,
          body: "Được, đáy ba lớp có lớp inox nhiễm từ.",
          helpful: 4,
        },
      ],
    },
  ],
};

export function productQuestions(key: string): SampleQuestion[] {
  return QUESTIONS[key] ?? [];
}

// ---------------------------------------------------------------- Mua kèm, thường mua cùng

/** "Dùng kèm" (cạnh nút mua): phụ kiện rẻ, thêm một chạm. */
const ADDONS: Partial<Record<string, string[]>> = {
  castIronPan: ["KB4-XA", "NRC750", "TG25"],
  steelPot20: ["BG6", "NRC750", "KB4-XA"],
  knifeSet: ["TG35", "TG25", "KB4-XA"],
};
const DEFAULT_ADDONS = ["KB4-XA", "NRC750", "MT200"];

export function addonSkus(key: string, ownSkus: readonly string[]): string[] {
  return (ADDONS[key] ?? DEFAULT_ADDONS).filter((sku) => !ownSkus.includes(sku)).slice(0, 3);
}

/** "Thường mua cùng" (lưới bốn thẻ). */
const TOGETHER: Partial<Record<string, string[]>> = {
  castIronPan: ["knifeSet", "tamarindBoard35", "steelPot20", "blueBowls"],
  steelPot20: ["castIronPan", "blueBowls", "tamarindBoard25", "glassBox"],
  knifeSet: ["tamarindBoard35", "castIronPan", "roundBoard30", "towels"],
};

export function togetherKeys(key: string): string[] | null {
  return TOGETHER[key] ?? null;
}

// ---------------------------------------------------------------- Giao hàng

/** Vùng giao (mẫu theo bản thiết kế): phí, số ngày (ít nhất, nhiều nhất). */
export const DELIVERY_ZONES = [
  { code: "hcm", name: L("TP. Hồ Chí Minh", "Ho Chi Minh City"), fee: 30_000, days: [1, 2] },
  { code: "hn", name: L("Hà Nội", "Hanoi"), fee: 35_000, days: [1, 2] },
  { code: "dn", name: L("Đà Nẵng", "Da Nang"), fee: 40_000, days: [2, 3] },
  { code: "ct", name: L("Cần Thơ", "Can Tho"), fee: 40_000, days: [2, 3] },
  { code: "other", name: L("Tỉnh, thành khác", "Other provinces"), fee: 45_000, days: [3, 5] },
] as const;

/** Mức miễn phí giao: chương trình "Miễn phí giao từ 1.000.000 ₫" của `deals.ts`. */
export const FREE_SHIPPING_FROM = 1_000_000;
/** Đặt online, có hàng ở cửa hàng sau (giờ), giữ hàng (ngày). */
export const PICKUP = { ready_hours: 2, hold_days: 3 };
/** Đổi trả (ngày) — chính sách của khách mẫu (dải cam kết đầu trang). */
export const RETURN_DAYS = 7;
