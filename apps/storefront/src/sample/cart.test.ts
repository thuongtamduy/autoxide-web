import { describe, expect, it } from "vitest";
import { addLine, cartCount, parseCart, serializeCart, setLine } from "./cart";

describe("giỏ hàng mẫu trong cookie", () => {
  it("đọc cookie, bỏ dòng hỏng và SKU lạ, cộng SKU lặp", () => {
    expect(parseCart("CG26:1,XX:2,TG35:abc,TG35:2,CG26:3,BG6:0")).toEqual([
      { sku: "CG26", quantity: 4 },
      { sku: "TG35", quantity: 2 },
    ]);
    expect(parseCart(undefined)).toEqual([]);
  });

  it("giới hạn số lượng 99", () => {
    expect(parseCart("CG26:500")).toEqual([{ sku: "CG26", quantity: 99 }]);
  });

  it("thêm, đặt số lượng, đếm, ghi lại", () => {
    let lines = addLine([], "CG26");
    lines = addLine(lines, "CG26", 2);
    lines = addLine(lines, "DB3");
    lines = addLine(lines, "KHONG-CO");
    expect(serializeCart(lines)).toBe("CG26:3,DB3:1");
    expect(cartCount(lines)).toBe(4);
    expect(setLine(lines, "CG26", 0)).toEqual([{ sku: "DB3", quantity: 1 }]);
    expect(setLine(lines, "DB3", 5)).toEqual([
      { sku: "CG26", quantity: 3 },
      { sku: "DB3", quantity: 5 },
    ]);
  });
});
