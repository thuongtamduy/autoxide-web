import { beforeEach, describe, expect, it } from "vitest";
import { resetSampleCatalog, VARIANT_ID } from "./catalog";
import { ACCOUNT_ID, channelPrice } from "./channel-accounts";
import {
  connectAccount,
  INBOUND_OPEN,
  inboundMatches,
  listAllocations,
  listInbound,
  listSettlements,
  mapInbound,
  postSettlement,
  pushQuantities,
  reconnectAccount,
  resetSampleChannels,
  resolveInbound,
  resolveSettlementLine,
  retryInbound,
  saveAllocation,
  settlementLines,
  settlementSummary,
  stockPreview,
} from "./channels";
import { resetSampleInventory } from "./inventory";
import {
  importChannelOrder,
  ledgerOf,
  orderSummary,
  ordersState,
  resetSampleOrders,
} from "./orders";
import { resetSamplePromotions } from "./promotions";

beforeEach(() => {
  resetSampleCatalog();
  resetSampleInventory();
  resetSamplePromotions();
  resetSampleOrders();
  resetSampleChannels();
});

describe("đơn nhập từ kênh trong bộ đơn mẫu", () => {
  it("mang tài khoản kênh, mã đơn trên kênh, giá kênh; số đơn 30 ngày không đổi", async () => {
    const { orders } = await ordersState();
    const channel = orders.filter((o) => o.channel_account !== null);
    expect(channel.length).toBeGreaterThan(10);
    for (const o of channel) {
      expect(["shopee", "tiktok_shop"]).toContain(o.channel);
      expect(o.external_ref).toMatch(/^(SP|TT)-\d+$/);
      expect(o.funds_flow).toBe("channel_collect");
      expect(o.promotions).toEqual([]);
    }
    const pan = channel.find(
      (o) => o.channel_account?.id === ACCOUNT_ID.official && o.lines.some((l) => l.sku === "CG26"),
    );
    expect(pan?.lines.find((l) => l.sku === "CG26")?.unit_price.amount).toBe("746000");
    expect((await orderSummary()).last_30_days).toBe(412);
  });

  it("bút toán đơn kênh: phải thu kênh khi thu, doanh thu khi giao; nợ = có", async () => {
    const { orders } = await ordersState();
    const done = orders.find(
      (o) => o.channel_account && o.status === "completed" && o.payment_method === "ewallet",
    );
    if (!done) throw new Error("thiếu đơn kênh đã hoàn tất");
    const entries = ledgerOf(done);
    expect(entries[0]?.lines[0]?.account).toBe("channel_receivable");
    expect(entries.some((e) => e.kind === "deliver")).toBe(true);
    for (const e of entries) {
      const d = e.lines
        .filter((l) => l.side === "debit")
        .reduce((s, l) => s + Number(l.amount.amount), 0);
      const c = e.lines
        .filter((l) => l.side === "credit")
        .reduce((s, l) => s + Number(l.amount.amount), 0);
      expect(d).toBe(c);
    }
  });

  it("giá kênh: tăng 8% làm tròn lên 1.000; giá cố định chỉ từ ngày hiệu lực", () => {
    expect(
      channelPrice({ kind: "markup", markup_bp: 800, rounding_minor: 1000 }, 690_000, "2026-11-15"),
    ).toBe(746_000);
    const fixed = { kind: "fixed" as const, amount: 799_000, effective_from: "2026-11-01" };
    expect(channelPrice(fixed, 820_000, "2026-10-31")).toBe(820_000);
    expect(channelPrice(fixed, 820_000, "2026-11-01")).toBe(799_000);
  });
});

describe("phân bổ tồn", () => {
  it("số đẩy không âm; không giữ riêng thì tổng số đẩy không vượt khả dụng", () => {
    for (const available of [0, 3, 17, 120]) {
      const out = pushQuantities(available, [
        { mode: "share", share_bp: 6000, reserved_qty: 0, buffer_qty: 2 },
        { mode: "share", share_bp: 4000, reserved_qty: 0, buffer_qty: 1 },
      ]);
      expect(out.every((n) => n >= 0)).toBe(true);
      expect(out.reduce((s, n) => s + n, 0)).toBeLessThanOrEqual(available);
    }
  });

  it("xem trước số đẩy khớp công thức; tổng tỉ lệ quá 100% và giữ riêng quá tồn bị chặn", async () => {
    const preview = await stockPreview(VARIANT_ID.NI20);
    const official = preview.rows.find((r) => r.account_id === ACCOUNT_ID.official);
    const reserved = preview.rows.find((r) => r.mode === "reserved");
    expect(official?.push).toBe(
      Math.max(
        0,
        Math.floor(((official?.available ?? 0) - (reserved?.reserved_qty ?? 0)) * 0.6) - 2,
      ),
    );
    expect(reserved?.push).toBeNull();
    const { data } = await listAllocations();
    const def = data.find((a) => a.account_id === ACCOUNT_ID.official && a.variant_id === null);
    const over = await saveAllocation({
      id: def?.id ?? "",
      mode: "share",
      share: "90",
      reserved: "0",
      buffer: "1",
    });
    expect(!over.ok && over.problem.code).toBe("channels.allocation_invalid");
    const res = data.find((a) => a.mode === "reserved");
    const tooMany = await saveAllocation({
      id: res?.id ?? "",
      mode: "reserved",
      share: "0",
      reserved: "100000",
      buffer: "0",
    });
    expect(!tooMany.ok && tooMany.problem.code).toBe("channels.allocation_unavailable");
  });
});

