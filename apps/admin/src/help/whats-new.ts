// "Có gì mới" trong bảng Trợ giúp. Core chưa có nguồn tin cập nhật, nên danh sách nằm ở đây; chữ ở
// `help.news.items.<id>` của `messages/`. Thêm tin: thêm một dòng ở ĐẦU danh sách với phiên bản lớn hơn
// mọi dòng cũ (ngày phát hành, thêm `.n` khi nhiều tin cùng ngày). Người dùng đã xem tới phiên bản nào
// thì lưu ở cờ `whatsnew.seen`; nút "?" có chấm khi còn tin mới hơn phiên bản đó.

export interface NewsItem {
  id: string;
  version: string;
}

export const WHATS_NEW: readonly NewsItem[] = [
  { id: "help", version: "2026-11-15.3" },
  { id: "alt_text", version: "2026-11-15.2" },
  { id: "work_box", version: "2026-11-15.1" },
];

/** So hai phiên bản theo từng phần số (`2026-11-15.10` mới hơn `2026-11-15.9`). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map(Number);
  const pb = b.split(/[.-]/).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return a < b ? -1 : a > b ? 1 : 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** Phiên bản mới nhất của danh sách; `null` khi danh sách trống. */
export function latestVersion(items: readonly NewsItem[] = WHATS_NEW): string | null {
  let best: string | null = null;
  for (const item of items) {
    if (best === null || compareVersions(item.version, best) > 0) best = item.version;
  }
  return best;
}

/** Tin mới hơn phiên bản đã xem (chưa xem lần nào: mọi tin). */
export function unseenNews(items: readonly NewsItem[], seen: string | null): NewsItem[] {
  return seen === null ? [...items] : items.filter((i) => compareVersions(i.version, seen) > 0);
}
