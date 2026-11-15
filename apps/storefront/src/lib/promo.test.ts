import { describe, expect, it } from "vitest";
import { discountPercent, priceAfterBp, remainingPercent } from "./promo";

describe("khuyến mại để hiện", () => {
  it("phần trăm giảm làm tròn xuống, không ghi cao hơn thật", () => {
    expect(discountPercent(690_000, 345_000)).toBe(50);
    expect(discountPercent(99_000, 59_400)).toBe(40);
    expect(discountPercent(100, 67)).toBe(33);
    expect(discountPercent(100, 120)).toBe(0);
    expect(discountPercent(0, 0)).toBe(0);
  });

  it("giá sau basis point như mã BEPMOC10, suất còn", () => {
    expect(priceAfterBp(690_000, 1000)).toBe(621_000);
    expect(priceAfterBp(760_000, 1000)).toBe(684_000);
    expect(remainingPercent(15, 20)).toBe(75);
    expect(remainingPercent(5, 0)).toBe(0);
  });
});
