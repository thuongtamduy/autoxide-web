// Doanh thu hôm nay theo nút (ô "Doanh thu hôm nay" và khối "theo nút" của Tổng quan), hàm thuần để
// test. Cách tính theo bản thiết kế: tổng tiền đã thu thành công từ 0:00 hôm nay (giờ Việt Nam), gồm
// thuế, chưa trừ hoàn tiền; đơn thu khi giao (COD) chỉ tính khi đã thu. Core sẽ trả số này từ bảng dẫn
// xuất (`SummaryMetric` `orders.revenue_today`, bước 51 P4 + bước 38), không quét đơn mỗi lần mở trang.
import { sumByDay } from "@/lib/chart";
import { vietnamDayOf } from "./registry";

interface PaidOrder {
  org_id: string;
  org_name: string;
  status: string;
  payments: readonly {
    status: string;
    succeeded_at: string | null;
    amount: { amount: string };
    received: { amount: string } | null;
  }[];
}

export interface RevenueByOrg {
  org_id: string;
  org_name: string;
  /** Số nguyên đồng. */
  amount: number;
  orders: number;
}

export function revenueToday(
  orders: readonly PaidOrder[],
  now: number,
): { total: number; by_org: RevenueByOrg[] } {
  return revenueOn(orders, vietnamDayOf(now));
}

/** Ngày gần nhất (giờ Việt Nam, trước hay bằng `day`) có tiền thu thành công; `null` khi chưa có. */
export function lastRevenueDay(orders: readonly PaidOrder[], day: string): string | null {
  let best: string | null = null;
  for (const order of orders) {
    for (const payment of order.payments) {
      if (payment.status !== "succeeded" || !payment.succeeded_at) continue;
      const at = vietnamDayOf(Date.parse(payment.succeeded_at));
      if (at <= day && (best === null || at > best)) best = at;
    }
  }
  return best;
}

/** Doanh thu của một ngày lịch (giờ Việt Nam), theo nút. */
export function revenueOn(
  orders: readonly PaidOrder[],
  today: string,
): { total: number; by_org: RevenueByOrg[] } {
  const byOrg = new Map<string, RevenueByOrg>();
  for (const order of orders) {
    let paid = 0;
    for (const payment of order.payments) {
      if (payment.status !== "succeeded" || !payment.succeeded_at) continue;
      if (vietnamDayOf(Date.parse(payment.succeeded_at)) !== today) continue;
      paid += Number((payment.received ?? payment.amount).amount);
    }
    if (paid === 0) continue;
    const row = byOrg.get(order.org_id) ?? {
      org_id: order.org_id,
      org_name: order.org_name,
      amount: 0,
      orders: 0,
    };
    row.amount += paid;
    row.orders += 1;
    byOrg.set(order.org_id, row);
  }
  const by_org = [...byOrg.values()].sort(
    (a, b) => b.amount - a.amount || a.org_name.localeCompare(b.org_name),
  );
  return { total: by_org.reduce((sum, row) => sum + row.amount, 0), by_org };
}

/**
 * Doanh thu từng ngày của `days` (giờ Việt Nam), cùng cách tính như "hôm nay": tiền thu thành công theo
 * ngày thu, gồm thuế, chưa trừ hoàn tiền. Cho biểu đồ doanh thu ở Tổng quan và sparkline của ô số liệu.
 */
export function revenueByDay(orders: readonly PaidOrder[], days: readonly string[]): number[] {
  const points: { day: string; value: number }[] = [];
  for (const order of orders) {
    for (const payment of order.payments) {
      if (payment.status !== "succeeded" || !payment.succeeded_at) continue;
      points.push({
        day: vietnamDayOf(Date.parse(payment.succeeded_at)),
        value: Number((payment.received ?? payment.amount).amount),
      });
    }
  }
  return sumByDay(points, days);
}
