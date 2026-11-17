// Sổ điều hướng của khung quản trị: một nguồn duy nhất cho thanh bên, menu con, thanh đáy và
// bảng lệnh (Ctrl K). Mỗi phân hệ là một nhóm; mỗi màn trong nhóm có đường dẫn cố định, nên
// menu con giống nhau ở mọi màn của phân hệ (thiết kế: docs/research/ui-design.md mục 2.3 của core).
//
// Một mục chỉ hiện khi đủ hai điều: module của nó đã cài trên core (GET /api/v1/kernel/modules)
// và người dùng có permission của màn. Core vẫn kiểm quyền thật ở từng lời gọi; ẩn ở đây chỉ để
// không bày ra màn mà người dùng mở vào chỉ thấy lỗi. Khi core có sổ điều hướng (bước 51,
// `Module::navigation`) thì lấy danh sách này từ core thay cho file này.
import type { IconName } from "@/components/shell/icon";
import {
  AFFILIATE_FINANCE,
  AFFILIATE_LIVE_MANAGE,
  AFFILIATE_MANAGE,
  AFFILIATE_PARTNER,
  AFFILIATE_READ,
} from "@/lib/affiliate";
import { CATALOG_PRODUCTS_READ, INVENTORY_READ } from "@/lib/catalog";
import {
  CHANNELS_FINANCE_READ,
  CHANNELS_MANAGE,
  CHANNELS_ORDERS_MANAGE,
  CHANNELS_READ,
} from "@/lib/channels";
import {
  AUTH_CUSTOMERS_READ,
  CUSTOMERS_READ,
  CUSTOMERS_SEGMENTS_MANAGE,
  ORDERS_RISK_MANAGE,
} from "@/lib/customers";
import {
  COMMENTS_EXPORT,
  COMMENTS_MANAGE,
  COMMENTS_READ,
  FORMS_EXPORT,
  FORMS_READ,
  NEWSLETTER_EXPORT,
  NEWSLETTER_READ,
} from "@/lib/engage";
import { FINANCE_PERMISSIONS } from "@/lib/finance";
import { MARKET_PERMISSIONS, SELLER_SPACE_PERMISSIONS } from "@/lib/market";
import {
  ORDERS_MANAGE,
  ORDERS_POS_SELL,
  ORDERS_POS_SHIFT,
  ORDERS_READ,
  ORDERS_RETURNS_MANAGE,
  ORDERS_REVIEWS_MODERATE,
} from "@/lib/orders";
import {
  AUDIT_READ,
  CASES_READ,
  CONTENT_READ,
  DEVTOOLS_READ,
  DOCUMENTS_READ,
  KYC_READ,
  LEGAL_READ,
  MEDIA_READ,
  MENUS_READ,
  MODULES_READ,
  OPS_READ,
  PLACEMENTS_READ,
  PLANS_READ,
  POLICIES_MANAGE,
  PRIVACY_READ,
  PROVISION,
  ROLES_READ,
  SUBSCRIPTIONS_READ,
  SUPPORT_GRANT,
  TENANTS_READ,
  UNITS_READ,
  USERS_READ,
  WEBHOOKS_MANAGE,
} from "@/lib/permissions";
import { PROMOTIONS_READ } from "@/lib/promotions";
import {
  SHIPPING_CARRIERS_MANAGE,
  SHIPPING_COD_MANAGE,
  SHIPPING_READ,
  SHIPPING_SETTINGS_MANAGE,
  SHIPPING_SHIPMENTS_READ,
} from "@/lib/shipping";

export interface NavPage {
  /** Khoá của nhãn trong `messages/*.json` → `nav.pages.<id>`. */
  id: string;
  href: string;
  /** Module của core phải có mặt; bỏ trống = màn của chính giao diện. */
  module?: string;
  /**
   * Permission cần để xem màn; bỏ trống = mọi người đã đăng nhập. Một danh sách = có một trong
   * số đó là đủ (màn nhiều tab, mỗi tab một permission).
   */
  permission?: string | readonly string[];
  /** Chỉ đúng đường dẫn này mới tính là đang mở (trang gốc "/"). */
  exact?: boolean;
  /**
   * Màn dựng bằng dữ liệu mẫu, chờ API của bước `step` của core (W-006): chỉ hiện khi bật dữ liệu
   * mẫu, không đòi module đã cài (module chưa có trong core), vẫn theo permission.
   */
  sample?: { step: string };
  /**
   * Số đếm cạnh tên màn (`NavItem.counter` của bước 51, W-020): id các nguồn việc của `src/work/` cộng
   * lại; `"work"` = số việc đang chờ của hộp việc. Chỉ để hiện số, không đổi cách lọc menu.
   */
  counter?: "work" | readonly string[];
}

