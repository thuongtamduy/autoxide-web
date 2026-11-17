// Đồ dùng thuần của bộ công cụ bảng (chọn nhiều, sắp theo cột, phân trang có tổng): đọc tham số trên
// URL (`sort`, `dir`, `page`, `per`), dựng địa chỉ, tính cửa sổ trang, chạy một lệnh cho từng id rồi gom
// lỗi. Dùng được ở cả máy chủ lẫn trình duyệt; không gọi core.

export type SortDir = "asc" | "desc";

export interface SortState {
  field: string;
  dir: SortDir;
}

export type Params = Record<string, string | string[] | undefined>;

/** Giá trị giữ lại trên địa chỉ (bộ lọc đang dùng); rỗng thì bỏ. */
export type Keep = Record<string, string | number | null | undefined>;

/** Số dòng mỗi trang cho người xem chọn. */
export const PER_PAGE = [25, 50, 100] as const;

/** Số id tối đa một lần thao tác hàng loạt (cỡ trang lớn nhất). */
export const BULK_MAX = 100;

function first(params: Params, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : Array.isArray(value) ? (value[0] ?? "") : "";
}

/**
 * Cách sắp đang chọn: `?sort=` phải nằm trong `fields` (cột nguồn dữ liệu sắp được), `?dir=` là
 * `asc` / `desc`; sai hay thiếu thì về `fallback`.
 */
export function readSort<F extends string>(
  params: Params,
  fields: readonly F[],
  fallback: { field: F; dir: SortDir },
): { field: F; dir: SortDir } {
  const field = fields.find((f) => f === first(params, "sort"));
  if (!field) return fallback;
  const dir = first(params, "dir");
  return { field, dir: dir === "asc" || dir === "desc" ? dir : fallback.dir };
}

/** Trang (từ 1) và số dòng mỗi trang; số lạ về mặc định. */
export function readPage(
  params: Params,
  per: number = PER_PAGE[0],
  options: readonly number[] = PER_PAGE,
): { page: number; per: number } {
  const p = Number(first(params, "page"));
  const n = Number(first(params, "per"));
  return {
    page: Number.isInteger(p) && p >= 1 ? p : 1,
    per: options.includes(n) ? n : per,
  };
}

/** Địa chỉ `base` với các tham số của `keep` đổi theo `change` (giá trị rỗng thì bỏ). */
export function withQuery(base: string, keep: Keep, change: Keep = {}): string {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...keep, ...change })) {
    if (value !== null && value !== undefined && value !== "") out.set(key, String(value));
  }
  const text = out.toString();
  return text ? `${base}?${text}` : base;
}

/**
 * Địa chỉ của tiêu đề cột `field`: cột đang sắp thì đảo chiều, cột khác thì bắt đầu bằng `firstDir`.
 * Đổi cách sắp thì về trang đầu (bỏ `page`, `cursor`).
 */
export function sortHref(
  base: string,
  keep: Keep,
  current: SortState,
  field: string,
  firstDir: SortDir = "asc",
): string {
  const dir: SortDir =
    current.field === field ? (current.dir === "asc" ? "desc" : "asc") : firstDir;
  return withQuery(base, keep, { sort: field, dir, page: null, cursor: null });
}

/** `aria-sort` của một tiêu đề cột. */
export function ariaSort(current: SortState, field: string): "ascending" | "descending" | "none" {
  if (current.field !== field) return "none";
  return current.dir === "asc" ? "ascending" : "descending";
}

export interface PageWindow {
  /** Số thứ tự dòng đầu và cuối của trang (từ 1); trang rỗng thì 0. */
  from: number;
  to: number;
  /** Trang cuối (ít nhất 1). */
  last: number;
  /** Trang đang xem, đã kẹp trong [1, last]. */
  page: number;
  prev: number | null;
  next: number | null;
}

export function pageWindow(page: number, per: number, total: number): PageWindow {
  const last = Math.max(1, Math.ceil(total / per));
  const current = Math.min(Math.max(1, page), last);
  const from = total === 0 ? 0 : (current - 1) * per + 1;
  const to = Math.min(total, current * per);
  return {
    from,
    to,
    last,
    page: current,
    prev: current > 1 ? current - 1 : null,
    next: current < last ? current + 1 : null,
  };
}

