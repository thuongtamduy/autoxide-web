// Dữ liệu mẫu của màn Menu, chờ module `menus` của core (W-006). Hình dạng theo đề bài
// `docs/prompts/menus-module.md` của core (chưa có số bước trong lộ trình: "mới", đặt sau phần sổ
// đối tượng của bước 51 và trước bước 41):
// - `GET /api/v1/menus?site=` → `{ data: MenuSummary[] }`; `GET /api/v1/menus/{id}` → `{ data: Menu }`
//   kèm `ETag` (= `version`); `POST /api/v1/menus`; `PUT /api/v1/menus/{id}` (`If-Match`, thay cả
//   cây; lỗi gom một lần: `menus.invalid_url`, `menus.ref_unknown_kind`, `menus.ref_not_found`,
//   `menus.children_unsupported`); `DELETE /api/v1/menus/{id}`;
// - sổ đối tượng (bước 51 P6 + đề bài, điểm 1–2): loại đã đăng ký kèm cờ "có cây", tìm đối tượng;
// - đọc menu cho người có `menus.read` trả kèm tiêu đề và trạng thái của đích (điểm 3);
// - lệnh nhập menu cũ của `content` (chạy lại không nhân đôi, menu đã có thì giữ, có chạy thử).
// Nội dung mẫu lấy từ bản thiết kế (Bếp Mộc). Lệnh ghi đổi kho trong bộ nhớ của tiến trình máy chủ.
import type { Problem } from "@autoxide/sdk";
import {
  flatten,
  MAX_DEPTH,
  MAX_ITEMS,
  type MenuItemInput,
  toTree,
  urlProblem,
} from "@/lib/menu-tree";
import type { SampleOutcome } from "./content";

export interface RefKind {
  kind: string;
  /** Loại có cây (danh mục): bật được "tự lấy nhóm con". */
  tree: boolean;
  /** Bước của core sẽ đăng ký loại này; `null` khi đã có module (nhưng sổ đối tượng vẫn chờ). */
  step: string | null;
}

/** Một đối tượng trong sổ đối tượng (bản ghi của module khác) mà mục menu trỏ tới. */
export interface RefObject {
  kind: string;
  id: string;
  title: string;
  path: string;
  /** Còn công khai: không thì mặt tiền bỏ mục trỏ tới nó (kèm mục con). */
  public: boolean;
  /** Vì sao không công khai, hay mô tả ngắn để hiện ở ô Gợi ý. */
  note: string;
  /** Nhóm con (tên), cho loại có cây. */
  children: string[];
}

export interface MenuSummary {
  id: string;
  website_id: string;
  key: string;
  locale: string;
  version: number;
  item_count: number;
  updated_at: string;
  updated_by: string;
}

export interface Menu extends MenuSummary {
  items: MenuItemInput[];
}

/** Một dòng kết quả của lệnh nhập menu cũ. */
export interface ImportRow {
  key: string;
  locale: string;
  status: "create" | "created" | "keep" | "skip";
  items: number;
}

export interface LegacyMenuInput {
  id: string;
  key: string;
  locale: string;
  items: LegacyItemInput[];
}
export interface LegacyItemInput {
  id: string;
  label: string;
  url?: string | null;
  entry_id?: string | null;
  term_id?: string | null;
  children: LegacyItemInput[];
}

// ---------------------------------------------------------------- Kho mẫu

const MAIN = "01a1e000-0000-7000-8000-00000000c501";
const MARKET = "01a1e000-0000-7000-8000-00000000c502";
/** Ngày "hôm nay" của mẫu khi tính nhãn có hạn: lấy ngày thật (UTC). */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const REF_KINDS: readonly RefKind[] = [
  { kind: "content.entry", tree: false, step: "51" },
  { kind: "content.term", tree: true, step: "51" },
  { kind: "catalog.category", tree: true, step: "41" },
  { kind: "promotions.promotion", tree: false, step: "43" },
  { kind: "marketplace.seller", tree: false, step: "46" },
  { kind: "organizations.store", tree: false, step: "34" },
];

