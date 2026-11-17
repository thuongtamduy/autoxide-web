import { beforeEach, describe, expect, it } from "vitest";
import { NO_FILTERS, PENDING_STATUSES, readFilters } from "@/lib/orders";
import { ORG, resetSampleCatalog } from "./catalog";
import { FINANCE_ORDER_REFS } from "./finance";
import { listDocuments } from "./finance-invoices";
import { listMovements } from "./inventory";
import { seedMarket } from "./market-data";
import { ORDER_REFS, orderByNumber } from "./order-refs";
import {
  acceptOrders,
  canRemindCart,
  countOrders,
  createStoreReturn,
  decideProposal,
  decideReturn,
  findOrderByNumber,
  handOver,
  ledgerOf,
  listCarts,
  listOrders,
  listReturns,
  num,
  orderSummary,
  parseFilterText,
  pickupCodeForTest,
  pickupReady,
  refundOrder,
  remindCart,
  resetSampleOrders,
  transitionOrder,
  undoAccept,
} from "./orders";
import { resetSamplePromotions } from "./promotions";
import { listShipments, resetSampleShipping } from "./shipping";

async function order(number: string) {
  const o = await findOrderByNumber(number);
  if (!o) throw new Error(`thiếu ${number}`);
  return o;
}

beforeEach(() => {
  resetSampleCatalog();
  resetSamplePromotions();
  resetSampleShipping();
  resetSampleOrders();
});

describe("bộ dữ liệu đơn mẫu", () => {
  it("412 đơn trong 30 ngày, 37 chờ xử lý — cùng số với danh sách và view", async () => {
    const summary = await orderSummary();
    expect(summary.last_30_days).toBe(412);
    expect(summary.pending).toBe(37);
    expect(await countOrders(NO_FILTERS)).toBe(412);
    expect(await countOrders({ ...NO_FILTERS, status: [...PENDING_STATUSES] })).toBe(37);
    const page = await listOrders(NO_FILTERS, { limit: 25 });
    expect(page.data).toHaveLength(25);
    expect(page.data[0]?.number).toBe("BM-2611-0419");
  });

  it("mọi mã đơn dùng chung có đơn, cùng ID và nút bán", async () => {
    for (const ref of ORDER_REFS) {
      const o = await order(ref.number);
      expect(o.id).toBe(ref.id);
      expect(o.org_id).toBe(ref.org_id);
    }
  });

  it("vận đơn khớp đơn: cùng món, tiền COD bằng tổng đơn", async () => {
    const { data } = await listShipments({ limit: 100 });
    expect(data.length).toBeGreaterThan(10);
    for (const x of data) {
      const o = await order(x.order_number);
      const lines = o.lines.map((l) => `${l.sku}×${l.quantity}`).sort();
      expect(x.items.map((i) => `${i.sku}×${i.quantity}`).sort()).toEqual(lines);
      if (x.cod) {
        expect(o.payment_method).toBe("cod");
        expect(x.cod.amount).toBe(o.total.amount);
      } else {
        expect(o.payment_method).not.toBe("cod");
      }
    }
  });

  it("tổng đơn = tiền hàng − giảm + phí giao − giảm phí; khuyến mại có sẵn được áp", async () => {
    const { data } = await listOrders(NO_FILTERS, { limit: 1000 });
    for (const o of data) {
      expect(num(o.total)).toBe(
        num(o.subtotal) - num(o.discount) + num(o.shipping_fee) - num(o.shipping_discount),
      );
      expect(num(o.tax)).toBe(o.lines.reduce((s, l) => s + num(l.taxes[0]?.amount), 0));
    }
    const pan = await order("BM-2611-0414");
    expect(pan.promotions.find((p) => p.code === "BEPMOC10")?.amount.amount).toBe("138000");
    expect(pan.total.amount).toBe("2062000");
    const gift = await order("BM-2611-0415");
    expect(gift.lines.find((l) => l.gift)?.sku).toBe("NRC750");
    expect(gift.total.amount).toBe("685000");
  });

  it("đơn mà Tài chính trỏ tới mang đúng kênh, cách trả, trạng thái, số tiền", async () => {
    const expectOrder = async (n: string, want: Record<string, string>) => {
      const o = await order(n);
      const got = {
        channel: o.channel,
        method: o.payment_method,
        status: o.status,
        total: o.total.amount,
      };
      expect(got).toMatchObject(want);
    };
    await expectOrder("BM-2611-0416", {
      channel: "pos",
      method: "cash",
      status: "delivered",
      total: "1900000",
    });
    await expectOrder("BM-2611-0412", { method: "vietqr", total: "1240000" });
    await expectOrder("BM-2611-0398", {
      channel: "web",
      method: "vietqr",
      status: "delivered",
      total: "389000",
    });
    await expectOrder("BM-2611-0417", { channel: "marketplace", total: "439000" });
    await expectOrder("BM-2611-0350", {
      channel: "marketplace",
      status: "completed",
      total: "690000",
    });
    await expectOrder("BM-2611-0411", { status: "pending_payment", total: "660000" });
    await expectOrder("BM-2611-0405", { status: "cancelled", total: "575000" });
    await expectOrder("BM-2611-0409", { method: "card", total: "1230000" });
    await expectOrder("BM-2611-0419", {
      method: "vietqr",
      status: "pending_payment",
      total: "315000",
    });
    expect((await order("BM-2611-0411")).payments[0]?.received?.amount).toBe("600000");
    const late = await order("BM-2611-0405");
    expect(late.payment_status).toBe("refunded");
    expect(late.refunds[0]?.reason).toBe("late_payment");
  });

  it("bút toán của mọi đơn cân (nợ = có), đơn sàn không ghi doanh thu", async () => {
    const { data } = await listOrders(NO_FILTERS, { limit: 1000 });
    for (const o of data) {
      for (const e of ledgerOf(o)) {
        const sum = e.lines.reduce((s, l) => s + (l.side === "debit" ? 1 : -1) * num(l.amount), 0);
        expect(sum).toBe(0);
      }
    }
    expect(ledgerOf(await order("BM-2611-0350")).map((e) => e.kind)).toEqual(["capture"]);
    expect(ledgerOf(await order("BM-2611-0362"))).toEqual([]);
  });
});

