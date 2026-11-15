// Cây menu của website ở dạng phẳng cho trình sửa: mỗi dòng có cấp (`depth`, 0 là cấp 1); khối của
// một mục là mục đó và mọi mục con liền sau. Thao tác lên, xuống, thụt vào, kéo ra di chuyển cả khối,
// giữ giới hạn 4 cấp. Hàm thuần, có test; hình dạng mục theo đề bài module `menus` của core.

/** Giới hạn của menu, như menu cũ của `content`. */
export const MAX_DEPTH = 4;
export const MAX_ITEMS = 200;

export const MENU_ICONS = [
  "grid",
  "pan",
  "pot",
  "knife",
  "glass",
  "bowl",
  "towel",
  "tag",
  "store",
  "book",
  "gift",
  "pin",
] as const;
export type MenuIcon = (typeof MENU_ICONS)[number];
export const BADGE_TONES = ["sale", "brand", "new", "neutral"] as const;
export type BadgeTone = (typeof BADGE_TONES)[number];
export const HIGHLIGHTS = ["none", "sale", "brand"] as const;
export type Highlight = (typeof HIGHLIGHTS)[number];

/** Một mục menu gửi lên (`PUT /api/v1/menus/{id}`): đích là `url`, `ref_*`, hay không có (nhóm). */
export interface MenuItemInput {
  id: string;
  label: string;
  url: string | null;
  ref_kind: string | null;
  ref_id: string | null;
  auto_children: boolean;
  auto_children_limit: number;
  icon: MenuIcon | null;
  badge_text: string;
  badge_tone: BadgeTone;
  /** Ngày `YYYY-MM-DD` (UTC) nhãn bắt đầu hiện / thôi hiện; `null` là không giới hạn. */
  badge_from: string | null;
  badge_until: string | null;
  highlight: Highlight;
  feature_kind: string | null;
  feature_id: string | null;
  children: MenuItemInput[];
}

export type FlatItem = Omit<MenuItemInput, "children"> & { depth: number };

export type TargetType = "url" | "ref" | "group";

export function targetType(item: Pick<MenuItemInput, "url" | "ref_kind">): TargetType {
  if (item.ref_kind) return "ref";
  if (item.url !== null) return "url";
  return "group";
}

export function flatten(items: readonly MenuItemInput[], depth = 0): FlatItem[] {
  return items.flatMap(({ children, ...item }) => [
    { ...item, depth },
    ...flatten(children, depth + 1),
  ]);
}

/** Dạng phẳng về lại cây. Mục có cấp nhảy quá một bậc được kéo về ngay dưới mục trước. */
export function toTree(rows: readonly FlatItem[]): MenuItemInput[] {
  const root: MenuItemInput[] = [];
  const stack: { depth: number; children: MenuItemInput[] }[] = [{ depth: -1, children: root }];
  for (const { depth, ...item } of rows) {
    while (stack.length > 1 && (stack.at(-1)?.depth ?? -1) >= depth) stack.pop();
    const node: MenuItemInput = { ...item, children: [] };
    stack.at(-1)?.children.push(node);
    stack.push({ depth: (stack.at(-1)?.depth ?? -1) + 1, children: node.children });
  }
  return root;
}

/** Hết khối của mục `i` (chỉ số ngay sau mục con cuối cùng). */
export function blockEnd(rows: readonly FlatItem[], i: number): number {
  const depth = rows[i]?.depth ?? 0;
  let j = i + 1;
  while (j < rows.length && (rows[j]?.depth ?? 0) > depth) j++;
  return j;
}

function prevSibling(rows: readonly FlatItem[], i: number): number {
  const depth = rows[i]?.depth ?? 0;
  for (let k = i - 1; k >= 0; k--) {
    const d = rows[k]?.depth ?? 0;
    if (d === depth) return k;
    if (d < depth) return -1;
  }
  return -1;
}

function nextSibling(rows: readonly FlatItem[], i: number): number {
  const end = blockEnd(rows, i);
  return end < rows.length && rows[end]?.depth === rows[i]?.depth ? end : -1;
}

function parentIndex(rows: readonly FlatItem[], i: number): number {
  const depth = rows[i]?.depth ?? 0;
  for (let k = i - 1; k >= 0; k--) if ((rows[k]?.depth ?? 0) < depth) return k;
  return -1;
}

function deepest(block: readonly FlatItem[]): number {
  return Math.max(...block.map((row) => row.depth));
}

export type MoveResult =
  | { ok: true; rows: FlatItem[] }
  | { ok: false; reason: "edge" | "depth" | "noSibling" };

export function moveUp(rows: readonly FlatItem[], i: number): MoveResult {
  const p = prevSibling(rows, i);
  if (p < 0) return { ok: false, reason: "edge" };
  const end = blockEnd(rows, i);
  return {
    ok: true,
    rows: [...rows.slice(0, p), ...rows.slice(i, end), ...rows.slice(p, i), ...rows.slice(end)],
  };
}

