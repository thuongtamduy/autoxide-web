// Màn Menu của website (module `menus` của core, D-238): kiểu của API, đổi giữa dạng của core và
// bản nháp của trình sửa, đưa lỗi của core về đúng mục, xem trước mặt tiền, xem trước lệnh nhập
// menu cũ. Hàm thuần, chạy được cả ở máy chủ lẫn trình duyệt (không đọc token), có test.
import type { components, Problem } from "@autoxide/sdk";
import {
  BADGE_TONES,
  type BadgeTone,
  badgeShown,
  DEFAULT_AUTO_CHILDREN,
  type FlatItem,
  HIGHLIGHTS,
  type Highlight,
  MENU_ICONS,
  type MenuIcon,
  type MenuItemDraft,
  type MenuRef,
  targetType,
  toTree,
} from "./menu-tree";

type Schemas = components["schemas"];
export type SiteMenu = Schemas["SiteMenu"];
export type SiteMenuSummary = Schemas["SiteMenuSummary"];
export type SiteMenuItem = Schemas["SiteMenuItem"];
export type SiteMenuItemInput = Schemas["SiteMenuItemInput"];
export type PublicSiteMenu = Schemas["PublicSiteMenu"];
export type PublicSiteMenuItem = Schemas["PublicSiteMenuItem"];
export type LegacyMenu = Schemas["MenuResponse"];

/** Một loại đối tượng mục menu trỏ tới được. */
export interface RefKind {
  kind: string;
  /** Loại có cây (danh mục): bật được "tự lấy nhóm con". */
  tree: boolean;
  /** Bước của core sẽ đăng ký loại này; `null` khi core đã có (do module đã cài đăng ký). */
  step: string | null;
}

/**
 * Loại đối tượng core đã có (D-123, D-238): `content.entry` (bài, trang) và `content.term` (danh
 * mục, thẻ; có cây). Core chưa có API liệt kê loại (sổ đối tượng, bước 51 P6), nên giao diện ghi
 * hai loại này ở đây; core vẫn là bên kiểm (`menus.ref_unknown_kind` khi loại không còn).
 */
export const CORE_REF_KINDS: readonly RefKind[] = [
  { kind: "content.entry", tree: false, step: null },
  { kind: "content.term", tree: true, step: null },
];

/** Một đối tượng để chọn làm đích hay ô gợi ý của mục menu. */
export interface RefObject {
  kind: string;
  id: string;
  title: string;
  /** Dòng phụ: slug, loại bài, mô tả ngắn. */
  hint: string;
  /** Còn công khai: không thì mặt tiền bỏ mục trỏ tới nó (kèm mục con). */
  public: boolean;
  /** Tên các nhóm con (loại có cây), cho xem trước "tự lấy nhóm con". */
  children: string[];
  /** Đối tượng mẫu (W-006): loại chưa có trong core, core sẽ từ chối khi lưu. */
  sample: boolean;
}

/** Khoá i18n của một loại: `content.entry` → `content_entry`. */
export function kindKey(kind: string): string {
  return kind.replaceAll(".", "_");
}

const isIcon = (value: string | null | undefined): value is MenuIcon =>
  (MENU_ICONS as readonly string[]).includes(value ?? "");
const isHighlight = (value: string | null | undefined): value is Highlight =>
  (HIGHLIGHTS as readonly string[]).includes(value ?? "");
const isTone = (value: string): value is BadgeTone =>
  (BADGE_TONES as readonly string[]).includes(value);

/** Cây mục như core trả (`SiteMenuItem`) thành bản nháp của trình sửa. */
export function fromSaved(items: readonly SiteMenuItem[]): MenuItemDraft[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    url: item.url ?? null,
    ref: item.ref ? { kind: item.ref.kind, id: item.ref.id } : null,
    auto_children: item.auto_children,
    auto_children_limit: item.auto_children_limit ?? DEFAULT_AUTO_CHILDREN,
    // Core chỉ lưu giá trị trong tập cố định; giá trị lạ (core mới hơn) thì coi như không có.
    icon: isIcon(item.icon) ? item.icon : null,
    highlight: isHighlight(item.highlight) ? item.highlight : null,
    badge: item.badge
      ? {
          text: item.badge.text,
          tone: isTone(item.badge.tone) ? item.badge.tone : "neutral",
          from: item.badge.from ?? null,
          until: item.badge.until ?? null,
        }
      : null,
    feature: item.feature ? { kind: item.feature.kind, id: item.feature.id } : null,
    children: fromSaved(item.children),
  }));
}