describe("thao tác trên đơn", () => {
  it("nhận đơn rồi hoàn tác; chuyển sai bảng → 409; phiên bản cũ → 412", async () => {
    const o = await order("BM-2611-0413");
    const accepted = await transitionOrder(o.id, "confirmed", { expect: o.updated_at });
    expect(accepted.ok && accepted.data.previous).toBe("awaiting_acceptance");
    const back = await transitionOrder(o.id, "awaiting_acceptance");
    expect(back.ok && back.data.order.status).toBe("awaiting_acceptance");
    const wrong = await transitionOrder(o.id, "delivered");
    expect(!wrong.ok && wrong.problem.code).toBe("orders.invalid_transition");
    const stale = await transitionOrder(o.id, "confirmed", { expect: "2000-01-01T00:00:00.000Z" });
    expect(!stale.ok && stale.problem.status).toBe(412);
  });

  it("huỷ đơn đã thu tiền tự hoàn toàn bộ; không đảo được", async () => {
    const o = await order("BM-2611-0412");
    const out = await transitionOrder(o.id, "cancelled");
    expect(out.ok && out.data.order.payment_status).toBe("refunded");
    expect((await transitionOrder(o.id, "preparing")).ok).toBe(false);
  });

  it("hoàn tiền không vượt số đã thu; gửi lại cùng mã tham chiếu không hoàn hai lần", async () => {
    const o = await order("BM-2611-0398");
    const tooMuch = await refundOrder(o.id, { amount: "389001", reason: "x", reference: "r1" });
    expect(!tooMuch.ok && tooMuch.problem.code).toBe("orders.refund_exceeds_paid");
    const first = await refundOrder(o.id, { amount: "100000", reason: "x", reference: "r2" });
    const again = await refundOrder(o.id, { amount: "100000", reason: "x", reference: "r2" });
    expect(first.ok && again.ok && again.data.replayed).toBe(true);
    expect((await order("BM-2611-0398")).refunded.amount).toBe("100000");
    expect((await order("BM-2611-0398")).payment_status).toBe("partially_refunded");
  });

  it("xác nhận hàng loạt bỏ qua đơn khác trạng thái; hoàn tác đưa về chờ xác nhận", async () => {
    const waiting = await listOrders(
      { ...NO_FILTERS, status: ["awaiting_acceptance"] },
      { limit: 3 },
    );
    const other = await order("BM-2611-0398");
    const out = await acceptOrders([...waiting.data.map((o) => o.id), other.id]);
    expect(out.changed).toHaveLength(3);
    expect(out.skipped).toBe(1);
    expect(await undoAccept(out.changed)).toBe(3);
    expect((await orderSummary()).pending).toBe(37);
  });
});

