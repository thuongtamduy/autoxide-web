// Khuyến mại công khai cho trang "Khuyến mại", flash sale và giá trên thẻ (W-029).
//
// Thay bằng (bước 43 của core):
// - `GET /api/v1/promotions/public/promotions?locale&store_id` — chương trình `public` đang chạy, tiêu
//   đề + điều kiện (Luật 19/2023);
// - `GET /api/v1/promotions/public/promotions/flash-sales` — giờ bắt đầu / kết thúc và suất còn (số thật);
// - `POST/DELETE /api/v1/promotions/public/promotions/{id}/reminders` — "Nhắc tôi" (cần đăng nhập).
//
// Nguồn: `apps/admin/src/sample/promotions.ts` — cùng ID, tiêu đề, điều kiện, thời gian (tính theo
// 00:00 hôm nay giờ Việt Nam như `vnAt` / `vnEnd` bên đó), số lượt; hạn mức luật (`seedLimits`) và quy
// tắc thông báo (`seedRules`). Một chỗ khác có chủ đích: flash sale cuối tuần bên trang quản trị là bản
// nháp bị chặn bật vì chảo gang 26 cm giảm 55% (> 50% của TT 39/2025/TT-BCT); website hiện chương trình
// như sau khi nhân viên sửa giá về mức thấp nhất luật cho (`lowestAllowed` = 345.000 ₫) và bật — core
// không bao giờ trả chương trình vượt trần cho website.
import { vietnamMidnight } from "@/lib/countdown";
import { COUPON, variantBySku } from "./catalog";
import { type Localized, uid } from "./index";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const L = (vi: string, en: string): Localized => ({ vi, en });

/** ID chương trình, như `PROMOTION_ID` của trang quản trị. */
export const PROMOTION_ID = {
  panTenOff: uid("e1", 1),
  freeShipping: uid("e1", 2),
  towelsGift: uid("e1", 3),
  cauGiayOpening: uid("e1", 4),
  flashWeekend: uid("e1", 5),
} as const;

export type ProgramKind = "code" | "free_shipping" | "gift" | "percent_off" | "flash_sale";

export interface PublicProgram {
  id: string;
  kind: ProgramKind;
  title: Localized;
  terms: Localized;
  /** ISO UTC. */
  starts_at: string;
  ends_at: string;
  /** Mã phải nhập (chương trình `trigger = code`). */
  code: string | null;
  /** Lượt còn lại khi có giới hạn (số thật từ core). */
  remaining: number | null;
  /** Số thông báo với Sở Công Thương (`notice_reference`); `null` khi luật không bắt buộc. */
  notice: string | null;
  /** Áp ở một cửa hàng (mã cửa hàng của `catalog.ts`); `null` = mọi nơi bán. */
  store: "q3" | "td" | "cg" | null;
}

const iso = (at: number) => new Date(at).toISOString();
/** Cuối ngày (23:59:59) giờ Việt Nam của hôm nay + `days`, như `vnEnd` của trang quản trị. */
const vnEnd = (t0: number, days: number) => iso(t0 + (days + 1) * DAY - 1000);