export interface NavGroup {
  /** Khoá của nhãn → `nav.groups.<id>`. */
  id: string;
  icon: IconName;
  pages: NavPage[];
}

/** Thứ tự cố định, theo 12 phân hệ của bản thiết kế. Chỉ ghi màn đã có trong ứng dụng này. */
export const NAV: NavGroup[] = [
  {
    id: "home",
    icon: "home",
    pages: [
      { id: "dashboard", href: "/", exact: true },
      // Việc và hoạt động (W-020): hộp việc gom từ mọi phân hệ, hoạt động gần đây, ghim, thông báo.
      { id: "work", href: "/work", counter: "work" },
    ],
  },
  {
    // Bán hàng: theo bản thiết kế gồm Đơn hàng, Vận chuyển, Cửa hàng, Kênh bán. Đơn hàng và Cửa hàng
    // (bước 45, W-017), Vận chuyển (bước 44, W-015) dựng bằng dữ liệu mẫu vì core chưa có module
    // `orders`, `shipping`; mỗi màn hiện khi xem được một trong các tab của nó. Kênh bán (bước 48) dựng sau.
    id: "sales",
    icon: "cart",
    pages: [
      {
        id: "orders",
        href: "/sales/orders",
        permission: [ORDERS_READ, ORDERS_RETURNS_MANAGE, ORDERS_POS_SELL],
        sample: { step: "45" },
        counter: ["orders.unconfirmed", "orders.returns_overdue"],
      },
      {
        id: "shipping",
        href: "/sales/shipping",
        permission: [
          SHIPPING_SHIPMENTS_READ,
          SHIPPING_READ,
          SHIPPING_SETTINGS_MANAGE,
          SHIPPING_COD_MANAGE,
          SHIPPING_CARRIERS_MANAGE,
        ],
        sample: { step: "44" },
        counter: ["shipping.cod_mismatch"],
      },
      {
        id: "stores",
        href: "/sales/stores",
        permission: [
          ORDERS_MANAGE,
          ORDERS_POS_SHIFT,
          ORDERS_RETURNS_MANAGE,
          ORDERS_REVIEWS_MODERATE,
        ],
        sample: { step: "45" },
      },
      {
        id: "channels",
        href: "/sales/channels",
        permission: [CHANNELS_READ, CHANNELS_MANAGE, CHANNELS_ORDERS_MANAGE, CHANNELS_FINANCE_READ],
        sample: { step: "48" },
      },
    ],
  },
  {
    // Sản phẩm: module `catalog` và `inventory` của core chưa có (bước 41, 42), nên hai màn dựng
    // bằng dữ liệu mẫu (W-006, W-013); vẫn lọc theo permission dự kiến của đặc tả.
    id: "catalog",
    icon: "box",
    pages: [
      {
        id: "catalog",
        href: "/catalog",
        permission: CATALOG_PRODUCTS_READ,
        sample: { step: "41" },
      },
      {
        id: "inventory",
        href: "/catalog/inventory",
        permission: INVENTORY_READ,
        sample: { step: "42" },
        counter: ["inventory.below_minimum"],
      },
    ],
  },
  {
    // Tiếp thị: khuyến mại (dữ liệu mẫu, chờ module `promotions` của bước 43, W-015) đứng đầu như
    // bản thiết kế; rồi biểu mẫu, bản tin, bình luận (module `forms`, `newsletter`, `comments`).
    // Tiếp thị liên kết (bước 49) vào nhóm này khi dựng.
    id: "mkt",
    icon: "mega",
    pages: [
      {
        id: "promotions",
        href: "/marketing/promotions",
        permission: PROMOTIONS_READ,
        sample: { step: "43" },
      },
      {
        id: "forms",
        href: "/marketing/forms",
        module: "forms",
        permission: [FORMS_READ, FORMS_EXPORT],
        counter: ["forms.new_submissions"],
      },
      {
        id: "newsletter",
        href: "/marketing/newsletter",
        module: "newsletter",
        permission: [NEWSLETTER_READ, NEWSLETTER_EXPORT],
      },
      {
        id: "comments",
        href: "/marketing/comments",
        module: "comments",
        permission: [COMMENTS_READ, COMMENTS_MANAGE, COMMENTS_EXPORT],
        counter: ["comments.pending"],
      },
      {
        id: "affiliate",
        href: "/marketing/affiliate",
        permission: [
          AFFILIATE_READ,
          AFFILIATE_MANAGE,
          AFFILIATE_FINANCE,
          AFFILIATE_LIVE_MANAGE,
          AFFILIATE_PARTNER,
        ],
        sample: { step: "49" },
      },
    ],
  },
  {
    id: "content",
    icon: "posts",
    pages: [
      {
        id: "entries",
        href: "/content",
        module: "content",
        permission: CONTENT_READ,
        counter: ["content.review"],
      },
      { id: "structure", href: "/content/structure", module: "content", permission: CONTENT_READ },
      // Menu của website là module `menus` riêng của core (D-238, W-022).
      { id: "menus", href: "/content/menus", module: "menus", permission: MENUS_READ },
      { id: "media", href: "/content/media", module: "media", permission: MEDIA_READ },
    ],
  },
  {
    // Khách hàng (bước 47, cùng tài khoản người mua của bước 34 và rủi ro COD của bước 45): module
    // `customers` chưa có trong core, nên màn dựng bằng dữ liệu mẫu (W-006, W-019).
    id: "buyers",
    icon: "user",
    pages: [
      {
        id: "customers",
        href: "/customers",
        permission: [
          CUSTOMERS_READ,
          AUTH_CUSTOMERS_READ,
          CUSTOMERS_SEGMENTS_MANAGE,
          ORDERS_RISK_MANAGE,
        ],
        sample: { step: "47" },
      },
    ],
  },
  {
    // Sàn: module `marketplace` của core chưa có (bước 46), nên màn "Vận hành sàn" dựng bằng dữ liệu
    // mẫu (W-006, W-018). Đứng sau Khách hàng (bước 47, chưa dựng) và trước Tài chính như `RAIL_TENANT`.
    id: "market",
    icon: "store",
    pages: [
      {
        id: "market",
        href: "/market",
        permission: MARKET_PERMISSIONS,
        sample: { step: "46" },
        counter: ["marketplace.disputes_due"],
      },
    ],
  },
  {
    // Tài chính: module `tax`, `ledger`, `invoices` của core chưa có (bước 36), nên màn "Kế toán"
    // dựng bằng dữ liệu mẫu (W-006, W-016); vẫn lọc theo permission dự kiến của đặc tả.
    id: "finance",
    icon: "wallet",
    pages: [
      {
        id: "finance",
        href: "/finance",
        permission: FINANCE_PERMISSIONS,
        sample: { step: "36" },
        counter: [
          "invoices.rejected",
          "ledger.exceptions",
          "ledger.periods_closable",
          "tax.rate_expiring",
        ],
      },
    ],
  },
  {
    id: "org",
    icon: "org",
    pages: [
      // Cây tổ chức: module `organizations` của core (bước 34).
      { id: "orgTree", href: "/org", permission: UNITS_READ, module: "organizations" },
      // Không ghi `module`: không có module `auth` thì không đăng nhập được vào trang này.
      { id: "access", href: "/org/access", permission: [USERS_READ, ROLES_READ] },
    ],
  },
  {
    // Tuân thủ pháp luật Việt Nam (module `compliance` của bước 37, chưa có): dữ liệu mẫu (W-012).
    id: "legal",
    icon: "shield",
    pages: [
      {
        id: "compliance",
        href: "/compliance",
        permission: [LEGAL_READ, KYC_READ, PRIVACY_READ, DOCUMENTS_READ, CASES_READ],
        sample: { step: "37" },
        counter: [
          "compliance.website_dossier",
          "compliance.kyc_pending",
          "compliance.incident_deadline",
        ],
      },
      {
        id: "complianceRecords",
        href: "/compliance/records",
        permission: [LEGAL_READ, PRIVACY_READ, DOCUMENTS_READ, CASES_READ, POLICIES_MANAGE],
        sample: { step: "37" },
      },
    ],
  },
  {
    id: "settings",
    icon: "gear",
    pages: [
      // Cài đặt chung: nhiều tab của nhiều module (module, webhook, audit…); hiện khi xem được một
      // trong các tab thật. Tab dữ liệu mẫu (gói, tên miền…) theo permission riêng của nó.
      {
        id: "general",
        href: "/settings",
        permission: [MODULES_READ, WEBHOOKS_MANAGE, AUDIT_READ],
      },
      // API key là của riêng người đăng nhập: ai cũng tạo được cho mình (core giới hạn theo quyền).
      { id: "apiKeys", href: "/settings/api-keys", counter: ["kernel.approvals"] },
      {
        id: "developers",
        href: "/settings/developers",
        permission: [WEBHOOKS_MANAGE, DEVTOOLS_READ],
      },
    ],
  },
];