describe("lọc bằng lời (mẫu của bộ lọc AI)", () => {
  const now = Date.parse("2026-11-13T05:00:00Z"); // thứ Sáu
  it("câu tiếng Việt thành tham số lọc", () => {
    const out = parseFilterText("Đơn COD ở Quận 3 tuần này chưa giao", now);
    expect(out.filters.status).toEqual(["confirmed", "preparing", "shipping", "delivery_failed"]);
    expect(out.filters.flow).toBe("cod");
    expect(out.filters.org).toBe(ORG.Q3);
    expect(out.filters.from).toBe("2026-11-09");
    expect(out.unknown).toBe("");
  });
  it("tiếng Anh và phần không hiểu để riêng", () => {
    const out = parseFilterText("cancelled marketplace orders today with blue lids", now);
    expect(out.filters.status).toEqual(["cancelled"]);
    expect(out.filters.channel).toBe("marketplace");
    expect(out.filters.from).toBe("2026-11-13");
    expect(out.unknown).toBe("blue lids");
    expect(readFilters({ status: out.filters.status.join(",") }).status).toEqual(["cancelled"]);
  });
});

describe("đổi trả", () => {
  it("duyệt đề xuất của agent thì hoàn ngay; từ chối thì mở lại được", async () => {
    const r1 = (await listReturns()).data.find((r) => r.order_number === "BM-2611-0409");
    if (!r1) throw new Error("thiếu yêu cầu");
    expect((await decideProposal(r1.id, "reject")).ok).toBe(true);
    expect((await decideProposal(r1.id, "reopen")).ok).toBe(true);
    const ok = await decideProposal(r1.id, "approve");
    expect(ok.ok && ok.data.status).toBe("refunded");
    expect((await order("BM-2611-0409")).refunded.amount).toBe("690000");
  });

  it("yêu cầu trả tại quầy không duyệt được (đi thẳng tới nhận hàng), kể cả từ thanh hàng loạt", async () => {
    const inStore = (await listReturns()).data.find(
      (r) => r.return_method === "in_store" && r.status === "requested",
    );
    if (!inStore) throw new Error("thiếu yêu cầu trả tại quầy");
    const out = await decideReturn(inStore.id, { step: "approve" });
    expect(!out.ok && out.problem.code).toBe("orders.return_invalid_transition");
  });

  it("từ chối cần lý do trong danh sách và lời giải thích; nhận hàng rồi hoàn", async () => {
    const list = (await listReturns()).data;
    const requested = list.find((r) => r.order_number === "BM-2611-0395");
    const received = list.find((r) => r.order_number === "BM-2611-0379");
    if (!requested || !received) throw new Error("thiếu yêu cầu");
    const bad = await decideReturn(requested.id, { step: "reject", code: "rude", note: "" });
    expect(!bad.ok && (bad.problem.errors ?? []).map((e) => e.field)).toEqual(["code", "note"]);
    const refund = await decideReturn(received.id, { step: "refund" });
    expect(refund.ok && refund.data.status).toBe("refunded");
    expect((await order("BM-2611-0379")).refunded.amount).toBe("575000");
  });

  it("đổi trả tại quầy: quá hạn đổi trả bị chặn, số lượng không vượt số đã mua", async () => {
    const closed = await createStoreReturn({
      order_number: "BM-2611-0331",
      sku: "TG35",
      quantity: "1",
      reason_code: "defective",
      condition: "restock",
      resolution: "refund",
    });
    expect(!closed.ok && closed.problem.code).toBe("orders.return_window_closed");
    const tooMany = await createStoreReturn({
      order_number: "BM-2611-0398",
      sku: "TG35",
      quantity: "2",
      reason_code: "defective",
      condition: "restock",
      resolution: "refund",
    });
    expect(!tooMany.ok && tooMany.problem.errors?.[0]?.code).toBe("orders.return_quantity_invalid");
    const ok = await createStoreReturn({
      order_number: "BM-2611-0398",
      sku: "TG35",
      quantity: "1",
      reason_code: "defective",
      condition: "damaged",
      resolution: "refund",
    });
    expect(ok.ok && ok.data.status).toBe("received");
  });
});

