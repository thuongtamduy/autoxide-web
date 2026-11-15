import { describe, expect, it } from "vitest";
import {
  canMove,
  filterQuery,
  hasFilters,
  NO_FILTERS,
  ORDER_STATUSES,
  ordersHref,
  parseDong,
  readFilters,
  TRANSITIONS,
  without,
} from "./orders";

describe("bộ lọc đơn trên địa chỉ trang", () => {
  it("bỏ giá trị lạ, giữ thứ tự trạng thái cố định", () => {
    const f = readFilters({
      status: "shipping,nope,confirmed",
      channel: "fax",
      org: "not-a-uuid",
      flow: "cod",
      pay: "paid",
      from: "15/11/2026",
      q: "  BM-2611 ",
    });
    expect(f).toEqual({
      ...NO_FILTERS,
      status: ["confirmed", "shipping"],
      flow: "cod",
      pay: "paid",
      q: "BM-2611",
    });
  });

  it("chuỗi truy vấn chuẩn: đọc lại ra đúng bộ lọc (dùng để so view)", () => {
    const f = readFilters({
      q: "Hoa",
      flow: "cod",
      status: "preparing,confirmed",
      from: "2026-11-01",
    });
    const query = filterQuery(f);
    expect(query).toBe("status=confirmed%2Cpreparing&flow=cod&from=2026-11-01&q=Hoa");
    expect(readFilters(Object.fromEntries(new URLSearchParams(query)))).toEqual(f);
    expect(ordersHref(f, { cursor: "x" })).toBe(`/sales/orders?${query}&cursor=x`);
    expect(ordersHref(NO_FILTERS)).toBe("/sales/orders");
    expect(hasFilters(without(readFilters({ flow: "cod" }), "flow"))).toBe(false);
  });

  it("đọc số tiền gõ tay", () => {
    expect(parseDong("690.000 ₫")).toBe(690000);
    expect(parseDong("1,230,000")).toBe(1230000);
    expect(parseDong("12a")).toBeNull();
    expect(parseDong("")).toBeNull();
  });
});

describe("bảng chuyển trạng thái", () => {
  it("chỉ các cặp trong bảng; hoàn tất và huỷ là cuối", () => {
    expect(canMove("pending_payment", "confirmed")).toBe(true);
    expect(canMove("shipping", "delivered")).toBe(true);
    expect(canMove("delivered", "shipping")).toBe(false);
    expect(canMove("shipping", "cancelled")).toBe(false);
    expect(TRANSITIONS.completed).toEqual([]);
    expect(TRANSITIONS.cancelled).toEqual([]);
    for (const s of ORDER_STATUSES) expect(canMove(s, s)).toBe(false);
  });
});
