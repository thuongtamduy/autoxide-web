import { describe, expect, it } from "vitest";
import { lastRevenueDay, revenueByDay, revenueOn, revenueToday } from "./revenue";

const NOW = Date.parse("2026-11-15T03:00:00Z"); // 10:00 giờ Việt Nam

function order(org: string, payments: [string, string | null, number, number | null][]) {
  return {
    org_id: org,
    org_name: `Nút ${org}`,
    status: "confirmed",
    payments: payments.map(([status, at, amount, received]) => ({
      status,
      succeeded_at: at,
      amount: { amount: String(amount) },
      received: received === null ? null : { amount: String(received) },
    })),
  };
}

describe("doanh thu hôm nay theo nút", () => {
  it("chỉ tính tiền đã thu từ 0:00 hôm nay giờ Việt Nam, theo số thực nhận", () => {
    const result = revenueToday(
      [
        // 23:30 hôm qua giờ Việt Nam: không tính
        order("a", [["succeeded", "2026-11-14T16:30:00Z", 100_000, null]]),
        // 0:30 hôm nay: tính; nhận lệch số thì tính số đã nhận
        order("a", [["succeeded", "2026-11-14T17:30:00Z", 200_000, 190_000]]),
        // chưa thu (COD chờ) không tính
        order("b", [["pending", null, 500_000, null]]),
        order("b", [["succeeded", "2026-11-15T02:00:00Z", 300_000, null]]),
      ],
      NOW,
    );
    expect(result.total).toBe(490_000);
    expect(result.by_org).toEqual([
      { org_id: "b", org_name: "Nút b", amount: 300_000, orders: 1 },
      { org_id: "a", org_name: "Nút a", amount: 190_000, orders: 1 },
    ]);
  });

  it("ngày gần nhất có thu, khi hôm nay chưa thu", () => {
    const orders = [
      order("a", [["succeeded", "2026-11-13T05:00:00Z", 100_000, null]]),
      order("a", [["succeeded", "2026-11-20T05:00:00Z", 100_000, null]]),
    ];
    expect(revenueToday(orders, NOW).total).toBe(0);
    expect(lastRevenueDay(orders, "2026-11-15")).toBe("2026-11-13");
    expect(revenueOn(orders, "2026-11-13").total).toBe(100_000);
    expect(lastRevenueDay([], "2026-11-15")).toBeNull();
  });
});

describe("doanh thu theo ngày (biểu đồ Tổng quan)", () => {
  it("gom theo ngày thu giờ Việt Nam, cùng cách tính với hôm nay; ngày không thu là 0", () => {
    const orders = [
      // 23:30 ngày 14 giờ Việt Nam
      order("a", [["succeeded", "2026-11-14T16:30:00Z", 100_000, null]]),
      // 0:30 ngày 15 giờ Việt Nam, thực nhận 190.000
      order("a", [["succeeded", "2026-11-14T17:30:00Z", 200_000, 190_000]]),
      order("b", [["pending", null, 500_000, null]]),
      order("b", [["succeeded", "2026-11-15T02:00:00Z", 300_000, null]]),
    ];
    const days = ["2026-11-13", "2026-11-14", "2026-11-15"];
    expect(revenueByDay(orders, days)).toEqual([0, 100_000, 490_000]);
    // Ngày cuối khớp ô "Doanh thu hôm nay".
    expect(revenueByDay(orders, days).at(-1)).toBe(revenueToday(orders, NOW).total);
  });
});
