import { describe, expect, it } from "vitest";
import {
  cartTotals,
  cashSuggestions,
  findByScan,
  fitCart,
  matchItem,
  parseCash,
  readHeld,
  setQuantity,
} from "./pos";

const ITEMS = [
  {
    sku: "CG26",
    name: "Chảo gang 26 cm",
    barcode: "8930000000026",
    price: 690_000,
    vat: 8,
    available: 12,
  },
  {
    sku: "NRC750",
    name: "Nước rửa chén hữu cơ",
    barcode: null,
    price: 89_000,
    vat: 10,
    available: 2,
  },
];

describe("quầy bán: hàm thuần", () => {
  it("gợi ý tiền khách đưa: đủ tiền rồi các mệnh giá chẵn, không trùng, tối đa 4", () => {
    expect(cashSuggestions(0)).toEqual([]);
    expect(cashSuggestions(779_000)).toEqual([779_000, 780_000, 800_000, 1_000_000]);
    expect(cashSuggestions(500_000)).toEqual([500_000, 600_000]);
  });

  it("đọc tiền khách đưa có dấu chấm, phẩy, ký hiệu đồng", () => {
    expect(parseCash("1.000.000")).toBe(1_000_000);
    expect(parseCash("1,000,000 ₫")).toBe(1_000_000);
    expect(parseCash("")).toBeNull();
    expect(parseCash("abc")).toBeNull();
  });

  it("máy quét: mã vạch hoặc SKU trùng khít, không phân biệt hoa thường", () => {
    expect(findByScan(ITEMS, "8930000000026")?.sku).toBe("CG26");
    expect(findByScan(ITEMS, " nrc750 ")?.sku).toBe("NRC750");
    expect(findByScan(ITEMS, "CG2")).toBeNull();
    expect(findByScan(ITEMS, "")).toBeNull();
  });

  it("lọc theo tên không dấu, SKU, mã vạch", () => {
    const [chao, nuoc] = ITEMS;
    if (!chao || !nuoc) throw new Error("thiếu mẫu");
    expect(matchItem(nuoc, "nuoc rua")).toBe(true);
    expect(matchItem(chao, "cg26")).toBe(true);
    expect(matchItem(chao, "89300")).toBe(true);
    expect(matchItem(chao, "nuoc")).toBe(false);
  });

  it("số lượng kẹp theo tồn, về 0 thì bỏ dòng; tổng và GTGT gồm trong giá", () => {
    let cart = setQuantity({}, "NRC750", 5, 2);
    expect(cart).toEqual({ NRC750: 2 });
    cart = setQuantity(cart, "CG26", 1, 12);
    expect(cartTotals(cart, ITEMS)).toEqual({
      count: 3,
      subtotal: 690_000 + 178_000,
      vat: Math.round((690_000 * 8) / 108) + Math.round((178_000 * 10) / 110),
    });
    expect(setQuantity(cart, "CG26", 0, 12)).toEqual({ NRC750: 2 });
  });

  it("đổi cửa hàng: bỏ hàng không bán ở đó, kẹp theo tồn mới", () => {
    expect(fitCart({ CG26: 3, XYZ: 1, NRC750: 4 }, ITEMS)).toEqual({ CG26: 3, NRC750: 2 });
  });

  it("đơn giữ đọc từ trình duyệt: dữ liệu hỏng thì bỏ qua, không làm hỏng quầy", () => {
    expect(readHeld(null)).toEqual([]);
    expect(readHeld("{không phải json")).toEqual([]);
    const raw = JSON.stringify([
      {
        id: "1",
        store: "s",
        at: "2026-11-17T03:00:00Z",
        cart: { CG26: 1, BAD: -1 },
        codes: ["A", 3],
      },
      { id: "2", store: "s", at: "x", cart: {} },
      "rác",
    ]);
    expect(readHeld(raw)).toEqual([
      {
        id: "1",
        store: "s",
        at: "2026-11-17T03:00:00Z",
        cart: { CG26: 1 },
        codes: ["A"],
        customer: null,
      },
    ]);
  });
});