/**
 * Bản nháp thành thân `PUT /api/v1/menus/{id}` (`SiteMenuItemInput`): một trong `url` / `ref` /
 * không có; `auto_children_limit` chỉ gửi khi bật (core từ chối số lẻ loi); nhãn nổi bật không chữ
 * thì không gửi. Trường trống không gửi.
 */
export function toInput(items: readonly MenuItemDraft[]): SiteMenuItemInput[] {
  return items.map((item) => {
    const input: SiteMenuItemInput = {};
    const label = item.label.trim();
    if (label) input.label = label;
    const type = targetType(item);
    if (type === "url" && item.url !== null) input.url = item.url.trim();
    if (type === "ref" && item.ref) {
      input.ref = { kind: item.ref.kind, id: item.ref.id };
      if (item.auto_children) {
        input.auto_children = true;
        input.auto_children_limit = item.auto_children_limit;
      }
    }
    if (item.icon) input.icon = item.icon;
    if (item.highlight) input.highlight = item.highlight;
    if (item.badge?.text.trim()) {
      input.badge = {
        text: item.badge.text.trim(),
        tone: item.badge.tone,
        ...(item.badge.from ? { from: item.badge.from } : {}),
        ...(item.badge.until ? { until: item.badge.until } : {}),
      };
    }
    if (item.feature) input.feature = { kind: item.feature.kind, id: item.feature.id };
    if (item.children.length > 0) input.children = toInput(item.children);
    return input;
  });
}

/**
 * Vị trí của một lỗi trong cây gửi lên: `items[0].children[1].ref.id` → chỉ số `[0, 1]` và phần
 * còn lại `ref.id`. `null` khi lỗi không thuộc một mục (vd `items`: quá 200 mục).
 */
