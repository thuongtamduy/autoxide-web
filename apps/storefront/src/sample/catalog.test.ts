import { describe, expect, it } from "vitest";
import {
  availability,
  CATEGORIES,
  CATEGORY_ID,
  categoryBySlug,
  couponPrice,
  PRODUCTS,
  productBySku,
  productsInCategory,
  STORES,
  searchProducts,
} from "./catalog";

describe("catalog mẫu", () => {
  it("SKU và ID không trùng, mỗi sản phẩm thuộc một danh mục có thật", () => {
    const skus = PRODUCTS.flatMap((p) => p.variants.map((v) => v.sku));
    expect(new Set(skus).size).toBe(skus.length);
    expect(new Set(PRODUCTS.map((p) => p.id)).size).toBe(PRODUCTS.length);
    for (const p of PRODUCTS) {
      expect(CATEGORIES.some((c) => c.id === p.category_id)).toBe(true);
      expect(p.variants.some((v) => v.sku === p.default_sku)).toBe(true);
    }
  });

  it("12 sản phẩm đang bán, như trang quản trị (lưới chia hết 2, 3, 4, 6)", () => {
    expect(PRODUCTS).toHaveLength(12);
  });

  it("giá khớp trang quản trị và mã BEPMOC10 chỉ áp cho chảo 26, 28 cm", () => {
    expect(productBySku("CG26")?.variants.find((v) => v.sku === "CG26")?.price).toBe(690_000);
    expect(couponPrice("CG26")).toBe(621_000);
    expect(couponPrice("CG28")).toBe(684_000);
    expect(couponPrice("CG24")).toBeNull();
    expect(couponPrice("KHONG-CO")).toBeNull();
  });

  it("danh mục theo slug cả hai ngôn ngữ, gồm danh mục con", () => {
    expect(categoryBySlug("bep")?.id).toBe(CATEGORY_ID.kitchen);
    expect(categoryBySlug("bep-en")?.id).toBe(CATEGORY_ID.kitchen);
    expect(productsInCategory(CATEGORY_ID.kitchen).map((p) => p.key)).toEqual([
      "castIronPan",
      "steelPot20",
      "starterBundle",
    ]);
  });

  it("tìm bỏ dấu, khớp đúng dấu trước", () => {
    expect(searchProducts("thot", "vi").map((p) => p.key)).toEqual([
      "tamarindBoard35",
      "tamarindBoard25",
      "roundBoard30",
    ]);
    expect(searchProducts("", "vi")).toEqual([]);
    expect(searchProducts("board", "en")).toHaveLength(3);
  });

  it("tồn theo cửa hàng", () => {
    expect(STORES.map((s) => s.code)).toEqual(["q3", "td", "cg"]);
    expect(availability("CG26", "q3")).toEqual({ kind: "in_store", left: 12 });
    expect(availability("CG26", "cg")).toEqual({ kind: "low", left: 3 });
    expect(availability("HT1L", "q3")).toEqual({ kind: "out" });
    expect(availability("TG35", "q3")).toEqual({ kind: "warehouse" });
  });
});
