import { describe, expect, it } from "vitest";
import { addLine, parseCart } from "./cart";
import {
  feesOn,
  ratingDistribution,
  SELLER_PRODUCTS,
  SELLER_PROFILES,
  sellerBySlug,
  sellerOpen,
} from "./market";
import { isSellableSku, offerBySku, offerName } from "./offers";
import { SELLERS } from "./site";

describe("sàn mẫu", () => {
  it("mỗi gian hàng: nhóm hàng cộng đúng số sản phẩm, phân bố sao cộng đúng số đánh giá", () => {
    for (const seller of SELLER_PROFILES) {
      expect(seller.kinds.reduce((sum, k) => sum + k.count, 0)).toBe(seller.product_count);
      const dist = ratingDistribution(seller);
      expect(dist).toHaveLength(5);
      expect(dist.reduce((a, b) => a + b, 0)).toBe(seller.rating?.count ?? 0);
    }
  });

  it("có đủ sáu người bán của trang quản trị (link tới gian hàng không 404)", () => {
    for (const slug of [
      "gia-dung-nha-na",
      "gom-su-bat-trang-xua",
      "bep-nha-tho",
      "dao-keo-da-sy",
      "thuc-pham-sach-an-nhien",
      "khan-bong-ha-long",
    ]) {
      expect(sellerBySlug(slug)).toBeDefined();
    }
    expect(SELLER_PROFILES.filter(sellerOpen).map((s) => s.slug)).toEqual([
      "gom-su-bat-trang-xua",
      "khan-bong-ha-long",
      "may-tre-dan-phu-vinh",
    ]);
  });

  it("sản phẩm người bán: SKU không trùng, người bán và nhóm hàng có thật", () => {
    const skus = SELLER_PRODUCTS.map((p) => p.sku);
    expect(new Set(skus).size).toBe(skus.length);
    for (const product of SELLER_PRODUCTS) {
      const seller = sellerBySlug(product.seller);
      expect(seller).toBeDefined();
      expect(seller?.kinds.some((k) => k.key === product.kind)).toBe(true);
      // SKU của người bán không trùng SKU Bếp Mộc.
      expect(offerBySku(product.sku)?.seller).toBe(product.seller);
    }
  });

  it("người bán ở trang chủ là người bán đang bán, cùng số liệu với hồ sơ gian hàng", () => {
    for (const card of SELLERS) {
      const seller = sellerBySlug(card.slug);
      expect(seller && sellerOpen(seller)).toBe(true);
      expect(card.rating).toBe(seller?.rating?.average);
      expect(card.products).toBe(seller?.product_count);
    }
  });

  it("phí sàn theo ngày hiệu lực (như trang quản trị)", () => {
    expect(feesOn("2026-02-01").map((f) => f.rate_bp)).toEqual([700]);
    expect(feesOn("2026-11-15").map((f) => [f.kind, f.rate_bp, f.fixed])).toEqual([
      ["commission", 600, null],
      ["commission", 500, null],
      ["storage", null, 120_000],
    ]);
  });

  it("giỏ nhận hàng người bán đang bán, bỏ hàng của người bán đang tạm khoá", () => {
    expect(isSellableSku("GS-AMLAM")).toBe(true);
    expect(isSellableSku("NA-CCD28")).toBe(false);
    expect(parseCart("GS-AMLAM:1,NA-CCD28:1,CG26:2")).toEqual([
      { sku: "GS-AMLAM", quantity: 1 },
      { sku: "CG26", quantity: 2 },
    ]);
    expect(addLine([], "NA-CCD28")).toEqual([]);
  });

  it("tên dòng giỏ có lựa chọn", () => {
    const pan = offerBySku("CG26");
    expect(pan && offerName(pan, "vi")).toBe("Chảo gang · 26 cm");
    expect(pan?.grams).toBe(3100);
  });
});