export function parseItemPath(field: string): { indexes: number[]; rest: string } | null {
  const match = field.match(/^items((?:\[\d+\](?:\.children)?)+)(?:\.(.+))?$/);
  if (!match?.[1]) return null;
  const head = match[1];
  if (head.endsWith(".children")) return null;
  const indexes = [...head.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  return { indexes, rest: match[2] ?? "" };
}

/** Id của mục ở vị trí `indexes` của cây (chỉ số theo từng cấp). */
export function idAt(tree: readonly MenuItemDraft[], indexes: readonly number[]): string | null {
  let level: readonly MenuItemDraft[] = tree;
  let found: MenuItemDraft | undefined;
  for (const index of indexes) {
    found = level[index];
    if (!found) return null;
    level = found.children;
  }
  return found?.id ?? null;
}

/** Một lỗi của core cho một mục (hay cả menu khi `id` là `null`). */
export interface ServerIssue {
  id: string | null;
  /** Phần sau vị trí của mục: `url`, `ref.id`, `badge.text`… */
  rest: string;
  code: string;
  detail: string;
}

/**
 * Lỗi 422 của core (`errors[]`, gom một lần, D-083) đưa về đúng mục của bản nháp. `rows` là bản
 * nháp đã gửi: core đánh vị trí theo cây gửi lên, nên dựng lại cây đó để tra.
 */
export function serverIssues(problem: Problem, rows: readonly FlatItem[]): ServerIssue[] {
  const tree = toTree(rows);
  return (problem.errors ?? []).map((error) => {
    const place = parseItemPath(error.field);
    return {
      id: place ? idAt(tree, place.indexes) : null,
      rest: place ? place.rest : error.field,
      code: error.code,
      detail: error.detail,
    };
  });
}

// ---------------------------------------------------------------- Ngày của nhãn nổi bật

/** Múi giờ nhập và hiện ngày của nhãn (như màn Khuyến mại): giờ Việt Nam, UTC+7, không đổi giờ. */
const VN_OFFSET_MS = 7 * 3_600_000;

/** Ngày `YYYY-MM-DD` theo giờ Việt Nam của thời điểm `iso`. */
export function vnDate(iso: string): string {
  return new Date(Date.parse(iso) + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** 0:00 giờ Việt Nam của ngày `date` (`YYYY-MM-DD`), dạng RFC 3339 UTC. */
export function vnMidnight(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - VN_OFFSET_MS).toISOString();
}

/**
 * Nhãn hiện "tới hết ngày" `date`: core ẩn từ lúc `until`, nên gửi 0:00 của ngày hôm sau. Đọc lại
 * thì lùi 1 ms để ra đúng ngày đã chọn.
 */
export function untilFromDay(date: string): string {
  return new Date(Date.parse(vnMidnight(date)) + 86_400_000).toISOString();
}
export function dayOfUntil(iso: string): string {
  return vnDate(new Date(Date.parse(iso) - 1).toISOString());
}

// ---------------------------------------------------------------- Xem trước mặt tiền

/** Một mục của thanh danh mục / bảng xổ, chung cho bản nháp và menu công khai của core. */
export interface PreviewItem {
  key: string;
  label: string;
  icon: MenuIcon | null;
  highlight: Highlight | null;
  badge: { text: string; tone: BadgeTone } | null;
  /** Nhóm con tự lấy (chỉ bản nháp; menu công khai của core đã gộp vào `children`). */
  auto: string[];
  feature: { title: string; summary: string } | null;
  children: PreviewItem[];
}

/**
 * Bản nháp như mặt tiền sẽ hiện, theo luật của menu công khai (D-238): bỏ mục trỏ tới đối tượng
 * không công khai kèm mục con, bỏ nhóm không còn mục con, nhãn chỉ hiện trong hạn. Tiêu đề, nhóm con
 * lấy từ đối tượng đã biết (`objects`).
 */
export function previewFromDraft(
  rows: readonly FlatItem[],
  hidden: ReadonlySet<string>,
  objects: ReadonlyMap<string, RefObject>,
  labelOf: (row: FlatItem) => string,
  now: string,
): PreviewItem[] {
  const object = (ref: MenuRef | null) => (ref ? objects.get(`${ref.kind}:${ref.id}`) : undefined);
  const walk = (items: readonly MenuItemDraft[]): PreviewItem[] =>
    items.flatMap((item) => {
      const children = walk(item.children);
      const target = object(item.ref);
      const auto =
        item.auto_children && target ? target.children.slice(0, item.auto_children_limit) : [];
      if (targetType(item) === "group" && children.length === 0 && auto.length === 0) return [];
      const feature = object(item.feature);
      return [
        {
          key: item.id,
          label: labelOf({ ...item, depth: 0 }),
          icon: item.icon,
          highlight: item.highlight,
          badge:
            item.badge && badgeShown(item.badge, now)
              ? { text: item.badge.text, tone: item.badge.tone }
              : null,
          auto,
          feature:
            feature?.public === true ? { title: feature.title, summary: feature.hint } : null,
          children,
        },
      ];
    });
  return walk(toTree(rows.filter((row) => !hidden.has(row.id))));
}

/** Menu công khai của core (`GET /api/v1/menus/public/{key}`) thành mục xem trước. */
export function previewFromPublic(items: readonly PublicSiteMenuItem[], at = "p"): PreviewItem[] {
  return items.map((item, index) => ({
    key: `${at}${index}`,
    label: item.label,
    icon: isIcon(item.icon) ? item.icon : null,
    highlight: isHighlight(item.highlight) ? item.highlight : null,
    badge: item.badge
      ? { text: item.badge.text, tone: isTone(item.badge.tone) ? item.badge.tone : "neutral" }
      : null,
    auto: [],
    feature: item.feature ? { title: item.feature.title, summary: item.feature.summary } : null,
    children: previewFromPublic(item.children, `${at}${index}.`),
  }));
}

// ---------------------------------------------------------------- Nhập menu cũ

/** Một dòng xem trước của lệnh nhập menu cũ. */
export interface ImportRow {
  key: string;
  locale: string;
  status: "create" | "keep";
  items: number;
}

function countLegacy(items: LegacyMenu["items"]): number {
  return items.reduce((sum, item) => sum + 1 + countLegacy(item.children), 0);
}

/**
 * Lệnh `autoxide task menus.import_content_menus` sẽ làm gì (D-238): menu cũ mà module `menus`
 * chưa có cùng (`key`, `locale`) thì tạo, có rồi thì giữ, không ghi đè. Core chưa có API chạy thử,
 * nên giao diện tính từ hai danh sách thật.
 */
export function importPlan(
  legacy: readonly LegacyMenu[],
  existing: readonly Pick<SiteMenuSummary, "key" | "locale">[],
): ImportRow[] {
  return legacy.map((old) => ({
    key: old.key,
    locale: old.locale,
    status: existing.some((m) => m.key === old.key && m.locale === old.locale) ? "keep" : "create",
    items: countLegacy(old.items),
  }));
}
