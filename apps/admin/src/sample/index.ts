// Dữ liệu mẫu cho phần core chưa có API (W-006, chủ dự án quyết). Mọi dữ liệu mẫu và hàm giả
// nằm trong thư mục này, mỗi phân hệ một file; hàm có cùng chữ ký như sẽ gọi API, kiểu theo hình
// dạng dự kiến trong đặc tả bước của core. Khi core có API thì thay hàm mẫu bằng lời gọi thật và
// xoá phần mẫu. Phần core đã có API không bao giờ dùng dữ liệu mẫu.
import { sampleDataSetting } from "@/lib/env";

/** Có hiện phần dùng dữ liệu mẫu không (`AUTOXIDE_WEB_SAMPLE_DATA`). */
export function sampleDataEnabled(): boolean {
  return sampleDataSetting();
}

/** Một trang của danh sách, như `Page<T>` của core. */
export interface SamplePage<T> {
  data: T[];
  pagination: { limit: number; next_cursor: string | null };
}

/**
 * Cắt một trang theo con trỏ như `fetch_page` của core: con trỏ là id của dòng cuối trang trước.
 * Danh sách đã sắp sẵn.
 */
export function samplePage<T extends { id: string }>(
  items: readonly T[],
  { limit = 50, cursor }: { limit?: number; cursor?: string | null } = {},
): SamplePage<T> {
  const start = cursor ? items.findIndex((item) => item.id === cursor) + 1 : 0;
  const data = items.slice(start, start + limit);
  const more = start + limit < items.length;
  return {
    data,
    pagination: { limit, next_cursor: more ? (data.at(-1)?.id ?? null) : null },
  };
}

/** Lỗi của hàm mẫu, cùng hình dạng Problem của core để form rẽ nhánh theo `code` như thật. */
export class SampleProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = "SampleProblem";
  }
}