let seq = 0;
/** Id giống UUIDv7 cho dữ liệu mẫu (ổn định trong một lần chạy). */
function sid(tag: string): string {
  seq += 1;
  const hex = seq.toString(16).padStart(12, "0");
  return `01a1e000-${tag.padEnd(4, "0").slice(0, 4)}-7000-8000-${hex}`;
}

function obj(
  kind: string,
  title: string,
  path: string,
  pub: boolean,
  extra: Partial<RefObject> = {},
): RefObject {
  return { kind, id: sid("0b1e"), title, path, public: pub, note: "", children: [], ...extra };
}

const C = "catalog.category";
const E = "content.entry";
const T = "content.term";
const P = "promotions.promotion";
const SL = "marketplace.seller";
const ST = "organizations.store";

function seedObjects(): RefObject[] {
  return [
    obj(C, "Tất cả sản phẩm", "/danh-muc", true, {
      children: ["Dụng cụ nấu", "Dao và thớt", "Đồ chứa, bảo quản", "Gốm sứ", "Khăn, phụ kiện"],
    }),
    obj(C, "Dụng cụ nấu", "/danh-muc/dung-cu-nau", true, {
      children: ["Chảo", "Nồi", "Xửng hấp", "Dụng cụ nướng", "Muôi và xẻng"],
    }),
    obj(C, "Dao và thớt", "/danh-muc/dao-va-thot", true, {
      children: ["Dao bếp", "Bộ dao", "Thớt gỗ", "Mài dao"],
    }),
    obj(C, "Gốm sứ", "/danh-muc/gom-su", true, {
      children: ["Bát đĩa", "Ấm chén", "Nồi đất", "Lọ hoa"],
    }),
    obj(C, "Quà Tết 2027", "/danh-muc/qua-tet-2027", false, { note: "Ẩn, chưa mở bán" }),
    obj(E, "Vệ sinh thớt gỗ đúng cách", "/goc-bep/ve-sinh-thot-go-dung-cach", true, {
      note: "Góc bếp · 4 phút đọc",
    }),
    obj(E, "Workshop nấu ăn cuối tuần tại CN Quận 3", "/goc-bep/workshop-nau-an-cuoi-tuan", false, {
      note: "Chờ duyệt",
    }),
    obj(E, "Về chúng tôi", "/ve-chung-toi", true, { note: "Trang" }),
    obj(E, "Hệ thống cửa hàng", "/ve-chung-toi/cua-hang", true, { note: "Trang" }),
    obj(T, "Chọn mua", "/goc-bep/chon-mua", true),
    obj(T, "Mẹo dùng", "/goc-bep/meo-dung", true, { children: ["Hỏi đáp"] }),
    obj(P, "Giảm 10% chảo gang với mã BEPMOC10", "/khuyen-mai/bepmoc10", true, {
      note: "Chảo gang 26, 28 cm",
    }),
    obj(P, "Miễn phí giao đơn từ 1.000.000 ₫", "/khuyen-mai/mien-phi-giao", true, {
      note: "Hàng Bếp Mộc bán",
    }),
    obj(SL, "Gốm Sứ Bát Tràng Xưa", "/cho/gom-su-bat-trang-xua", true, {
      note: "Bộ sưu tập gốm Bát Tràng · trên Chợ Bếp Mộc",
    }),
    obj(SL, "Mây Tre Đan Phú Vinh", "/cho/may-tre-dan-phu-vinh", true, {
      note: "Giỏ mây đan tay · trên Chợ Bếp Mộc",
    }),
    obj(ST, "Bếp Mộc CN Quận 3", "/cua-hang/quan-3", true),
    obj(ST, "Bếp Mộc CN Cầu Giấy", "/cua-hang/cau-giay", true),
  ];
}

let objects = seedObjects();
const find = (title: string) => objects.find((o) => o.title === title);

