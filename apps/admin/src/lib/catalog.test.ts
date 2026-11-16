import { describe, expect, it } from "vitest";
import { listTaxRates, nextRate, rateOn } from "@/sample/tax";
import { formatDay, percentOf, signed, toVietnamInput } from "./catalog";
import { formatMoney } from "./format";

describe("định dạng của phân hệ Sản phẩm", () => {
  it("tiền đồng luôn có khoảng trắng không ngắt trước ₫, ở mọi ngôn ngữ", () => {
    expect(formatMoney("690000", "VND", "vi")).toBe("690.000 ₫");
    expect(formatMoney(690_000, "VND", "en")).toBe("690,000 ₫");
  });

  it("số có dấu, ngày, giờ Việt Nam, phần trăm", () => {
    expect(signed(30, "vi")).toBe("+30");
    expect(signed(-2, "vi")).toBe("−2");
    expect(formatDay("2027-01-01", "en")).toBe("Jan 1, 2027");
    expect(toVietnamInput("2026-11-15T03:00:00.000Z")).toBe("2026-11-15T10:00");
    expect(percentOf(2398, 2400)).toBe(100);
    expect(percentOf(0, 0)).toBe(0);
  });
});

describe("thuế suất có ngày hiệu lực (dữ liệu mẫu, bước 36)", () => {
  it("mức giảm 8% tới hết 31/12/2026, từ 01/01/2027 về 10%", async () => {
    const { data } = await listTaxRates();
    expect(rateOn(data, "vat.standard_reducible", "2026-12-31")?.rate_percent).toBe("8");
    expect(rateOn(data, "vat.standard_reducible", "2027-01-01")?.rate_percent).toBe("10");
    expect(nextRate(data, "vat.standard_reducible", "2026-11-15")?.effective_from).toBe(
      "2027-01-01",
    );
    expect(rateOn(data, "vat.standard", "2026-11-15")?.rate_percent).toBe("10");
  });
});