/** Lấy một trang của danh sách đã có đủ (dữ liệu mẫu): dòng của trang và tổng số. */
export function slicePage<T>(
  items: readonly T[],
  page: number,
  per: number,
): { data: T[]; total: number; page: number } {
  const win = pageWindow(page, per, items.length);
  return {
    data: items.slice(win.from === 0 ? 0 : win.from - 1, win.to),
    total: items.length,
    page: win.page,
  };
}

/**
 * Sắp một bản sao của `items` theo `value` (chữ so theo tiếng Việt, số so theo số); bằng nhau thì giữ
 * thứ tự cũ, để phân trang ổn định.
 */
export function sortRows<T>(
  items: readonly T[],
  value: (row: T) => string | number | null,
  dir: SortDir,
): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return items
    .map((row, index) => ({ row, index, key: value(row) }))
    .sort((a, b) => {
      // Ô trống luôn ở cuối, dù sắp chiều nào.
      if (a.key === null || b.key === null) {
        return a.key === b.key ? a.index - b.index : a.key === null ? 1 : -1;
      }
      const diff =
        typeof a.key === "number" && typeof b.key === "number"
          ? a.key - b.key
          : String(a.key).localeCompare(String(b.key), "vi", {
              sensitivity: "base",
              numeric: true,
            });
      return diff !== 0 ? diff * sign : a.index - b.index;
    })
    .map((entry) => entry.row);
}

// ---------------------------------------------------------------- Hàng loạt

/** Những gì thanh hàng loạt gửi cho Server Action. */
export interface BulkInput {
  ids: string[];
  /** Chọn cả mọi dòng khớp bộ lọc (không chỉ trang này): `query` là bộ lọc của trang. */
  all?: boolean;
  query?: string;
  /** Giá trị người dùng chọn / gõ trong hộp thoại của thao tác (vd nhóm cần thêm vào). */
  value?: string;
}

export interface BulkError {
  id: string;
  /** Tên dễ đọc của bản ghi (mã đơn, tên sản phẩm), để câu báo chỉ đúng dòng hỏng. */
  name: string;
  /** Câu lỗi đã dịch (của core, hoặc của hàm mẫu). */
  detail: string;
}

export interface BulkResult {
  total: number;
  done: number;
  errors: BulkError[];
  /** Câu báo riêng thay câu chung "Xong N/M" (vd "Đã xác nhận 2 đơn; bỏ qua 1"). */
  message?: string;
  /** Id đã đổi, để nút Hoàn tác gửi lại. */
  undo?: string[];
}

/** Lỗi dùng chung khi cả lệnh bị chặn trước khi chạy (thiếu quyền, tắt dữ liệu mẫu). */
export function bulkBlocked(ids: readonly string[], detail: string): BulkResult {
  return { total: ids.length, done: 0, errors: [{ id: "", name: "", detail }] };
}

/** Id hợp lệ (không trùng, không rỗng, tối đa `BULK_MAX`) từ dữ liệu trình duyệt gửi lên. */
export function cleanIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const out = new Set<string>();
  for (const id of ids) {
    if (typeof id === "string" && id.trim() !== "" && id.length <= 200) out.add(id.trim());
    if (out.size >= BULK_MAX) break;
  }
  return [...out];
}

/**
 * Chạy `run` lần lượt cho từng id (core và hàm mẫu chỉ có lệnh từng cái; không bịa endpoint hàng
 * loạt), gom lỗi thay vì dừng ở lỗi đầu. `run` trả `null` khi xong, hoặc câu lỗi đã dịch.
 */
export async function eachId(
  ids: readonly string[],
  run: (id: string) => Promise<string | null>,
  name: (id: string) => string = (id) => id,
): Promise<BulkResult> {
  const errors: BulkError[] = [];
  let done = 0;
  for (const id of ids) {
    let detail: string | null;
    try {
      detail = await run(id);
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error);
    }
    if (detail === null) done += 1;
    else errors.push({ id, name: name(id), detail });
  }
  return { total: ids.length, done, errors };
}
