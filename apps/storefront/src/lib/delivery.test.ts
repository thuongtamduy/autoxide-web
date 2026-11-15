import { describe, expect, it } from "vitest";
import { deliveryWindow, shippingFee, vietnamDay } from "./delivery";

describe("ngày giao dự kiến", () => {
  it("trước 16:00 tính từ hôm nay, sau 16:00 tính từ ngày mai (giờ Việt Nam)", () => {
    // 10:00 thứ Hai 16/11/2026 giờ Việt Nam.
    const morning = deliveryWindow(Date.parse("2026-11-16T03:00:00Z"), [1, 2]);
    expect(vietnamDay(morning.from)).toEqual({ weekday: 2, dayMonth: "17/11" });
    expect(vietnamDay(morning.to)).toEqual({ weekday: 3, dayMonth: "18/11" });
    expect(morning.cutoffIn).toBe(360);
    // 17:00 cùng ngày.
    const evening = deliveryWindow(Date.parse("2026-11-16T10:00:00Z"), [1, 2]);
    expect(vietnamDay(evening.from).dayMonth).toBe("18/11");
    expect(evening.cutoffIn).toBeNull();
  });

  it("phí giao và mức miễn phí", () => {
    expect(shippingFee(690_000, 30_000, 1_000_000)).toEqual({
      fee: 30_000,
      missing: 310_000,
      progress: 69,
    });
    expect(shippingFee(1_380_000, 30_000, 1_000_000)).toEqual({
      fee: 0,
      missing: 0,
      progress: 100,
    });
  });
});
