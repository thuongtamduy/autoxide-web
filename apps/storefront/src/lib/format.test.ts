import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatMoney,
  formatRating,
  groupDigits,
  initials,
  keepUnits,
  NBSP,
  pick,
  vnd,
} from "./format";

describe("tiền", () => {
  it("VND nhóm theo ngôn ngữ, NBSP trước ₫", () => {
    expect(vnd(690000, "vi")).toBe(`690.000${NBSP}₫`);
    expect(vnd(1890000, "en")).toBe(`1,890,000${NBSP}₫`);
    expect(formatMoney({ amount: "45000", currency: "VND" }, "vi")).toBe(`45.000${NBSP}₫`);
    expect(vnd(0, "vi")).toBe(`0${NBSP}₫`);
  });

  it("không bao giờ có khoảng trắng thường (không bẻ dòng)", () => {
    expect(formatMoney({ amount: 123456, currency: "USD" }, "vi")).not.toMatch(/ /);
    expect(formatMoney({ amount: 123456, currency: "USD" }, "en")).toBe("$1,234.56");
  });

  it("nhóm chữ số, cả số âm", () => {
    expect(groupDigits(-1234567, "vi")).toBe("-1.234.567");
    expect(groupDigits(999, "en")).toBe("999");
  });
});

describe("chữ", () => {
  it("điểm đánh giá theo ngôn ngữ", () => {
    expect(formatRating(4.8, "vi")).toBe("4,8");
    expect(formatRating(4.8, "en")).toBe("4.8");
  });

  it("ngày theo giờ Việt Nam", () => {
    // 17:30 UTC ngày 7 là 0:30 ngày 8 ở Việt Nam.
    expect(formatDate("2026-11-07T17:30:00Z", "vi")).toBe("08/11/2026");
    expect(formatDate("2026-11-07T17:30:00Z", "en")).toBe("8 Nov 2026");
    expect(formatDate("không phải ngày", "vi")).toBe("");
  });

  it("số và đơn vị không tách dòng", () => {
    expect(keepUnits("Chảo gang 26 cm")).toBe(`Chảo gang 26${NBSP}cm`);
    expect(keepUnits("Hộp 1 lít (bộ 3)")).toBe(`Hộp 1${NBSP}lít (bộ 3)`);
  });

  it("chữ cái đầu của tên", () => {
    expect(initials("Thu Hà")).toBe("TH");
    expect(initials("minh")).toBe("M");
    expect(initials("  ")).toBe("?");
  });

  it("chọn cố định theo chuỗi", () => {
    expect(pick("abc", 5)).toBe(pick("abc", 5));
    expect(pick("abc", 5)).toBeLessThan(5);
    expect(pick("abc", 0)).toBe(0);
  });
});
