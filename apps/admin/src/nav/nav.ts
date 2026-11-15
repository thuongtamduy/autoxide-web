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
  COMMENTS_EXPORT,
  COMMENTS_MANAGE,
  COMMENTS_READ,
  FORMS_EXPORT,
  FORMS_READ,
  NEWSLETTER_EXPORT,
  NEWSLETTER_READ,
} from "@/lib/engage";
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
}

export interface NavGroup {
  /** Khoá của nhãn → `nav.groups.<id>`. */
  id: string;
  icon: IconName;
  pages: NavPage[];
}

/** Thứ tự cố định, theo 12 phân hệ của bản thiết kế. Chỉ ghi màn đã có trong ứng dụng này. */
export const NAV: NavGroup[] = [
  { id: "home", icon: "home", pages: [{ id: "dashboard", href: "/", exact: true }] },
  {
    // Tiếp thị: biểu mẫu, bản tin, bình luận (module `forms`, `newsletter`, `comments`). Khuyến
    // mại và tiếp thị liên kết (bước 43, 49) vào nhóm này khi dựng.
    id: "mkt",
    icon: "mega",
    pages: [
      {
        id: "forms",
        href: "/marketing/forms",
        module: "forms",
        permission: [FORMS_READ, FORMS_EXPORT],
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
      },
    ],
  },
  {
    id: "content",
    icon: "posts",
    pages: [
      { id: "entries", href: "/content", module: "content", permission: CONTENT_READ },
      { id: "structure", href: "/content/structure", module: "content", permission: CONTENT_READ },
      // Menu của website là module `menus` riêng (chưa có trong core): dữ liệu mẫu (W-006).
      { id: "menus", href: "/content/menus", permission: MENUS_READ, sample: { step: "menus" } },
      { id: "media", href: "/content/media", module: "media", permission: MEDIA_READ },
    ],
  },
  {
    id: "org",
    icon: "org",
    pages: [
      // Cây tổ chức: chờ API của bước 34 (module `organizations`), dựng bằng dữ liệu mẫu (W-012).
      { id: "orgTree", href: "/org", permission: UNITS_READ, sample: { step: "34" } },
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
      { id: "apiKeys", href: "/settings/api-keys" },
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
export type Workspace = "tenant" | "platform";

/** Trang đầu của mặt điều khiển nền tảng. */
export const PLATFORM_HOME = "/platform";

/**
 * Sổ của mặt điều khiển nền tảng: mỗi nhóm một mục thanh bên, theo thứ tự của bản thiết kế
 * (`RAIL_PLATFORM`). Cả mặt điều khiển chờ API của bước 33, 34, 35, 39 của core: dựng bằng dữ liệu
 * mẫu (W-006); permission là tên dự kiến trong đặc tả bước (admin có sẵn mọi permission).
 */
export const NAV_PLATFORM: NavGroup[] = [
  {
    id: "platformTenants",
    icon: "users",
    pages: [
      {
        id: "platformTenants",
        href: PLATFORM_HOME,
        permission: TENANTS_READ,
        sample: { step: "33" },
      },
    ],
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
        sample: { step: "35" },
      },
    ],
  },
  {
    id: "platformFleet",
    icon: "db",
    pages: [
      {
        id: "platformFleet",
        href: "/platform/fleet",
        permission: PLACEMENTS_READ,
        sample: { step: "33" },
      },
    ],
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
        sample: { step: "34" },
      },
    ],
  },
];

/** Sổ điều hướng của một không gian. */
export function navOf(workspace: Workspace): NavGroup[] {
  return workspace === "platform" ? NAV_PLATFORM : NAV;
}

/** Không gian của một đường dẫn: `/platform` và mọi trang con là mặt điều khiển nền tảng. */
export function workspaceOf(pathname: string): Workspace {
  return pathname === PLATFORM_HOME || pathname.startsWith(`${PLATFORM_HOME}/`)
    ? "platform"
    : "tenant";
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
