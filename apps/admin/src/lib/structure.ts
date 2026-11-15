// Phần thuần của màn "Trang và cấu trúc": cây trang, cây danh mục, tên theo ngôn ngữ. Dùng được ở
// máy chủ lẫn trình duyệt.
import type { components } from "@autoxide/sdk";
import type { Entry, Term } from "./content";

type Schemas = components["schemas"];
export type Redirect = Schemas["RedirectResponse"];
export type LegacyMenu = Schemas["MenuResponse"];
export type LegacyMenuItem = Schemas["MenuItemResponse"];

/** Một dòng của cây (trang hay danh mục): độ sâu, cha, đường dẫn ghép theo cây. */
export interface TreeRow<T> {
  node: T;
  depth: number;
  parent: T | null;
  /** Số con trực tiếp. */
  children: number;
}

/**
 * Xếp danh sách phẳng có `parent_id` thành cây theo thứ tự duyệt sâu (cha trước, con ngay sau).
 * Nút có cha không nằm trong danh sách (trang khác, đã lọc) đứng ở gốc. Chống vòng lặp: mỗi nút
 * chỉ đi qua một lần.
 */
export function flattenTree<T extends { id: string; parent_id?: string | null }>(
  nodes: readonly T[],
  order: (a: T, b: T) => number,
): TreeRow<T>[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kids = new Map<string, T[]>();
  const roots: T[] = [];
  for (const node of nodes) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent && parent.id !== node.id) {
      const list = kids.get(parent.id) ?? [];
      list.push(node);
      kids.set(parent.id, list);
    } else {
      roots.push(node);
    }
  }
  const rows: TreeRow<T>[] = [];
  const seen = new Set<string>();
  const walk = (node: T, depth: number, parent: T | null) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    const children = [...(kids.get(node.id) ?? [])].sort(order);
    rows.push({ node, depth, parent, children: children.length });
    for (const child of children) walk(child, depth + 1, node);
  };
  for (const root of [...roots].sort(order)) walk(root, 0, null);
  // Nút nằm trong vòng lặp (không tới được từ gốc): vẫn hiện, ở gốc.
  for (const node of nodes) if (!seen.has(node.id)) walk(node, 0, null);
  return rows;
}

/** Đường dẫn của một trang ghép theo cây: `/ve-chung-toi/cua-hang`. */
export function pagePath(page: Entry, pages: readonly Entry[]): string {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const parts: string[] = [];
  let current: Entry | undefined = page;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    parts.unshift(current.slug);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return `/${parts.join("/")}`;
}

/** Id của trang và mọi trang con, cháu của nó (không được làm trang cha của chính nó). */
export function descendants(
  id: string,
  pages: readonly { id: string; parent_id?: string | null }[],
) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const page of pages) {
      if (page.parent_id && out.has(page.parent_id) && !out.has(page.id)) {
        out.add(page.id);
        grew = true;
      }
    }
  }
  return out;
}

/** Trang có thể làm cha mới: cùng ngôn ngữ, không phải chính nó hay con cháu của nó. */
export function parentChoices(page: Entry, pages: readonly Entry[]): Entry[] {
  const banned = descendants(page.id, pages);
  return pages.filter((p) => p.locale === page.locale && !banned.has(p.id));
}

/** Tên của danh mục / thẻ theo ngôn ngữ; thiếu thì tên đầu tiên. */
export function termName(term: Term, locale: string): string {
  return (term.names.find((n) => n.locale === locale) ?? term.names[0])?.name ?? term.id;
}

/** Slug của danh mục / thẻ theo ngôn ngữ; thiếu thì slug đầu tiên. */
export function termSlug(term: Term, locale: string): string {
  return (term.names.find((n) => n.locale === locale) ?? term.names[0])?.slug ?? "";
}

/** Số mục (kể cả mục con) của một menu cũ. */
export function countItems(items: readonly LegacyMenuItem[]): number {
  return items.reduce((sum, item) => sum + 1 + countItems(item.children), 0);
}