describe("giỏ bỏ dở và nhận tại cửa hàng", () => {
  it("chỉ nhắc khách đã đồng ý, tối đa 2 lần, hoàn tác được trước khi gửi", async () => {
    const carts = (await listCarts()).data;
    const noConsent = carts.find((c) => !c.consent);
    const twice = carts.find((c) => c.reminders_sent === 2);
    const fresh = carts.find((c) => c.consent && c.reminders_sent === 0);
    if (!noConsent || !twice || !fresh) throw new Error("thiếu giỏ");
    const a = await remindCart(noConsent.id);
    expect(!a.ok && a.problem.code).toBe("orders.cart_no_consent");
    const b = await remindCart(twice.id);
    expect(!b.ok && b.problem.code).toBe("orders.cart_reminder_limit");
    expect((await remindCart(fresh.id)).ok).toBe(true);
    const undo = await remindCart(fresh.id, true);
    expect(undo.ok && undo.data.reminders_sent).toBe(0);
  });

  it("bàn giao cần đúng mã; người nhận hộ phải khớp tên đã khai", async () => {
    const o = await order("BM-2611-0406");
    const wrong = await handOver(o.id, { who: "proxy", code: "000000", proxy_name: "Người lạ" });
    expect(!wrong.ok && (wrong.problem.errors ?? []).map((e) => e.code)).toEqual([
      "orders.pickup_code_invalid",
      "orders.pickup_proxy_mismatch",
    ]);
    const code = (await pickupCodeForTest(o.id)) ?? "";
    const ok = await handOver(o.id, { who: "proxy", code, proxy_name: "ngô thị lan" });
    expect(ok.ok && ok.data.status).toBe("delivered");
    expect(ok.ok && ok.data.invoice?.series).toBe("1C26TBM");
  });

  it("báo sẵn sàng rồi hoàn tác", async () => {
    const o = await order("BM-2611-0408");
    expect((await pickupReady(o.id)).ok).toBe(true);
    const back = await pickupReady(o.id, true);
    expect(back.ok && back.data.pickup?.status).toBe("preparing");
  });
});

