// Sổ điều hướng của khung quản trị: một nguồn duy nhất cho thanh bên, menu con, thanh đáy và
// bảng lệnh (Ctrl K). Mỗi phân hệ là một nhóm; mỗi màn trong nhóm có đường dẫn cố định, nên
// menu con giống nhau ở mọi màn của phân hệ (thiết kế: docs/research/ui-design.md mục 2.3 của core).
//
// Một mục chỉ hiện khi đủ hai điều: module của nó đã cài trên core (GET /api/v1/kernel/modules)
// và người dùng có permission của màn. Core vẫn kiểm quyền thật ở từng lời gọi; ẩn ở đây chỉ để
// không bày ra màn mà người dùng mở vào chỉ thấy lỗi. Khi core có sổ điều hướng (bước 51,
// `Module::navigation`) thì lấy danh sách này từ core thay cho file này.
import type { IconName } from "@/components/shell/icon";

export interface NavPage {
  /** Khoá của nhãn trong `messages/*.json` → `nav.pages.<id>`. */
  id: string;
  href: string;
  /** Module của core phải có mặt; bỏ trống = màn của chính giao diện. */
  module?: string;
  /** Permission cần để xem màn; bỏ trống = mọi người đã đăng nhập. */
  permission?: string;
  /** Chỉ đúng đường dẫn này mới tính là đang mở (trang gốc "/"). */
  exact?: boolean;
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
    id: "settings",
    icon: "gear",
    pages: [
      {
        id: "modules",
        href: "/settings/modules",
        module: "kernel",
        permission: "kernel.modules.read",
      },
    ],
  },
];

/** Màn của riêng người đang đăng nhập; không thuộc phân hệ nào nên không lên thanh bên. */
export const ACCOUNT_PAGE: NavPage = { id: "account", href: "/account" };

export interface Viewer {
  /** `true` khi một role cấp mọi permission (role `admin` của core). */
  allPermissions: boolean;
  permissions: readonly string[];
  /** Tên các module đã cài trên core; `null` khi người dùng không được xem sổ module. */
  modules: readonly string[] | null;
}

function canSee(page: NavPage, viewer: Viewer): boolean {
  if (page.permission && !viewer.allPermissions && !viewer.permissions.includes(page.permission)) {
    return false;
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
