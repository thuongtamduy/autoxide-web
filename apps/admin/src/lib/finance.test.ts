import { describe, expect, it } from "vitest";
import { entryTotals, formatMonth, formatPercent, parseDong } from "./finance";

describe("phân hệ Tài chính: hàm thuần", () => {
  it("số đồng gõ tay: nhận dấu ngăn nghìn, từ chối phần lẻ và số âm", () => {
    expect(parseDong("1.900.000")).toBe(1_900_000);
    expect(parseDong("1,900,000")).toBe(1_900_000);
    expect(parseDong(" 44000 ")).toBe(44_000);
    expect(parseDong("12,5")).toBeNull();
    expect(parseDong("-3")).toBeNull();
    expect(parseDong("0")).toBeNull();
    expect(parseDong("")).toBeNull();
  });

  it("cộng Nợ / Có khi gõ, bỏ ô sai", () => {
    expect(
      entryTotals([
        { debit: "44.000", credit: "" },
        { debit: "", credit: "40000" },
        { debit: "abc", credit: "" },
      ]),
    ).toEqual({ debit: 44_000, credit: 40_000, difference: 4_000 });
  });

  it("tháng và thuế suất theo ngôn ngữ", () => {
    expect(formatMonth("2026-11", "vi")).toBe("11/2026");
    expect(formatMonth("2026-11", "en")).toBe("Nov 2026");
    expect(formatPercent("0.5", "vi")).toBe("0,5%");
    expect(formatPercent("0.5", "en")).toBe("0.5%");
    expect(formatPercent("8", "en")).toBe("8%");
  });
});
