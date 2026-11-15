// Menu mẫu của website (W-026), cùng hình dạng `PublicSiteMenu` của core. Chỉ dùng khi core trả
// 404 cho `GET /api/v1/menus/public/{main|footer}` (khách chưa tạo menu) và dữ liệu mẫu đang bật;
// menu thật luôn thắng. Mục danh mục trỏ tới `catalog.category` của `catalog.ts` (loại đối tượng
// bước 41 sẽ đăng ký) để bảng xổ lấy được "bán chạy" của danh mục.

import { routes } from "@/lib/routes";
import type { SiteMenu, SiteMenuItem } from "@/lib/types";
import { CATEGORIES, CATEGORY_ID } from "./catalog";
import { type Localized, text } from "./index";
import { SITE } from "./site";

const L = (vi: string, en: string): Localized => ({ vi, en });

function link(label: string, href: string | null, extra: Partial<SiteMenuItem> = {}): SiteMenuItem {
  return {
    label,
    href,
    children: [],
    badge: null,
    feature: null,
    highlight: null,
    icon: null,
    ref: null,
    ...extra,
  };
}

/** Gợi ý ở bảng xổ của từng danh mục (khuyến mại, bài viết, gian hàng trên sàn). */
const FEATURES: Record<string, { title: Localized; summary: Localized; href: string }> = {
  [CATEGORY_ID.kitchen]: {
    title: L("Giảm 10% chảo gang với mã BEPMOC10", "10% off cast iron pans with BEPMOC10"),
    summary: L("Chảo gang 26, 28 cm · tới 30/11/2026", "26 and 28 cm pans · until 30/11/2026"),
    href: routes.deals(),
  },
  [CATEGORY_ID.knives]: {
    title: L("Vệ sinh thớt gỗ đúng cách", "How to clean a wooden board"),
    summary: L("Bài viết · 4 phút đọc", "Article · 4 min read"),
    href: routes.blog(),
  },
  [CATEGORY_ID.tableware]: {
    title: L("Bộ sưu tập gốm Bát Tràng", "Bát Tràng ceramics collection"),
    summary: L("Gốm Sứ Bát Tràng Xưa · trên sàn", "Gốm Sứ Bát Tràng Xưa · on the marketplace"),
    href: routes.seller("gom-su-bat-trang-xua"),
  },
  [CATEGORY_ID.storage]: {
    title: L("Giỏ mây đan tay từ Phú Vinh", "Hand-woven baskets from Phú Vinh"),
    summary: L("Mây Tre Đan Phú Vinh · trên sàn", "Mây Tre Đan Phú Vinh · on the marketplace"),
    href: routes.seller("may-tre-dan-phu-vinh"),
  },
  [CATEGORY_ID.textiles]: {
    title: L("Miễn phí giao đơn từ 1.000.000 ₫", "Free delivery from 1,000,000 ₫"),
    summary: L("Hàng do cửa hàng bán", "Items sold by the shop"),
    href: routes.deals(),
  },
};

const MAIN_CATEGORIES = [
  CATEGORY_ID.kitchen,
  CATEGORY_ID.knives,
  CATEGORY_ID.tableware,
  CATEGORY_ID.storage,
  CATEGORY_ID.textiles,
];

/** Menu `main` mẫu: năm danh mục có bảng xổ, rồi ba lối vào đặc biệt dồn phải. */
export function sampleMainMenu(locale: string): SiteMenu {
  const categories = MAIN_CATEGORIES.flatMap((id) => {
    const category = CATEGORIES.find((c) => c.id === id);
    if (!category) return [];
    const feature = FEATURES[id];
    const children = CATEGORIES.filter((c) => c.parent_id === id).map((child) =>
      link(text(child.names, locale), routes.category(text(child.slugs, locale)), {
        ref: { kind: "catalog.category", id: child.id },
      }),
    );
    return [
      link(text(category.names, locale), routes.category(text(category.slugs, locale)), {
        ref: { kind: "catalog.category", id },
        children,
        feature: feature
          ? {
              ref: { kind: "catalog.category", id },
              title: text(feature.title, locale),
              summary: text(feature.summary, locale),
              href: feature.href,
              image: null,
            }
          : null,
      }),
    ];
  });
  return {
    key: "main",
    locale,
    items: [
      ...categories,
      link(locale === "en" ? "Deals" : "Khuyến mại", routes.deals(), {
        icon: "tag",
        highlight: "sale",
        badge: { text: "−10%", tone: "sale" },
      }),
      link(text(SITE.marketplace, locale), routes.marketplace(), {
        icon: "store",
        highlight: "brand",
        badge: { text: locale === "en" ? "Market" : "Sàn", tone: "brand" },
      }),
      link(text(SITE.blogName, locale), routes.blog(), { icon: "book", highlight: "accent" }),
    ],
  };
}

/** Menu `footer` mẫu: ba cột có tiêu đề (mục không có `href`). */
export function sampleFooterMenu(locale: string): SiteMenu {
  const en = locale === "en";
  const column = (label: string, items: [string, string][]) =>
    link(label, null, { children: items.map(([name, href]) => link(name, href)) });
  return {
    key: "footer",
    locale,
    items: [
      column(en ? "Shop" : "Mua sắm", [
        [en ? "All products" : "Tất cả sản phẩm", routes.catalog()],
        [en ? "Deals" : "Khuyến mại", routes.deals()],
        ["Livestream", routes.live()],
        [text(SITE.marketplace, locale), routes.marketplace()],
        [en ? "Sell on our marketplace" : "Bán trên sàn của chúng tôi", routes.sellOn()],
        [en ? "Our stores" : "Hệ thống cửa hàng", routes.stores()],
      ]),
      column(en ? "Help" : "Hỗ trợ", [
        [en ? "Track an order" : "Tra cứu đơn hàng", routes.orderLookup()],
        [en ? "Returns policy" : "Chính sách đổi trả", "/chinh-sach-doi-tra"],
        [en ? "Delivery and inspection" : "Vận chuyển và kiểm hàng", "/van-chuyen"],
        [en ? "Payment" : "Thanh toán", "/thanh-toan-va-hoa-don"],
        [en ? "Complaints" : "Giải quyết khiếu nại", "/giai-quyet-khieu-nai"],
      ]),
      column(en ? "About us" : "Về chúng tôi", [
        [en ? "Owner information" : "Thông tin chủ sở hữu", "/thong-tin-chu-so-huu"],
        [en ? "Terms of use" : "Điều khoản sử dụng", "/dieu-khoan"],
        [en ? "Personal data protection" : "Bảo vệ dữ liệu cá nhân", "/bao-ve-du-lieu-ca-nhan"],
        [text(SITE.blogName, locale), routes.blog()],
      ]),
    ],
  };
}