/** Màn của riêng người đang đăng nhập; không thuộc phân hệ nào nên không lên thanh bên. */
export const ACCOUNT_PAGE: NavPage = { id: "account", href: "/account" };

/**
 * Không gian của khung (W-014). `tenant` (mặc định): không gian của một khách, sổ `NAV`. `platform`:
 * mặt điều khiển của nhân sự vận hành nền tảng (mọi đường dẫn dưới `/platform`), sổ `NAV_PLATFORM`,
 * thanh bên, đầu trang và thanh đáy riêng. Hai không gian không trộn mục của nhau.
 */
export type Workspace = "tenant" | "platform" | "seller";

/** Trang đầu của mặt điều khiển nền tảng. */
export const PLATFORM_HOME = "/platform";

/** Trang đầu của Trung tâm người bán (W-018). */
export const SELLER_HOME = "/seller";

/**
 * Sổ của mặt điều khiển nền tảng: mỗi nhóm một mục thanh bên, theo thứ tự của bản thiết kế
 * (`RAIL_PLATFORM`). Khách hàng và đội database dùng API thật của bước 33 (W-027); gói, thuê bao, cấp
 * phát, sức khoẻ, vào dữ liệu khách chờ bước 34, 35, 39: dựng bằng dữ liệu mẫu (W-006), permission là
 * tên dự kiến trong đặc tả bước (admin có sẵn mọi permission).
 */