function item(
  label: string,
  target: Partial<MenuItemInput>,
  children: MenuItemInput[] = [],
): MenuItemInput {
  return {
    id: sid("17e0"),
    label,
    url: null,
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
    ...target,
    children,
  };
}

function ref(title: string): Partial<MenuItemInput> {
  const found = find(title);
  return { ref_kind: found?.kind ?? null, ref_id: found?.id ?? null };
}

function seedMenus(): Menu[] {
  const month = today().slice(0, 7);
  const mainVi: MenuItemInput[] = [
    item("Danh mục", {
      ...ref("Tất cả sản phẩm"),
      icon: "grid",
      auto_children: true,
      auto_children_limit: 8,
    }),
    item("", {
      ...ref("Dụng cụ nấu"),
      icon: "pan",
      auto_children: true,
      feature_kind: P,
      feature_id: find("Giảm 10% chảo gang với mã BEPMOC10")?.id ?? null,
    }),
    item("", {
      ...ref("Dao và thớt"),
      icon: "knife",
      auto_children: true,
      feature_kind: E,
      feature_id: find("Vệ sinh thớt gỗ đúng cách")?.id ?? null,
    }),
    item("", {
      ...ref("Gốm sứ"),
      icon: "bowl",
      auto_children: true,
      feature_kind: SL,
      feature_id: find("Gốm Sứ Bát Tràng Xưa")?.id ?? null,
    }),
    item("Khuyến mại", {
      url: "/khuyen-mai",
      icon: "tag",
      badge_text: "−10%",
      badge_tone: "sale",
      badge_from: `${month}-01`,
      badge_until: `${month}-28`,
      highlight: "sale",
    }),
    item("Chợ Bếp Mộc", {
      url: "https://cho.bepmoc.example.com",
      icon: "store",
      badge_text: "Sàn",
      badge_tone: "brand",
      highlight: "brand",
    }),
    item("Góc bếp", { url: "/goc-bep", icon: "book", highlight: "brand" }),
    item("Workshop cuối tuần", { ...ref("Workshop nấu ăn cuối tuần tại CN Quận 3"), icon: "gift" }),
  ];
  const footVi: MenuItemInput[] = [
    item("Mua sắm", {}, [
      item("", ref("Dụng cụ nấu")),
      item("Khuyến mại", { url: "/khuyen-mai" }),
      item("", ref("Hệ thống cửa hàng")),
    ]),
    item("Về Bếp Mộc", {}, [
      item("", ref("Về chúng tôi")),
      item("Chính sách đổi trả", { url: "/chinh-sach-doi-tra" }),
      item("Bảo vệ dữ liệu cá nhân", { url: "/bao-ve-du-lieu" }),
    ]),
    item("Hỗ trợ", {}, [
      item("Tra cứu đơn hàng", { url: "/tra-cuu-don-hang" }),
      item("Gửi thư cho Bếp Mộc", { url: "mailto:hotro@example.com" }),
    ]),
  ];
  const marketVi: MenuItemInput[] = [
    item("Gian hàng", {}, [
      item("", ref("Gốm Sứ Bát Tràng Xưa")),
      item("", ref("Mây Tre Đan Phú Vinh")),
    ]),
    item("Bán trên Chợ Bếp Mộc", {
      url: "/ban-hang",
      icon: "store",
      badge_text: "Mới",
      badge_tone: "new",
      highlight: "brand",
    }),
  ];
  const at = "2026-11-13T08:48:00Z";
  const menu = (
    website_id: string,
    key: string,
    locale: string,
    version: number,
    items: MenuItemInput[],
    by: string,
  ): Menu => ({
    id: sid("e9a0"),
    website_id,
    key,
    locale,
    version,
    item_count: flatten(items).length,
    updated_at: at,
    updated_by: by,
    items,
  });
  return [
    menu(MAIN, "main", "vi", 14, mainVi, "Thu Hà"),
    menu(MAIN, "footer", "vi", 3, footVi, "Lan Phạm"),
    menu(MARKET, "main", "vi", 5, marketVi, "Hoàng Nam"),
  ];
}

