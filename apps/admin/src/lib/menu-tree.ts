// Cây menu của website ở dạng phẳng cho trình sửa: mỗi dòng có cấp (`depth`, 0 là cấp 1); khối của
// một mục là mục đó và mọi mục con liền sau. Thao tác lên, xuống, thụt vào, kéo ra di chuyển cả khối,
// giữ giới hạn 4 cấp. Hàm thuần, có test. Hình dạng mục theo `SiteMenuItemInput` của module `menus`
// (core v0.14.0, D-238); đổi giữa dạng của core và dạng nháp ở `menus.ts`.

/** Giới hạn của menu, như service của `menus` (`items.rs`). */
export const MAX_DEPTH = 4;
export const MAX_ITEMS = 200;
/** Số mục con tự lấy: 1 tới 50, mặc định 12. */
export const MAX_AUTO_CHILDREN = 50;
export const DEFAULT_AUTO_CHILDREN = 12;
/** Độ dài tối đa của chữ trên nhãn nổi bật và của nhãn mục. */
export const MAX_BADGE = 20;
export const MAX_LABEL = 200;

/** Bộ biểu tượng cố định của core (`ICONS` trong `items.rs`). */
export const MENU_ICONS = [
  "bag",
  "bolt",
  "book",
  "calendar",
  "cart",
  "category",
  "chat",
  "fire",
  "gift",
  "grid",
  "heart",
  "help",
  "home",
  "info",
  "mail",
  "map_pin",
  "news",
  "percent",
  "phone",
  "search",
  "shop",
  "sparkles",
  "star",
  "store",
  "tag",
  "truck",
  "user",
] as const;
export type MenuIcon = (typeof MENU_ICONS)[number];
export const BADGE_TONES = ["sale", "brand", "new", "neutral"] as const;
export type BadgeTone = (typeof BADGE_TONES)[number];
/** Cách làm nổi một mục; `null` là bình thường. */
export const HIGHLIGHTS = ["accent", "brand", "sale", "muted"] as const;
export type Highlight = (typeof HIGHLIGHTS)[number];

/** Một đối tượng của sổ đối tượng (`<module>.<loại>` và id), như `MenuTarget` của core. */
export interface MenuRef {
  kind: string;
  id: string;
}

/** Nhãn nổi bật; `from` / `until` là thời điểm RFC 3339 (UTC), hiện trong [`from`, `until`). */
export interface MenuBadge {
  text: string;
  tone: BadgeTone;
  from: string | null;
  until: string | null;
}

/**
 * Một mục của bản nháp: đích là `url`, `ref`, hay không có (nhóm tiêu đề). `id` chỉ để giao diện
 * nhận ra mục (id của core khi đọc, id mới khi thêm): core không nhận id khi lưu và cấp id mới cho
 * mọi mục sau mỗi lần lưu.
 */
export interface MenuItemDraft {
  id: string;
  label: string;
  url: string | null;
  ref: MenuRef | null;
  auto_children: boolean;
  /** Giữ cả khi tắt "tự lấy" để bật lại không mất số; chỉ gửi khi bật. */
  auto_children_limit: number;
  icon: MenuIcon | null;
  highlight: Highlight | null;
  badge: MenuBadge | null;
  feature: MenuRef | null;
  children: MenuItemDraft[];
}

export type FlatItem = Omit<MenuItemDraft, "children"> & { depth: number };

export type TargetType = "url" | "ref" | "group";

export function targetType(item: Pick<MenuItemDraft, "url" | "ref">): TargetType {
  if (item.ref) return "ref";
  if (item.url !== null) return "url";
  return "group";
}

export function flatten(items: readonly MenuItemDraft[], depth = 0): FlatItem[] {
  return items.flatMap(({ children, ...item }) => [
    { ...item, depth },
    ...flatten(children, depth + 1),
  ]);
}

/** Dạng phẳng về lại cây. Mục có cấp nhảy quá một bậc được kéo về ngay dưới mục trước. */
export function toTree(rows: readonly FlatItem[]): MenuItemDraft[] {
  const root: MenuItemDraft[] = [];
  const stack: { depth: number; children: MenuItemDraft[] }[] = [{ depth: -1, children: root }];
  for (const { depth, ...item } of rows) {
    while (stack.length > 1 && (stack.at(-1)?.depth ?? -1) >= depth) stack.pop();
    const node: MenuItemDraft = { ...item, children: [] };
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
    ref: null,
    auto_children: false,
    auto_children_limit: DEFAULT_AUTO_CHILDREN,
    icon: null,
    highlight: null,
    badge: null,
    feature: null,
  };
}

/**
 * Kiểm đường dẫn của mục đúng như service của `menus` (`is_link` trong `items.rs`): `https://`,
 * `http://`, `mailto:` hay đường dẫn trong site bắt đầu bằng đúng một `/`; từ chối `//host`
 * (trình duyệt coi là site khác, D-149), khoảng trắng, ký tự điều khiển và dấu `\`; tối đa 2048
 * ký tự.
 */
export function urlProblem(
  value: string,
): null | "empty" | "protocolRelative" | "invalidChar" | "tooLong" | "unsupported" {
  const url = value.trim();
  if (!url) return "empty";
  if (url.startsWith("//")) return "protocolRelative";
  // biome-ignore lint/suspicious/noControlCharactersInRegex: chặn ký tự điều khiển như core.
  if (/[\s\\\u0000-\u001f\u007f]/.test(url)) return "invalidChar";
  if (url.length > 2048) return "tooLong";
  const lower = url.toLowerCase();
  if (
    lower.startsWith("https://") ||
    lower.startsWith("http://") ||
    lower.startsWith("mailto:") ||
    url.startsWith("/")
  ) {
    return null;
  }
  return "unsupported";
}

/** Nhãn nổi bật đang hiện lúc `now` (RFC 3339): có chữ, trong [`from`, `until`). */
export function badgeShown(badge: MenuBadge | null, now: string): boolean {
  if (!badge?.text.trim()) return false;
  const at = Date.parse(now);
  if (badge.from && Date.parse(badge.from) > at) return false;
  if (badge.until && Date.parse(badge.until) <= at) return false;
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