export const NAV_PLATFORM: NavGroup[] = [
  {
    id: "platformTenants",
    icon: "users",
    pages: [{ id: "platformTenants", href: PLATFORM_HOME, permission: TENANTS_READ }],
  },
  {
    id: "platformPlans",
    icon: "tag",
    pages: [
      {
        id: "platformPlans",
        href: "/platform/plans",
        permission: PLANS_READ,
        sample: { step: "35" },
      },
    ],
  },
  {
    id: "platformSubscriptions",
    icon: "card",
    pages: [
      {
        id: "platformSubscriptions",
        href: "/platform/subscriptions",
        permission: SUBSCRIPTIONS_READ,
        sample: { step: "35" },
      },
    ],
  },
  {
    id: "platformProvisioning",
    icon: "rocket",
    pages: [
      {
        id: "platformProvisioning",
        href: "/platform/provisioning",
        permission: PROVISION,
      },
    ],
  },
  {
    id: "platformFleet",
    icon: "db",
    pages: [{ id: "platformFleet", href: "/platform/fleet", permission: PLACEMENTS_READ }],
  },
  {
    id: "platformHealth",
    icon: "pulse",
    pages: [
      {
        id: "platformHealth",
        href: "/platform/health",
        permission: OPS_READ,
        sample: { step: "39" },
      },
    ],
  },
  {
    id: "platformSupport",
    icon: "key",
    pages: [
      {
        id: "platformSupport",
        href: "/platform/support",
        permission: SUPPORT_GRANT,
      },
    ],
  },
];

