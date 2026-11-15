import { describe, expect, it } from "vitest";
import {
  applyListing,
  decodeCursor,
  encodeCursor,
  facetCounts,
  hasFilters,
  type ListingItem,
  listingHref,
  paginate,
  parseListing,
} from "./listing";

const item = (id: string, over: Partial<ListingItem> = {}): ListingItem => ({
  id,
  price: 100_000,
  discountBp: 0,
  rating: 4.5,
  rank: 0,
  addedOn: "2026-01-01",
  material: [],
  stove: [],
  seller: "shop",
  inStore: false,
  ...over,
});

const ITEMS = [
  item("pan", {
    price: 690_000,
    rating: 4.8,
    rank: 0,
    material: ["cast_iron"],
    stove: ["gas", "induction"],
    inStore: true,
    discountBp: 1000,
  }),
  item("pot", {
    price: 540_000,
    rating: 4.7,
    rank: 1,
    material: ["stainless_steel"],
    stove: ["gas", "induction"],
    addedOn: "2026-05-01",
  }),
  item("board", { price: 260_000, rating: 4.6, rank: 2, material: ["wood"], inStore: true }),
  item("towel", {
    price: 95_000,
    rating: 4.3,
    rank: 3,
    material: ["cotton"],
    seller: "market",
    addedOn: "2026-11-13",
  }),
];

describe("bộ lọc trên địa chỉ", () => {
  it("đọc tham số, bỏ giá trị lạ, nhận cả hai cách viết nhiều giá trị", () => {
    const f = parseListing({
      material: ["wood", "cast_iron"],
      stove: "gas,induction",
      price: "200000-500000",
      rating: "4.7",
      seller: ["market", "khong-co"],
      in_store: "1",
      sort: "price_asc",
      cursor: "b2Ex",
    });
    expect(f).toEqual({
      material: ["wood", "cast_iron"],
      stove: ["gas", "induction"],
      price: "200000-500000",
      rating: 4.7,
      seller: ["market"],
      inStore: true,
      sort: "price_asc",
      cursor: "b2Ex",
    });
    const odd = parseListing({ price: "1-2", rating: "3", sort: "x", material: "<script>" });
    expect(odd.price).toBeNull();
    expect(odd.rating).toBeNull();
    expect(odd.sort).toBe("best_selling");
    expect(odd.material).toEqual([]);
    expect(hasFilters(odd)).toBe(false);
  });

  it("dựng lại địa chỉ: bỏ mặc định, đổi bộ lọc thì về trang đầu", () => {
    const f = parseListing({ material: "wood", sort: "rating", cursor: "abc" });
    expect(listingHref("/danh-muc/bep", f)).toBe("/danh-muc/bep?material=wood&sort=rating");
    expect(listingHref("/danh-muc/bep", f, { material: [] })).toBe("/danh-muc/bep?sort=rating");
    expect(listingHref("/danh-muc", parseListing({}))).toBe("/danh-muc");
  });
});

describe("lọc, sắp, đếm", () => {
  it("lọc chất liệu (một trong), loại bếp (đủ mọi loại), giá, sao, nơi bán, có sẵn", () => {
    const ids = (q: Record<string, string>) =>
      applyListing(ITEMS, parseListing(q)).map((x) => x.id);
    expect(ids({ material: "wood,cotton" })).toEqual(["board", "towel"]);
    expect(ids({ stove: "gas,induction" })).toEqual(["pan", "pot"]);
    expect(ids({ price: "500000-800000" })).toEqual(["pan", "pot"]);
    expect(ids({ price: "0-200000" })).toEqual(["towel"]);
    expect(ids({ rating: "4.7" })).toEqual(["pan", "pot"]);
    expect(ids({ seller: "market" })).toEqual(["towel"]);
    expect(ids({ in_store: "1" })).toEqual(["pan", "board"]);
  });

  it("sáu cách sắp", () => {
    const ids = (sort: string) => applyListing(ITEMS, parseListing({ sort })).map((x) => x.id);
    expect(ids("best_selling")).toEqual(["pan", "pot", "board", "towel"]);
    expect(ids("price_asc")).toEqual(["towel", "board", "pot", "pan"]);
    expect(ids("price_desc")).toEqual(["pan", "pot", "board", "towel"]);
    expect(ids("rating")).toEqual(["pan", "pot", "board", "towel"]);
    expect(ids("discount")[0]).toBe("pan");
    expect(ids("newest")[0]).toBe("towel");
  });

  it("số đếm của một nhóm giữ nguyên các nhóm khác, bỏ qua chính nhóm đó", () => {
    const f = parseListing({ material: "wood", in_store: "1" });
    const materials = facetCounts(ITEMS, f, "material");
    expect(materials.get("cast_iron")).toBe(1);
    expect(materials.get("wood")).toBe(1);
    expect(materials.get("cotton")).toBeUndefined();
    expect(facetCounts(ITEMS, f, "inStore").get("1")).toBe(1);
  });
});

describe("chia trang theo con trỏ", () => {
  it("12 một trang, con trỏ mờ, con trỏ hỏng về đầu", () => {
    const list = Array.from({ length: 13 }, (_, i) => i);
    const first = paginate(list, null);
    expect(first.items).toHaveLength(12);
    expect(first).toMatchObject({ total: 13, from: 1, to: 12 });
    expect(first.next).not.toBeNull();
    const second = paginate(list, first.next);
    expect(second.items).toEqual([12]);
    expect(second).toMatchObject({ from: 13, to: 13, next: null });
    expect(decodeCursor(encodeCursor(24))).toBe(24);
    expect(decodeCursor("!!")).toBe(0);
    expect(paginate([], null)).toMatchObject({ items: [], from: 0, to: 0, next: null });
  });
});