let menus = seedMenus();
/** Id mục menu cũ đã nhập (để chạy lại không nhân đôi). */
let imported = new Set<string>();

/** Chỉ cho test: về kho ban đầu. */
export function resetMenusSample(): void {
  seq = 0;
  objects = seedObjects();
  menus = seedMenus();
  imported = new Set();
}

function summary({ items: _items, ...rest }: Menu): MenuSummary {
  return rest;
}

function problem(
  status: number,
  code: string,
  detail: string,
  errors?: Problem["errors"],
): Problem {
  return {
    type: "about:blank",
    title: "Error",
    status,
    code,
    detail,
    ...(errors ? { errors } : {}),
  };
}

// ---------------------------------------------------------------- Đọc

// Thay bằng GET /api/v1/menus?site= (module `menus`, mới) khi core có.
export async function listMenus(websiteId: string): Promise<{ data: MenuSummary[] }> {
  return {
    data: menus
      .filter((m) => m.website_id === websiteId)
      .sort((a, b) => a.key.localeCompare(b.key) || a.locale.localeCompare(b.locale))
      .map(summary),
  };
}

// Thay bằng GET /api/v1/menus/{id} (module `menus`, mới) khi core có; `ETag` = phiên bản.
export async function getMenu(id: string): Promise<SampleOutcome<{ menu: Menu; etag: string }>> {
  const menu = menus.find((m) => m.id === id);
  if (!menu) return { ok: false, problem: problem(404, "menus.not_found", "No menu has this id.") };
  return { ok: true, data: { menu: structuredClone(menu), etag: `"${menu.version}"` } };
}

// Thay bằng GET /api/v1/kernel/resources/kinds (bước 51 P6, đề bài menus điểm 2) khi core có.
export async function listRefKinds(): Promise<{ data: RefKind[] }> {
  return { data: [...REF_KINDS] };
}

// Thay bằng tìm trong sổ đối tượng (bước 51 P6, đề bài menus điểm 1) khi core có.
export async function listRefObjects(): Promise<{ data: RefObject[] }> {
  return { data: objects.map((o) => ({ ...o, children: [...o.children] })) };
}

// ---------------------------------------------------------------- Ghi

/**
 * Kiểm cây như service của `menus` sẽ kiểm, gom mọi lỗi để báo một lần (D-083 của core). `field`
 * chỉ vị trí của mục theo id (`items.<id>.url`) để giao diện đưa người dùng tới đúng mục.
 */
export function validateMenu(items: readonly MenuItemInput[]): Problem["errors"] {
  const errors: NonNullable<Problem["errors"]> = [];
  const rows = flatten(items);
  if (rows.length > MAX_ITEMS) {
    errors.push({
      field: "items",
      code: "menus.too_many_items",
      detail: `at most ${MAX_ITEMS} items`,
    });
  }
  const kinds = new Map(REF_KINDS.map((k) => [k.kind, k]));
  const check = (id: string, field: string, kind: string | null, refId: string | null) => {
    if (!kind) return;
    if (!kinds.has(kind)) {
      errors.push({ field: `items.${id}.${field}`, code: "menus.ref_unknown_kind", detail: kind });
    } else if (!objects.some((o) => o.kind === kind && o.id === refId)) {
      errors.push({
        field: `items.${id}.${field}`,
        code: "menus.ref_not_found",
        detail: refId ?? "",
      });
    }
  };
  for (const row of rows) {
    if (row.depth >= MAX_DEPTH) {
      errors.push({
        field: `items.${row.id}`,
        code: "menus.too_deep",
        detail: `at most ${MAX_DEPTH} levels`,
      });
    }
    if (row.ref_kind === null && row.url !== null && urlProblem(row.url)) {
      errors.push({ field: `items.${row.id}.url`, code: "menus.invalid_url", detail: row.url });
    }
    if (row.ref_kind === null && !row.label.trim()) {
      errors.push({ field: `items.${row.id}.label`, code: "menus.label_required", detail: "" });
    }
    check(row.id, "ref_id", row.ref_kind, row.ref_id);
    check(row.id, "feature_id", row.feature_kind, row.feature_id);
    const kind = row.ref_kind ? kinds.get(row.ref_kind) : undefined;
    if (row.auto_children && kind && !kind.tree) {
      errors.push({
        field: `items.${row.id}.auto_children`,
        code: "menus.children_unsupported",
        detail: kind.kind,
      });
    }
    if (row.auto_children_limit < 1 || row.auto_children_limit > 24) {
      errors.push({
        field: `items.${row.id}.auto_children_limit`,
        code: "menus.limit_range",
        detail: "1–24",
      });
    }
  }
  return errors;
}