export function moveDown(rows: readonly FlatItem[], i: number): MoveResult {
  const n = nextSibling(rows, i);
  if (n < 0) return { ok: false, reason: "edge" };
  const nEnd = blockEnd(rows, n);
  return {
    ok: true,
    rows: [...rows.slice(0, i), ...rows.slice(n, nEnd), ...rows.slice(i, n), ...rows.slice(nEnd)],
  };
}

/** Thụt vào: thành mục con cuối của mục cùng cấp ngay phía trên. */
export function indent(rows: readonly FlatItem[], i: number): MoveResult {
  if (prevSibling(rows, i) < 0) return { ok: false, reason: "noSibling" };
  const end = blockEnd(rows, i);
  const block = rows.slice(i, end);
  if (deepest(block) + 1 >= MAX_DEPTH) return { ok: false, reason: "depth" };
  return {
    ok: true,
    rows: [
      ...rows.slice(0, i),
      ...block.map((row) => ({ ...row, depth: row.depth + 1 })),
      ...rows.slice(end),
    ],
  };
}

/** Kéo ra: thành mục cùng cấp với cha, đứng ngay sau khối của cha. */
export function outdent(rows: readonly FlatItem[], i: number): MoveResult {
  if ((rows[i]?.depth ?? 0) === 0) return { ok: false, reason: "edge" };
  const parent = parentIndex(rows, i);
  const end = blockEnd(rows, i);
  const block = rows.slice(i, end).map((row) => ({ ...row, depth: row.depth - 1 }));
  const rest = [...rows.slice(0, i), ...rows.slice(end)];
  const parentEnd = blockEnd(rest, parent);
  return { ok: true, rows: [...rest.slice(0, parentEnd), ...block, ...rest.slice(parentEnd)] };
}

/** Bỏ một mục cùng mọi mục con của nó. */
export function removeBlock(rows: readonly FlatItem[], i: number): FlatItem[] {
  return [...rows.slice(0, i), ...rows.slice(blockEnd(rows, i))];
}

/** Thêm `item` làm mục con cuối của mục `i` (hay cuối menu khi `i < 0`). */
export function addChild(rows: readonly FlatItem[], i: number, item: FlatItem): MoveResult {
  if (i < 0) return { ok: true, rows: [...rows, { ...item, depth: 0 }] };
  const depth = (rows[i]?.depth ?? 0) + 1;
  if (depth >= MAX_DEPTH) return { ok: false, reason: "depth" };
  const end = blockEnd(rows, i);
  return { ok: true, rows: [...rows.slice(0, end), { ...item, depth }, ...rows.slice(end)] };
}

/** Một mục trống (đích là đường dẫn `/`). */
export function blankItem(id: string, label: string): FlatItem {
  return {
    id,
    depth: 0,
    label,
    url: "/",
    ref_kind: null,
    ref_id: null,
    auto_children: false,
    auto_children_limit: 6,
    icon: null,
    badge_text: "",
    badge_tone: "neutral",
    badge_from: null,
    badge_until: null,
    highlight: "none",
    feature_kind: null,
    feature_id: null,
  };
}

/**
 * Kiểm đường dẫn của mục như service của `menus` sẽ kiểm: `https://`, `mailto:`, hay đường dẫn
 * trong site `/…`; từ chối `//host` (trình duyệt tự đoán giao thức, D-149 của core) và `http://`.
 */
export function urlProblem(
  value: string,
): null | "empty" | "protocolRelative" | "insecure" | "unsupported" {
  const url = value.trim();
  if (!url) return "empty";
  if (url.startsWith("//")) return "protocolRelative";
  if (/^https:\/\/[^\s/]+\.[^\s/]+/i.test(url)) return null;
  if (/^http:\/\//i.test(url)) return "insecure";
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(url)) return null;
  if (/^\/(?!\/)\S*$/.test(url)) return null;
  return "unsupported";
}

/** Nhãn có hạn đang hiện vào ngày `today` (`YYYY-MM-DD`, UTC). */
export function badgeShown(
  item: Pick<MenuItemInput, "badge_text" | "badge_from" | "badge_until">,
  today: string,
): boolean {
  if (!item.badge_text.trim()) return false;
  if (item.badge_from && item.badge_from > today) return false;
  if (item.badge_until && item.badge_until < today) return false;
  return true;
}

/** Đường các nhãn từ cấp 1 tới mục `i` (`Danh mục › Dụng cụ nấu`), để báo lỗi đúng chỗ. */
export function pathOf(
  rows: readonly FlatItem[],
  i: number,
  label: (row: FlatItem) => string,
): string {
  const parts = [label(rows[i] as FlatItem)];
  let k = parentIndex(rows, i);
  while (k >= 0) {
    parts.unshift(label(rows[k] as FlatItem));
    k = parentIndex(rows, k);
  }
  return parts.join(" › ");
}