describe("mã đơn dùng chung giữa các phân hệ", () => {
  it("mọi mã đơn mà Tài chính trỏ tới đều có trong ORDER_REFS", () => {
    for (const number of Object.values(FINANCE_ORDER_REFS)) {
      expect(orderByNumber(number), number).not.toBeNull();
    }
  });

  it("hoá đơn trỏ tới đơn có thật: cùng tổng tiền, cùng thuế, cùng người mua; hoá đơn thay người bán đúng người bán", async () => {
    for (const d of (await listDocuments()).data) {
      const o = await findOrderByNumber(d.source_id);
      expect(o, d.source_id).not.toBeNull();
      expect(d.total.amount, d.source_id).toBe(o?.total.amount);
      expect(d.tax.amount, d.source_id).toBe(o?.tax.amount);
      expect(Number(d.subtotal.amount) + Number(d.tax.amount)).toBe(Number(d.total.amount));
      if (!d.buyer_requested_company) expect(d.buyer.name, d.source_id).toBe(o?.buyer.name);
      if (d.lines.length > 0) {
        expect(d.lines.reduce((sum, l) => sum + Number(l.total.amount), 0)).toBe(
          Number(d.total.amount),
        );
      }
      if (d.on_behalf_of) {
        expect(o?.channel).toBe("marketplace");
        expect(o?.seller?.name).toBe(d.on_behalf_of.name);
      } else {
        expect(o?.channel, d.source_id).not.toBe("marketplace");
      }
    }
  });

  it("xuất bán và nhận trả theo đơn trỏ tới đơn có đúng món đó", async () => {
    for (const kind of ["sale", "return"] as const) {
      const { data } = await listMovements({ kind, limit: 200 });
      const byOrder = data.filter((x) => x.source_type === "orders");
      expect(byOrder.length, kind).toBeGreaterThan(0);
      for (const m of byOrder) {
        const o = await findOrderByNumber(m.source_label);
        expect(o, m.source_label).not.toBeNull();
        expect(
          o?.lines.some((l) => l.sku === m.sku),
          `${m.source_label} ${m.sku}`,
        ).toBe(true);
      }
    }
  });

  it("đơn trên sàn có ở Đơn hàng: kênh sàn, cùng người bán, cùng số món và tiền hàng", async () => {
    const market = seedMarket();
    for (const m of market.orders) {
      const o = await findOrderByNumber(m.number);
      expect(o, m.number).not.toBeNull();
      expect(o?.id).toBe(m.id);
      expect(o?.channel, m.number).toBe("marketplace");
      const seller = market.sellers.find((s) => s.org_id === m.seller_org_id);
      expect(o?.seller?.name, m.number).toBe(seller?.display_name);
      expect(o?.subtotal.amount, m.number).toBe(m.total.amount);
      expect(o?.buyer.name, m.number).toBe(m.buyer_name);
      expect(
        o?.lines.reduce((n, l) => n + l.quantity, 0),
        m.number,
      ).toBe(m.items);
    }
  });
});

describe("bảng giỏ bỏ dở", () => {
  it("chỉ nhắc được giỏ có đồng ý nhận tin, có liên hệ, chưa nhắc đủ lần", async () => {
    const carts = (await listCarts()).data;
    for (const c of carts) {
      expect(canRemindCart(c)).toBe(c.consent && c.contact !== null && c.reminders_sent < 2);
    }
    const fresh = carts.find((c) => canRemindCart(c));
    if (!fresh) throw new Error("thiếu giỏ nhắc được");
    expect((await remindCart(fresh.id)).ok).toBe(true);
    expect((await remindCart(fresh.id)).ok).toBe(true);
    const after = (await listCarts()).data.find((c) => c.id === fresh.id);
    expect(after && canRemindCart(after)).toBe(false);
  });

  it("sắp theo giá trị và giờ bỏ dở", async () => {
    const values = (await listCarts({ field: "value", dir: "desc" })).data.map((c) =>
      Number(c.value.amount),
    );
    expect(values).toEqual([...values].sort((a, b) => b - a));
    const times = (await listCarts({ field: "abandoned", dir: "asc" })).data.map((c) =>
      Date.parse(c.abandoned_at),
    );
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});