// Thay bằng PUT /api/v1/menus/{id} (If-Match; module `menus`, mới) khi core có.
export async function putMenu(
  id: string,
  ifMatch: string,
  items: MenuItemInput[],
  by: string,
): Promise<SampleOutcome<{ menu: Menu; etag: string }>> {
  const menu = menus.find((m) => m.id === id);
  if (!menu) return { ok: false, problem: problem(404, "menus.not_found", "No menu has this id.") };
  if (ifMatch !== "*" && ifMatch !== `"${menu.version}"`) {
    return {
      ok: false,
      problem: problem(412, "precondition_failed", "The menu changed since you read it."),
    };
  }
  const errors = validateMenu(items);
  if (errors && errors.length > 0) {
    return {
      ok: false,
      problem: problem(422, "validation_failed", "The menu has invalid items.", errors),
    };
  }
  // Như core: thứ tự và cấp lấy từ cây gửi lên; id giữ nguyên.
  const clean = toTree(flatten(items));
  menu.items = clean;
  menu.version += 1;
  menu.item_count = flatten(clean).length;
  menu.updated_at = new Date().toISOString();
  menu.updated_by = by;
  return { ok: true, data: { menu: structuredClone(menu), etag: `"${menu.version}"` } };
}

// Thay bằng POST /api/v1/menus (module `menus`, mới) khi core có.
export async function createMenu(input: {
  website_id: string;
  key: string;
  locale: string;
  copy_from?: string | undefined;
  by: string;
}): Promise<SampleOutcome<Menu>> {
  const errors: NonNullable<Problem["errors"]> = [];
  if (!/^[a-z][a-z0-9_-]{0,39}$/.test(input.key)) {
    errors.push({ field: "key", code: "menus.invalid_key", detail: input.key });
  }
  if (!/^[a-z]{2,3}$/.test(input.locale)) {
    errors.push({ field: "locale", code: "unknown", detail: input.locale });
  }
  if (errors.length > 0) {
    return {
      ok: false,
      problem: problem(422, "validation_failed", "The request has invalid fields.", errors),
    };
  }
  if (
    menus.some(
      (m) => m.website_id === input.website_id && m.key === input.key && m.locale === input.locale,
    )
  ) {
    return {
      ok: false,
      problem: problem(
        409,
        "menus.key_taken",
        "This website already has a menu with this key and language.",
        [{ field: "key", code: "menus.key_taken", detail: input.key }],
      ),
    };
  }
  const source = input.copy_from ? menus.find((m) => m.id === input.copy_from) : undefined;
  const copy = (list: MenuItemInput[]): MenuItemInput[] =>
    list.map((i) => ({ ...i, id: sid("17e0"), children: copy(i.children) }));
  const items = source ? copy(structuredClone(source.items)) : [];
  const menu: Menu = {
    id: sid("e9a0"),
    website_id: input.website_id,
    key: input.key,
    locale: input.locale,
    version: 1,
    item_count: flatten(items).length,
    updated_at: new Date().toISOString(),
    updated_by: input.by,
    items,
  };
  menus.push(menu);
  return { ok: true, data: structuredClone(menu) };
}

