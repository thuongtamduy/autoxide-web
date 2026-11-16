import { describe, expect, it } from "vitest";
import {
  averageOf,
  filterReviews,
  matchQuestion,
  NO_REVIEW_FILTER,
  type ReviewItem,
  ratingDistribution,
  shortName,
} from "./reviews";

const r = (
  id: string,
  stars: number,
  sku: string,
  date: string,
  body: string,
  photos = 0,
  helpful = 0,
): ReviewItem => ({
  id,
  stars,
  author: "A",
  sku,
  date,
  body,
  photos,
  helpful,
});

const LIST = [
  r("a", 5, "CG26", "2026-11-08", "Giữ nhiệt rất tốt", 2, 18),
  r("b", 4, "CG26", "2026-11-02", "Tay cầm nóng", 0, 9),
  r("c", 2, "CG28", "2026-10-28", "Giao chậm", 1, 14),
  r("d", 5, "CG24", "2026-10-20", "Chiên cá không dính", 0, 3),
];

describe("đánh giá", () => {
  it("lọc sao, có ảnh, biến thể, chủ đề (bỏ dấu) và sắp xếp", () => {
    const ids = (f: Partial<typeof NO_REVIEW_FILTER>) =>
      filterReviews(LIST, { ...NO_REVIEW_FILTER, ...f }).map((x) => x.id);
    expect(ids({})).toEqual(["a", "c", "b", "d"]);
    expect(ids({ stars: 5 })).toEqual(["a", "d"]);
    expect(ids({ photos: true })).toEqual(["a", "c"]);
    expect(ids({ sku: "CG28" })).toEqual(["c"]);
    expect(ids({ topic: "giu nhiet" })).toEqual(["a"]);
    expect(ids({ sort: "newest" })).toEqual(["a", "b", "c", "d"]);
    expect(ids({ sort: "lowest" })).toEqual(["c", "b", "a", "d"]);
    expect(ids({ sort: "highest" })[0]).toBe("a");
  });

  it("phân bố sao có tổng đúng và trung bình gần điểm", () => {
    for (const [rating, count] of [
      [4.8, 212],
      [4.5, 22],
      [4.9, 154],
      [4.3, 18],
    ] as const) {
      const dist = ratingDistribution(rating, count);
      expect(dist.reduce((a, b) => a + b, 0)).toBe(count);
      expect(dist.every((n) => n >= 0)).toBe(true);
      expect(Math.abs(averageOf(dist) - rating)).toBeLessThan(0.06);
    }
    expect(ratingDistribution(4, 0)).toEqual([0, 0, 0, 0, 0]);
    expect(averageOf([180, 24, 5, 2, 1])).toBeCloseTo(4.8, 1);
  });

  it("tên người mua rút gọn, tìm câu hỏi bỏ dấu", () => {
    expect(shortName("Nguyễn Hoài Thương")).toBe("Hoài Thương N.");
    expect(shortName("  Bảo ")).toBe("Bảo");
    expect(matchQuestion("Chảo dùng được bếp hồng ngoại không?", [], "hong ngoai")).toBe(true);
    expect(matchQuestion("Câu hỏi", ["Được, bếp từ cũng dùng"], "bep tu")).toBe(true);
    expect(matchQuestion("Câu hỏi", [], "")).toBe(true);
    expect(matchQuestion("Câu hỏi", [], "nồi")).toBe(false);
  });
});