/** Chương trình công khai đang chạy hoặc sắp chạy, mới bắt đầu trước. */
export function publicPrograms(now: number): PublicProgram[] {
  const t0 = vietnamMidnight(now);
  return [
    {
      id: PROMOTION_ID.panTenOff,
      kind: "code",
      title: COUPON.title,
      terms: COUPON.terms,
      starts_at: iso(t0 - 14 * DAY),
      ends_at: `${COUPON.ends_on}T16:59:59.000Z`,
      code: COUPON.code,
      remaining: COUPON.remaining,
      notice: "TB-KM-0000/2026 (mẫu)",
      store: null,
    },
    {
      id: PROMOTION_ID.freeShipping,
      kind: "free_shipping",
      title: L("Miễn phí giao từ 1.000.000 ₫", "Free delivery from 1,000,000 ₫"),
      terms: L(
        "Miễn phí giao hàng cho đơn có tổng tiền hàng sau giảm từ 1.000.000 ₫.",
        "Free delivery for orders whose goods total after discounts is 1,000,000 ₫ or more.",
      ),
      starts_at: iso(t0 - 14 * DAY),
      ends_at: vnEnd(t0, 46),
      code: null,
      remaining: null,
      notice: null,
      store: null,
    },
    {
      id: PROMOTION_ID.towelsGift,
      kind: "gift",
      title: L("Mua 2 khăn tặng 1 nước rửa", "Buy 2 towel sets, get dish soap"),
      terms: L(
        "Mua 2 bộ khăn bếp cotton (bộ 4) được tặng 1 chai nước rửa chén hữu cơ 750 ml. Tối đa 300 phần quà.",
        "Buy 2 cotton kitchen towel sets (pack of 4) and get one 750 ml organic dish soap. Up to 300 gifts.",
      ),
      starts_at: iso(t0 - 14 * DAY),
      ends_at: vnEnd(t0, 15),
      code: null,
      remaining: 300 - 86,
      notice: "TB-KM-0001/2026 (mẫu)",
      store: null,
    },
    {
      id: PROMOTION_ID.cauGiayOpening,
      kind: "percent_off",
      title: L("Khai trương CN Cầu Giấy", "Cầu Giấy store opening"),
      terms: L(
        "Giảm 15% mọi mặt hàng mua tại CN Cầu Giấy trong tuần khai trương; không áp cùng mã giảm giá khác.",
        "15% off everything bought at the Cầu Giấy store during opening week; cannot be combined with other codes.",
      ),
      starts_at: iso(t0 + DAY + 8 * HOUR),
      ends_at: vnEnd(t0, 7),
      code: null,
      remaining: null,
      notice: "TB-KM-0002/2026 (mẫu)",
      store: "cg",
    },
  ];
}

export interface FlashItem {
  sku: string;
  /** Giá ngay trước chương trình (giá tham chiếu theo luật), VND. */
  reference: number;
  sale: number;
  limit: number;
  used: number;
}

export interface FlashSale {
  id: string;
  title: Localized;
  terms: Localized;
  starts_at: number;
  ends_at: number;
  items: FlashItem[];
}

/**
 * Flash sale cuối tuần: 20:00–22:00 tối mai (giờ Việt Nam, tính từ hôm nay — không bao giờ là giờ cố
 * định của hôm nay). Giá và suất như `seedFlash` của trang quản trị, trừ chảo gang 26 cm (xem đầu file).
 */
export function flashSale(now: number): FlashSale {
  const t0 = vietnamMidnight(now);
  const item = (sku: string, sale: number, limit: number): FlashItem => ({
    sku,
    reference: variantBySku(sku)?.price ?? sale,
    sale,
    limit,
    used: 0,
  });
  return {
    id: PROMOTION_ID.flashWeekend,
    title: L("Flash sale cuối tuần", "Weekend flash sale"),
    terms: L(
      "Giá sốc trong 2 giờ cho 4 sản phẩm, số suất có hạn theo từng sản phẩm.",
      "Two-hour deal prices on 4 products, limited quantities per product.",
    ),
    starts_at: t0 + DAY + 20 * HOUR,
    ends_at: t0 + DAY + 22 * HOUR,
    items: [
      item("CG26", 345_000, 20),
      item("KB4-XA", 59_400, 60),
      item("NRC750", 53_400, 80),
      item("BG6", 252_000, 40),
    ],
  };
}

/**
 * Hạn mức giảm giá theo luật đang hiệu lực (`GET /api/v1/promotions/legal-limits?at`, dữ liệu dùng
 * chung, có ngày hiệu lực — không viết cứng trong hàm tính). Căn cứ cần đối chiếu văn bản gốc.
 */
export const LEGAL_LIMIT = {
  max_percent: 50,
  basis: "TT 39/2025/TT-BCT",
  effective_from: "2026-01-01",
  needs_review: true,
};

/** Quy tắc thông báo chương trình khuyến mại (`GET /api/v1/promotions/notice-rules?at`). */
export const NOTICE_RULE = {
  basis: "NĐ 81/2018/NĐ-CP sửa bởi NĐ 128/2024/NĐ-CP",
  effective_from: "2024-12-01",
  needs_review: true,
};