// Thay bằng DELETE /api/v1/menus/{id} (module `menus`, mới) khi core có.
export async function deleteMenu(id: string): Promise<SampleOutcome<null>> {
  const before = menus.length;
  menus = menus.filter((m) => m.id !== id);
  if (menus.length === before) {
    return { ok: false, problem: problem(404, "menus.not_found", "No menu has this id.") };
  }
  return { ok: true, data: null };
}

/**
 * Chỉ có ở dữ liệu mẫu: một người khác lưu menu này (tăng phiên bản, đổi giới hạn nhóm con của mục
 * đầu), để thử tình huống 412 trên giao diện.
 */
export async function simulateOtherSave(id: string): Promise<SampleOutcome<{ version: number }>> {
  const menu = menus.find((m) => m.id === id);
  if (!menu) return { ok: false, problem: problem(404, "menus.not_found", "No menu has this id.") };
  const first = menu.items[0];
  if (first) first.auto_children_limit = Math.max(1, first.auto_children_limit - 2);
  menu.version += 1;
  menu.updated_at = new Date().toISOString();
  menu.updated_by = "Thu Hà";
  return { ok: true, data: { version: menu.version } };
}

// ---------------------------------------------------------------- Nhập menu cũ

function convert(items: readonly LegacyItemInput[]): MenuItemInput[] {
  return items.map((old) =>
    item(
      old.label,
      old.entry_id
        ? { ref_kind: E, ref_id: old.entry_id }
        : old.term_id
          ? { ref_kind: T, ref_id: old.term_id }
          : { url: old.url ?? null },
      convert(old.children),
    ),
  );
}

function legacyIds(items: readonly LegacyItemInput[]): string[] {
  return items.flatMap((i) => [i.id, ...legacyIds(i.children)]);
}

/**
 * Nhập menu cũ của `content` vào website `websiteId`. Menu đã có (cùng khoá và ngôn ngữ) thì giữ,
 * không ghi đè; mục đã nhập lần trước (nhớ id mục cũ) thì bỏ qua. `dryRun`: chỉ báo sẽ làm gì.
 * Mục trỏ tới bài thành `content.entry`, tới danh mục / thẻ thành `content.term`.
 */
// Thay bằng POST /api/v1/menus/import?dry_run= (module `menus`, mới) khi core có.
export async function importLegacy(
  legacy: readonly LegacyMenuInput[],
  websiteId: string,
  dryRun: boolean,
  by: string,
): Promise<{ data: ImportRow[] }> {
  const rows: ImportRow[] = [];
  for (const old of legacy) {
    const count = legacyIds(old.items).length;
    const exists = menus.some(
      (m) => m.website_id === websiteId && m.key === old.key && m.locale === old.locale,
    );
    const already = legacyIds(old.items).every((id) => imported.has(id)) && count > 0;
    if (exists || already) {
      rows.push({
        key: old.key,
        locale: old.locale,
        status: exists ? "keep" : "skip",
        items: count,
      });
      continue;
    }
    if (dryRun) {
      rows.push({ key: old.key, locale: old.locale, status: "create", items: count });
      continue;
    }
    // Đối tượng mà mục cũ trỏ tới thành đối tượng của sổ (mẫu) để menu mới giải được.
    const register = (list: readonly LegacyItemInput[]) => {
      for (const i of list) {
        const id = i.entry_id ?? i.term_id;
        if (id && !objects.some((o) => o.id === id)) {
          objects.push({
            kind: i.entry_id ? E : T,
            id,
            title: i.label,
            path: i.url ?? "",
            public: true,
            note: "",
            children: [],
          });
        }
        register(i.children);
      }
    };
    register(old.items);
    const items = convert(old.items);
    menus.push({
      id: sid("e9a0"),
      website_id: websiteId,
      key: old.key,
      locale: old.locale,
      version: 1,
      item_count: flatten(items).length,
      updated_at: new Date().toISOString(),
      updated_by: by,
      items,
    });
    for (const id of legacyIds(old.items)) imported.add(id);
    rows.push({ key: old.key, locale: old.locale, status: "created", items: count });
  }
  return { data: rows };
}