/**
 * Sổ của Trung tâm người bán (W-018): không gian thứ ba, cho người bán trên sàn — chỉ thấy dữ liệu của
 * nút người bán của mình. Thanh bên rút gọn theo `RAIL_SELLER` của bản thiết kế. Cả không gian chờ API
 * của bước 46 (dữ liệu mẫu, W-006). Hiện cho người bán (`marketplace.sell`) và cho người xem được hồ sơ
 * người bán để "Xem như người bán" (lối thử, không cấp quyền gì).
 */
export const NAV_SELLER: NavGroup[] = (
  [
    ["sellerHome", "home", SELLER_HOME],
    ["sellerOrders", "cart", "/seller/orders"],
    ["sellerProducts", "box", "/seller/products"],
    ["sellerShop", "store", "/seller/shop"],
    ["sellerMoney", "wallet", "/seller/money"],
  ] as const
).map(([id, icon, href]) => ({
  id,
  icon,
  pages: [
    {
      id,
      href,
      permission: SELLER_SPACE_PERMISSIONS,
      sample: { step: "46" },
      ...(href === SELLER_HOME ? { exact: true } : {}),
    },
  ],
}));

/** Sổ điều hướng của một không gian. */
export function navOf(workspace: Workspace): NavGroup[] {
  if (workspace === "platform") return NAV_PLATFORM;
  if (workspace === "seller") return NAV_SELLER;
  return NAV;
}

/**
 * Không gian của một đường dẫn: `/platform` và mọi trang con là mặt điều khiển nền tảng; `/seller` và
 * mọi trang con là Trung tâm người bán.
 */
export function workspaceOf(pathname: string): Workspace {
  const under = (home: string) => pathname === home || pathname.startsWith(`${home}/`);
  if (under(PLATFORM_HOME)) return "platform";
  if (under(SELLER_HOME)) return "seller";
  return "tenant";
}

export interface Viewer {
  /** `true` khi một role cấp mọi permission (role `admin` của core). */
  allPermissions: boolean;
  permissions: readonly string[];
  /** Tên các module đã cài trên core; `null` khi người dùng không được xem sổ module. */
  modules: readonly string[] | null;
  /** Đang bật dữ liệu mẫu (`AUTOXIDE_WEB_SAMPLE_DATA`); tắt thì màn dữ liệu mẫu không hiện. */
  sample?: boolean;
}

/** Người này có permission `wanted` (hoặc một trong danh sách). */
export function holds(viewer: Viewer, wanted: string | readonly string[]): boolean {
  if (viewer.allPermissions) return true;
  const list = typeof wanted === "string" ? [wanted] : wanted;
  return list.some((name) => viewer.permissions.includes(name));
}

function canSee(page: NavPage, viewer: Viewer): boolean {
  if (page.permission && !holds(viewer, page.permission)) {
    return false;
  }
  if (page.sample) {
    return viewer.sample === true;
  }
  // Không xem được sổ module thì không biết module nào đã cài: tin vào permission (core có
  // module đó thì người dùng mới có permission của nó).
  if (page.module && viewer.modules !== null && !viewer.modules.includes(page.module)) {
    return false;
  }
  return true;
}

/** Các nhóm và màn người này được thấy; nhóm không còn màn nào thì bỏ. */
export function visibleNav(viewer: Viewer, nav: readonly NavGroup[] = NAV): NavGroup[] {
  return nav
    .map((group) => ({ ...group, pages: group.pages.filter((page) => canSee(page, viewer)) }))
    .filter((group) => group.pages.length > 0);
}

function matches(page: NavPage, pathname: string): number {
  if (page.exact) {
    return pathname === page.href ? page.href.length : -1;
  }
  return pathname === page.href || pathname.startsWith(`${page.href}/`) ? page.href.length : -1;
}

/** Màn đang mở: màn có đường dẫn khớp dài nhất với địa chỉ hiện tại. */
export function activePage(
  nav: readonly NavGroup[],
  pathname: string,
): { group: NavGroup; page: NavPage } | null {
  let best: { group: NavGroup; page: NavPage; score: number } | null = null;
  for (const group of nav) {
    for (const page of group.pages) {
      const score = matches(page, pathname);
      if (score >= 0 && (best === null || score > best.score)) {
        best = { group, page, score };
      }
    }
  }
  return best ? { group: best.group, page: best.page } : null;
}
