import { describe, expect, it, vi } from "vitest";

// `order-store.ts` chỉ chạy trên máy chủ (`server-only`); trong test Node thì bỏ dấu đó.
vi.mock("server-only", () => ({}));

import { parseBuyer, serializeBuyer, tierProgress } from "./account";
import { parseAccountState, parseNumbers, serializeAccountState } from "./buyer-server";
import { buildQuote, EMPTY_FORM } from "./checkout";
import { findOrder, markPaid, ordersForKey, placedOrder, placeOrders } from "./order-store";
import {
  cancellable,
  maskPhone,
  returnWindow,
  SAMPLE_PHONE,
  sampleBuyerOrders,
  timeline,
} from "./orders";

const NOW = new Date("2026-11-13T03:00:00Z");
const DAY = 86_400_000;

describe("đơn của tài khoản mẫu", () => {
  const orders = sampleBuyerOrders(NOW);

  it("tổng = tiền hàng − giảm + phí giao; mã đơn sau dải mã của trang quản trị", () => {
    for (const order of orders) {
      expect(order.total).toBe(order.goods - order.discount + order.shipping - order.points_value);
      expect(order.number).toMatch(/^BM-26(10|11)-\d{4}$/);
      expect(order.number <= "BM-2611-0419" && order.number.startsWith("BM-2611")).toBe(false);
    }
    // Hai đơn của một lần thanh toán: Bếp Mộc và Gốm Sứ Bát Tràng Xưa.
    expect(orders.filter((o) => o.checkout === "ck-0424").map((o) => o.seller)).toEqual([
      null,
      "gom-su-bat-trang-xua",
    ]);
  });

  it("mốc: COD không có bước thanh toán; nhận tại cửa hàng có bước sẵn sàng / đã nhận", () => {
    const cod = orders.find((o) => o.number === "BM-2611-0420");
    expect(cod && timeline(cod).map((s) => s.key)).toEqual([
      "placed",
      "confirmed",
      "preparing",
      "shipping",
      "delivered",
    ]);
    const pickup = orders.find((o) => o.number === "BM-2610-0388");
    expect(pickup && timeline(pickup).map((s) => s.key)).toContain("picked_up");
    const fresh = orders.find((o) => o.number === "BM-2611-0424");
    expect(fresh && timeline(fresh).filter((s) => s.at).length).toBe(3);
  });

  it("hạn đổi trả 7 ngày từ khi nhận; huỷ được khi chưa giao cho vận chuyển", () => {
    const delivered = orders.find((o) => o.number === "BM-2611-0420");
    expect(delivered && returnWindow(delivered, NOW)?.days_left).toBe(3);
    expect(delivered && returnWindow(delivered, new Date(NOW.getTime() + 5 * DAY))?.days_left).toBe(
      0,
    );
    const shipping = orders.find((o) => o.number === "BM-2611-0421");
    expect(shipping && returnWindow(shipping, NOW)).toBeNull();
    expect(orders.filter(cancellable).map((o) => o.number)).toEqual([
      "BM-2611-0424",
      "BM-2611-0425",
    ]);
  });

  it("che số điện thoại", () => {
    expect(maskPhone("0901234567")).toBe("090•••4567");
  });
});

describe("kho đơn đặt trên website mẫu", () => {
  const form = {
    ...EMPTY_FORM,
    name: "Khách",
    phone: "0912 345 678",
    province: "79",
    ward: "79-01",
    street: "[Số nhà mẫu]",
    payment: "vietqr" as const,
    terms: true,
  };
  const quote = buildQuote({
    lines: [
      { sku: "CG26", quantity: 1 },
      { sku: "GS-DIA26", quantity: 1 },
    ],
    code: null,
    store: "q3",
    delivery: "ship",
    province: "79",
    points: 0,
    balance: null,
    now: NOW,
  });

  it("một lần đặt thành một đơn mỗi nơi bán; cùng Idempotency-Key thì không đặt thêm", () => {
    const first = placeOrders({ key: "k-1", form, quote, now: NOW });
    expect(first.replayed).toBe(false);
    expect(first.numbers).toHaveLength(2);
    expect(first.numbers[0]).toMatch(/^BM-2611-0\d{3}$/);
    const again = placeOrders({ key: "k-1", form, quote, now: NOW });
    expect(again).toEqual({ numbers: first.numbers, replayed: true });
    expect(ordersForKey("k-1")).toEqual(first.numbers);
    const [own, seller] = first.numbers.map(placedOrder);
    expect(own?.status).toBe("pending_payment");
    expect(own?.payment_ref).toMatch(/^[A-Z2-9]{10}$/);
    expect(seller?.payment_ref).toBe(own?.payment_ref);
    expect(own?.contact.phone).toBe("0912345678");
  });

  it("báo đã trả đổi mọi đơn của lần thanh toán; tra cứu cần đúng số điện thoại", () => {
    const { numbers } = placeOrders({ key: "k-2", form, quote, now: NOW });
    markPaid(numbers[0] ?? "", NOW);
    expect(numbers.map((n) => placedOrder(n)?.status)).toEqual(["confirmed", "confirmed"]);
    expect(findOrder(numbers[1] ?? "", "0912345678", NOW)?.number).toBe(numbers[1]);
    expect(findOrder(numbers[1] ?? "", "0900000000", NOW)).toBeNull();
    expect(findOrder("bm-2611-0424", SAMPLE_PHONE, NOW)?.number).toBe("BM-2611-0424");
  });
});

describe("cookie trạng thái người mua", () => {
  it("đọc mã đơn hợp lệ, bỏ giá trị lạ", () => {
    expect(parseNumbers("BM-2611-0426,xx,BM-2611-0427")).toEqual(["BM-2611-0426", "BM-2611-0427"]);
    const state = { returns: ["BM-2611-0420"], cancelled: [] };
    expect(parseAccountState(serializeAccountState(state))).toEqual(state);
    expect(parseAccountState("rác")).toEqual({ returns: [], cancelled: [] });
  });
});

describe("tài khoản mẫu trong cookie", () => {
  it("mẫu, tài khoản mới, giá trị lạ", () => {
    expect(parseBuyer("sample", NOW)?.name).toBe("Lan Chi");
    const value = serializeBuyer({ kind: "new", name: "Thu Hà", phone: "0912345678" });
    expect(parseBuyer(value, NOW)).toMatchObject({ kind: "new", name: "Thu Hà", points: 0 });
    expect(parseBuyer("admin", NOW)).toBeNull();
    expect(tierProgress(parseBuyer("sample", NOW) ?? ({} as never))).toBe(31);
  });
});
