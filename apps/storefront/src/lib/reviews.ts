// Lọc, sắp xếp đánh giá và hỏi đáp trên trang sản phẩm (W-029). Hàm thuần. Khi core có
// `GET /api/v1/orders/public/products/{id}/reviews?rating&has_media&sort` (bước 45) thì core lọc
// và chia trang; tóm tắt số sao đọc từ `orders_review_stats`.
import { fold } from "./fold";

export interface ReviewItem {
  id: string;
  stars: number;
  author: string;
  /** SKU của biến thể đã mua. */
  sku: string;
  /** Ngày viết, `YYYY-MM-DD`. */
  date: string;
  body: string;
  photos: number;
  helpful: number;
}

export type ReviewSort = "helpful" | "newest" | "lowest" | "highest";
export const REVIEW_SORTS: readonly ReviewSort[] = ["helpful", "newest", "lowest", "highest"];

export interface ReviewFilter {
  stars: number | null;
  photos: boolean;
  sku: string | null;
  /** Từ khoá của chủ đề người mua hay nhắc (đã gom bằng AI và được duyệt). */
  topic: string | null;
  sort: ReviewSort;
}

export const NO_REVIEW_FILTER: ReviewFilter = {
  stars: null,
  photos: false,
  sku: null,
  topic: null,
  sort: "helpful",
};

const SORT: Record<ReviewSort, (a: ReviewItem, b: ReviewItem) => number> = {
  helpful: (a, b) => b.helpful - a.helpful || b.date.localeCompare(a.date),
  newest: (a, b) => b.date.localeCompare(a.date),
  lowest: (a, b) => a.stars - b.stars || b.date.localeCompare(a.date),
  highest: (a, b) => b.stars - a.stars || b.date.localeCompare(a.date),
};

export function filterReviews<T extends ReviewItem>(list: readonly T[], filter: ReviewFilter): T[] {
  const topic = filter.topic ? fold(filter.topic) : "";
  return list
    .filter(
      (r) =>
        (filter.stars === null || r.stars === filter.stars) &&
        (!filter.photos || r.photos > 0) &&
        (filter.sku === null || r.sku === filter.sku) &&
        (!topic || fold(r.body).includes(topic)),
    )
    .sort(SORT[filter.sort]);
}

/**
 * Số đánh giá theo từng mức sao (5 → 1) có tổng đúng `count` và trung bình gần `rating` nhất — cho
 * sản phẩm mẫu chưa ghi phân bố. Core trả số thật (`count_1`…`count_5`).
 */
export function ratingDistribution(
  rating: number,
  count: number,
): [number, number, number, number, number] {
  if (count <= 0) return [0, 0, 0, 0, 0];
  // Dồn phần lớn vào 5 và 4 sao, phần thấp giữ một ít để thanh 1–3 sao không trống bất thường.
  const low = Math.max(0, Math.round(count * Math.max(0, 4.95 - rating) * 0.12));
  const three = Math.round(low * 0.5);
  const two = Math.round(low * 0.3);
  const one = low - three - two;
  const rest = count - low;
  // Trung bình của phần 4–5 sao cần đạt để cả nhóm có trung bình `rating`.
  const target = (rating * count - (3 * three + 2 * two + one)) / Math.max(rest, 1);
  const five = Math.min(rest, Math.max(0, Math.round((target - 4) * rest)));
  return [five, rest - five, three, two, one];
}

/** Trung bình của một phân bố (5 → 1). */
export function averageOf(dist: readonly number[]): number {
  const total = dist.reduce((sum, n) => sum + n, 0);
  if (total === 0) return 0;
  return dist.reduce((sum, n, i) => sum + n * (5 - i), 0) / total;
}

/**
 * Tên người mua rút gọn khi hiện công khai (bảo vệ dữ liệu cá nhân): "Nguyễn Hoài Thương" →
 * "Hoài Thương N.". Một chữ thì giữ nguyên.
 */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name.trim();
  return `${parts.slice(1).join(" ")} ${parts[0]?.[0] ?? ""}.`;
}

/** Câu hỏi khớp từ khoá (bỏ dấu), ở câu hỏi hay câu trả lời. */
export function matchQuestion(
  question: string,
  answers: readonly string[],
  query: string,
): boolean {
  const q = fold(query);
  if (!q) return true;
  return fold(question).includes(q) || answers.some((a) => fold(a).includes(q));
}