describe("tài khoản kênh", () => {
  it("khoá ngắn bị kênh từ chối (dưới ô), kênh chưa có bộ nối bị chặn, trùng tên bị chặn; không trả khoá", async () => {
    const short = await connectAccount({
      kind: "shopee",
      name: "Thử",
      org_id: "01a1e000-0000-7000-8000-000000000a04",
      token: "abc",
    });
    expect(!short.ok && short.problem.errors?.[0]?.field).toBe("token");
    const lazada = await connectAccount({
      kind: "lazada",
      name: "Thử",
      org_id: "01a1e000-0000-7000-8000-000000000a04",
      token: "x".repeat(30),
    });
    expect(!lazada.ok && lazada.problem.code).toBe("channels.connector_unavailable");
    const dup = await connectAccount({
      kind: "shopee",
      name: "bếp mộc official",
      org_id: "01a1e000-0000-7000-8000-000000000a04",
      token: "x".repeat(30),
    });
    expect(!dup.ok && dup.problem.code).toBe("channels.account_exists");
    const ok = await connectAccount({
      kind: "shopee",
      name: "Bếp Mộc Thủ Đức",
      org_id: "01a1e000-0000-7000-8000-000000000a04",
      token: "x".repeat(30),
    });
    expect(ok.ok && JSON.stringify(ok.data)).not.toContain("xxxxxxxx");
  });
});

describe("đơn cần xử lý", () => {
  it("năm việc cần xử lý; gắn dòng thiếu ánh xạ thì nhập thành đơn mới, gửi lại cùng mã không tạo đơn thứ hai", async () => {
    const { data } = await listInbound();
    expect(
      data.filter((r) => ["needs_mapping", "oversold", "conflict", "failed"].includes(r.status)),
    ).toHaveLength(5);
    const kb = data.find((r) => r.status === "needs_mapping" && r.lines.length === 1);
    const out = await mapInbound(kb?.id ?? "", {
      external_sku: kb?.lines[0]?.external_sku ?? "",
      sku: "KB4-BE",
    });
    expect(out.ok && out.data.status).toBe("imported");
    expect(out.ok && out.data.order_number).toMatch(/^BM-2611-04[2-9]\d$/);
    const replay = await importChannelOrder({
      account_id: ACCOUNT_ID.official,
      external_ref: kb?.external_order_id ?? "",
      buyer: "x",
      items: [["KB4-BE", 2]],
      method: "cod",
      placed_at: new Date().toISOString(),
    });
    expect(replay.ok && replay.data.replayed).toBe(true);
  });

  it("đơn nhập lỗi chạy lại bị chặn khi tài khoản cần kết nối lại; kết nối lại thì nhập được", async () => {
    const failed = (await listInbound("failed")).data[0];
    const blocked = await retryInbound(failed?.id ?? "");
    expect(!blocked.ok && blocked.problem.code).toBe("channels.account_paused");
    expect((await reconnectAccount(ACCOUNT_ID.tiktokQ3, "t".repeat(32))).ok).toBe(true);
    const ok = await retryInbound(failed?.id ?? "");
    expect(ok.ok && ok.data.status).toBe("imported");
  });

  it("huỷ đơn bán quá trên kênh chuyển đơn sang huỷ; xung đột cần ghi chú để đóng", async () => {
    const oversold = (await listInbound("oversold")).data[0];
    const out = await resolveInbound(oversold?.id ?? "", "cancel_on_channel", "");
    expect(out.ok && out.data.status).toBe("imported");
    const { orders } = await ordersState();
    expect(orders.find((o) => o.id === oversold?.order_id)?.status).toBe("cancelled");
    const conflict = (await listInbound("conflict")).data[0];
    const noNote = await resolveInbound(conflict?.id ?? "", "close_conflict", "");
    expect(!noNote.ok && noNote.problem.errors?.[0]?.field).toBe("note");
  });
});

describe("đối soát", () => {
  it("bảng kê còn dòng lệch không ghi sổ; xử lý hết thì ghi sổ; tiền kênh thu − đã ghi sổ = phải thu", async () => {
    const pending = (await listSettlements()).data.find((x) => x.status === "mismatch");
    expect(!(await postSettlement(pending?.id ?? "")).ok).toBe(true);
    const lines = (await settlementLines({ settlement_id: pending?.id ?? "", status: "mismatch" }))
      .data;
    expect(lines).toHaveLength(2);
    expect(!(await resolveSettlementLine(lines[0]?.id ?? "", "")).ok).toBe(true);
    for (const l of lines)
      expect((await resolveSettlementLine(l.id, "Đã liên hệ kênh")).ok).toBe(true);
    const before = await settlementSummary();
    const posted = await postSettlement(pending?.id ?? "");
    expect(posted.ok && posted.data.status).toBe("posted");
    const after = await settlementSummary();
    expect(Number(after.receivable.amount)).toBeLessThan(Number(before.receivable.amount));
    expect(Number(after.collected.amount) - Number(after.posted.amount)).toBe(
      Number(after.receivable.amount),
    );
  });
});

describe("bộ lọc đơn từ kênh", () => {
  it("'Cần xử lý' chỉ giữ đơn chờ người xử lý; 'all' giữ cả đơn đã nhập", async () => {
    const { data } = await listInbound();
    const open = data.filter((r) => inboundMatches(r, "open"));
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((r) => INBOUND_OPEN.includes(r.status))).toBe(true);
    expect(data.some((r) => r.status === "imported" && !inboundMatches(r, "open"))).toBe(true);
    expect(data.filter((r) => inboundMatches(r, "all"))).toHaveLength(data.length);
    expect(
      data.filter((r) => inboundMatches(r, "failed")).every((r) => r.status === "failed"),
    ).toBe(true);
  });
});
