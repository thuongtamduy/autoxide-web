// Đổi menu công khai của core (`PublicSiteMenu`) thành mô hình để vẽ đầu trang và chân trang.
// Hàm thuần: dùng chung cho menu thật và menu mẫu (cùng hình dạng).
import { type IconName, isIconName } from "@/components/icon";
import type { SiteMenuItem } from "./types";

export interface NavLink {
  label: string;
  href: string;
  /** Địa chỉ ngoài website (`http(s)://`, `mailto:`, `tel:`): dùng `<a>` thường, không thêm `/en`. */
  external: boolean;
}

export interface NavGroup {
  /** Tiêu đề cột (mục không có `href`); `null` cho nhóm mặc định. */
  heading: string | null;
  links: NavLink[];
}

export type Highlight = "accent" | "brand" | "sale" | "muted";

export interface NavItem {
  label: string;
  link: NavLink | null;
  icon: IconName | null;
  highlight: Highlight | null;
  badge: { text: string; tone: string } | null;
  groups: NavGroup[];
  feature: { title: string; summary: string; link: NavLink | null } | null;
  /** Đối tượng mục trỏ tới (vd `catalog.category`), để lấy thêm "bán chạy". */
  ref: { kind: string; id: string } | null;
}

const EXTERNAL = /^(https?:|mailto:|tel:)/i;

export function toLink(label: string, href: string | null | undefined): NavLink | null {
  if (!href) return null;
  const external = EXTERNAL.test(href);
  if (!external && !(href.startsWith("/") && !href.startsWith("//")) && !href.startsWith("#")) {
    return null;
  }
  return { label, href, external };
}

function highlightOf(value: string | null | undefined): Highlight | null {
  return value === "accent" || value === "brand" || value === "sale" || value === "muted"
    ? value
    : null;
}

/** Nhóm con của một mục: con có con là một cột có tiêu đề; con lá gom vào nhóm mặc định. */
export function groupsOf(item: SiteMenuItem): NavGroup[] {
  const loose: NavLink[] = [];
  const headed: NavGroup[] = [];
  for (const child of item.children) {
    if (child.children.length > 0) {
      const links = child.children.flatMap((c) => toLink(c.label, c.href) ?? []);
      const self = toLink(child.label, child.href);
      headed.push({ heading: child.label, links: self ? [self, ...links] : links });
    } else {
      const link = toLink(child.label, child.href);
      if (link) loose.push(link);
    }
  }
  return [...(loose.length > 0 ? [{ heading: null, links: loose }] : []), ...headed];
}

export function toNavItem(item: SiteMenuItem): NavItem {
  return {
    label: item.label,
    link: toLink(item.label, item.href),
    icon: isIconName(item.icon) ? item.icon : null,
    highlight: highlightOf(item.highlight),
    badge: item.badge ? { text: item.badge.text, tone: item.badge.tone } : null,
    groups: groupsOf(item),
    feature: item.feature
      ? {
          title: item.feature.title,
          summary: item.feature.summary,
          link: toLink(item.feature.title, item.feature.href),
        }
      : null,
    ref: item.ref ? { kind: item.ref.kind, id: item.ref.id } : null,
  };
}

/**
 * Thanh danh mục: mục thường (danh mục, có bảng xổ) đứng trước; mục có `highlight` (lối vào đặc
 * biệt: Khuyến mại, sàn, bài viết) dồn sang phải, như bản thiết kế.
 */
export function splitMainMenu(items: readonly SiteMenuItem[]): {
  categories: NavItem[];
  specials: NavItem[];
} {
  const all = items.map(toNavItem).filter((item) => item.link || item.groups.length > 0);
  return {
    categories: all.filter((item) => item.highlight === null),
    specials: all.filter((item) => item.highlight !== null),
  };
}

/**
 * Cột của chân trang: mục có con là một cột (tiêu đề + link); mục lá gom vào một cột không tiêu đề
 * ở cuối. Cột rỗng bị bỏ.
 */
export function footerColumns(items: readonly SiteMenuItem[]): NavGroup[] {
  const columns: NavGroup[] = [];
  const loose: NavLink[] = [];
  for (const item of items) {
    if (item.children.length > 0) {
      const links = item.children.flatMap((child) => toLink(child.label, child.href) ?? []);
      if (links.length > 0) columns.push({ heading: item.label, links });
    } else {
      const link = toLink(item.label, item.href);
      if (link) loose.push(link);
    }
  }
  if (loose.length > 0) columns.push({ heading: null, links: loose });
  return columns;
}
