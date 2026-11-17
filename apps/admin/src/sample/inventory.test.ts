import { beforeEach, describe, expect, it } from "vitest";
import { ORG, resetSampleCatalog, VARIANT_ID } from "./catalog";
import {
  adjustStock,
  changeCount,
  changeTransfer,
  cleanDay,
  createReceipt,
  createSupplier,
  createTransfer,
  getLevel,
  inDays,
  listCounts,
  listLevels,
  listLots,
  listMovements,
  listPurchaseOrders,
  listTransfers,
  parseLines,
  putCountLines,
  receiveTransfer,
  resetSampleInventory,
  stockStatus,
  verifyLevels,
  weightedAverage,
} from "./inventory";
import { vietnamDay } from "./tax";

beforeEach(() => {
  resetSampleCatalog();
  resetSampleInventory();
});

async function level(sku: keyof typeof VARIANT_ID, org: string) {
  const rows = (await listLevels({ limit: 500 })).data;
  const row = rows.find((r) => r.variant_id === VARIANT_ID[sku] && r.org_id === org);
  if (!row) throw new Error(`thiếu dòng tồn ${sku}`);
  return row;
}

const adjust = (over: Partial<Parameters<typeof adjustStock>[0]> = {}) =>
  adjustStock({
    org_id: ORG.WH,
    code: "TG35",
    quantity: "-2",
    reason_code: "damaged",
    note: "Nứt",
    serials: "",
    reference: "",
    ...over,
  });

describe("tồn kho mẫu (chờ module inventory, bước 42)", () => {
  it("on_hand bằng tổng sổ biến động ở mọi dòng, kể cả sau thao tác", async () => {
    expect(verifyLevels()).toEqual([]);
    await adjust();
    const created = await createTransfer({
      from_org_id: ORG.WH,
      to_org_id: ORG.Q3,
      lines: "CG24 × 3",
      note: "",
    });
    if (created.ok) {
      await changeTransfer(created.data.id, "ship");
      await receiveTransfer(created.data.id, null);
    }
    expect(verifyLevels()).toEqual([]);
  });

  it("trạng thái tồn: hết, dưới mức tối thiểu, cho đặt trước", () => {
    expect(stockStatus({ available: 0, reorder_point: 4, allow_negative: false })).toBe("out");
    expect(stockStatus({ available: 0, reorder_point: 4, allow_negative: true })).toBe(
      "out_backorder",
    );
    expect(stockStatus({ available: 4, reorder_point: 4, allow_negative: false })).toBe("low");
    expect(stockStatus({ available: 5, reorder_point: 4, allow_negative: false })).toBe("ok");
  });

  it("điều chỉnh cần lý do, không làm tồn âm, gọi lại cùng mã không ghi hai lần", async () => {
    const noReason = await adjust({ reason_code: "" });
    expect(!noReason.ok && noReason.problem.errors?.map((e) => e.code)).toContain(
      "inventory.reason_required",
    );
    const tooMany = await adjust({ quantity: "-999" });
    expect(!tooMany.ok && tooMany.problem.code).toBe("inventory.insufficient_stock");
    const before = (await level("TG35", ORG.WH)).on_hand;
    await adjust({ reference: "adj-1" });
    const again = await adjust({ reference: "adj-1" });
    expect(again.ok && again.data.replayed).toBe(true);
    expect((await level("TG35", ORG.WH)).on_hand).toBe(before - 2);
  });

  it("hàng theo serial phải ghi đủ serial có trong kho", async () => {
    const missing = await adjust({ code: "DB3", quantity: "-1" });
    expect(!missing.ok && missing.problem.code).toBe("inventory.serials_required");
    const wrong = await adjust({ code: "DB3", quantity: "-1", serials: "DB3-26-00418" });
    expect(!wrong.ok && wrong.problem.code).toBe("inventory.serial_unavailable");
    const ok = await adjust({ code: "DB3", quantity: "-1", serials: "DB3-26-00420" });
    expect(ok.ok).toBe(true);
  });

  it("chuyển kho: gửi trừ kho nguồn, kho đích thấy đang về; nhận một phần rồi đóng", async () => {
    const created = await createTransfer({
      from_org_id: ORG.WH,
      to_org_id: ORG.Q3,
      lines: "CG24 × 5\nCG28 x 2",
      note: "",
    });
    if (!created.ok) throw new Error("không tạo được phiếu");
    const from = (await level("CG24", ORG.WH)).on_hand;
    await changeTransfer(created.data.id, "ship");
    expect((await level("CG24", ORG.WH)).on_hand).toBe(from - 5);
    expect((await level("CG24", ORG.Q3)).incoming).toBe(5);
    const line = created.data.lines[0]?.id ?? "";
    const over = await receiveTransfer(created.data.id, { [line]: "9" });
    expect(!over.ok && over.problem.code).toBe("inventory.over_receipt");
    const part = await receiveTransfer(created.data.id, { [line]: "3" });
    expect(part.ok && part.data.status).toBe("partially_received");
    const closed = await changeTransfer(created.data.id, "close");
    expect(closed.ok && closed.data.status).toBe("closed");
    expect((await level("CG24", ORG.Q3)).incoming).toBe(0);
    const bad = await changeTransfer(created.data.id, "ship");
    expect(!bad.ok && bad.problem.code).toBe("inventory.invalid_transition");
  });

  it("kiểm kê khi đang bán: lệch tính theo số lúc đếm, cộng vào tồn hiện tại; thiếu lý do thì chưa áp dụng", async () => {
    const count = (await listCounts()).data.find((c) => c.number === "KK-0031");
    if (!count) throw new Error("thiếu KK-0031");
    const refused = await changeCount(count.id, "apply");
    expect(!refused.ok && refused.problem.code).toBe("inventory.reason_required");
    const towels = count.lines.find((l) => l.variant_id === VARIANT_ID["KB4-XA"]);
    await putCountLines(count.id, { [towels?.id ?? ""]: { counted: "23", reason: "lost" } });
    // Bán 1 khăn xen giữa lúc đếm và lúc áp dụng.
    await adjust({ org_id: ORG.CG, code: "KB4-XA", quantity: "-1", reason_code: "sample" });
    const applied = await changeCount(count.id, "apply");
    expect(applied.ok).toBe(true);
    // 25 − 1 (bán xen) − 2 (lệch kiểm kê) = 22, không ghi đè bằng 23.
    expect((await level("KB4-XA", ORG.CG)).on_hand).toBe(22);
  });

  it("phiếu nhập theo đơn: cộng tồn, tính lại giá vốn bình quân, bấm lại không nhập hai lần", async () => {
    const before = await level("CG26", ORG.WH);
    const input = {
      purchase_order_id: "01a1e000-0000-7000-8000-dc0000000087",
      supplier_id: "",
      org_id: "",
      reference: "GDPA-1",
      lines: "CG26 × 15",
      lot: "",
    };
    const first = await createReceipt(input);
    const again = await createReceipt(input);
    expect(first.ok && first.data.replayed).toBe(false);
    expect(again.ok && again.data.replayed).toBe(true);
    const after = await level("CG26", ORG.WH);
    expect(after.on_hand).toBe(before.on_hand + 15);
    expect(after.average_cost.amount).toBe(String(weightedAverage(5, 410_000, 15, 405_000)));
    const over = await createReceipt({ ...input, reference: "GDPA-2", lines: "CG26 × 100" });
    expect(!over.ok && over.problem.code).toBe("inventory.over_receipt");
  });

  it("giá vốn bình quân gia quyền làm tròn nửa lên; tồn ≤ 0 thì lấy giá nhập", () => {
    expect(weightedAverage(5, 410_000, 15, 405_000)).toBe(406_250);
    expect(weightedAverage(3, 100, 0, 0)).toBe(100);
    expect(weightedAverage(1, 1, 2, 2)).toBe(2);
    expect(weightedAverage(0, 999, 10, 50)).toBe(50);
  });

  it("dòng hàng viết “SKU × số lượng”, báo dòng sai", () => {
    expect(parseLines("CG26 × 10\nTG35 x 2\nlỗi\n\nNI20 5").bad).toEqual([3]);
    expect(parseLines("TG35 × 60 × 140000", true).lines[0]).toMatchObject({
      code: "TG35",
      quantity: 60,
      cost: 140_000,
    });
  });

  it("mã nhà cung cấp duy nhất; chi tiết dòng tồn kèm chỗ giữ và lô", async () => {
    const dup = await createSupplier({
      code: "ncc-ttsm",
      name: "X",
      tax_code: "",
      payment_terms_days: "30",
      note: "",
    });
    expect(!dup.ok && dup.problem.code).toBe("inventory.supplier_code_taken");
    const soap = await level("NRC750", ORG.WH);
    const detail = await getLevel(soap.id);
    expect(detail?.data.lots.map((l) => l.lot_code).sort()).toEqual(["NRC-2609", "NRC-2611"]);
    expect(detail?.data.reservations.reduce((n, r) => n + r.quantity, 0)).toBe(soap.reserved);
    expect((await listTransfers({ status: "in_transit" })).data.map((t) => t.number)).toEqual([
      "CK-0219",
    ]);
  });
});

describe("bộ công cụ bảng của Tồn kho (W-058)", () => {
  const collate = (a: string, b: string) =>
    a.localeCompare(b, "vi", { sensitivity: "base", numeric: true });

  it("ngày lọc: chỉ nhận YYYY-MM-DD có thật", () => {
    expect(cleanDay("2026-11-17")).toBe("2026-11-17");
    expect(cleanDay("2026-02-30")).toBe("");
    expect(cleanDay("17/11/2026")).toBe("");
    expect(cleanDay("")).toBe("");
  });

  it("khoảng ngày tính theo giờ Việt Nam, cả hai đầu", () => {
    // 17:30 UTC ngày 16 là 00:30 ngày 17 ở Việt Nam.
    expect(inDays("2026-11-16T17:30:00Z", "2026-11-17", "2026-11-17")).toBe(true);
    expect(inDays("2026-11-16T16:30:00Z", "2026-11-17", "")).toBe(false);
    expect(inDays("2026-11-16T16:30:00Z", "", "2026-11-16")).toBe(true);
    expect(inDays("2026-01-01T00:00:00Z", "", "")).toBe(true);
  });

  it("sổ biến động: lọc khoảng ngày, sắp theo thời gian hai chiều", async () => {
    const all = (await listMovements({ limit: 10_000 })).data;
    const times = all.map((m) => m.created_at);
    expect(times).toEqual([...times].sort().reverse());
    const asc = (await listMovements({ limit: 10_000, dir: "asc" })).data.map((m) => m.created_at);
    expect(asc).toEqual([...times].reverse());
    const day = vietnamDay(Date.parse(all[0]?.created_at ?? ""));
    const one = (await listMovements({ limit: 10_000, from: day, to: day })).data;
    expect(one.length).toBeGreaterThan(0);
    expect(one.length).toBeLessThanOrEqual(all.length);
    expect(one.every((m) => vietnamDay(Date.parse(m.created_at)) === day)).toBe(true);
    expect((await listMovements({ from: "2000-01-01", to: "2000-01-02" })).data).toEqual([]);
  });

  it("sắp theo cột: tồn, chuyển kho, kiểm kê, lô, đơn đặt mua", async () => {
    const levels = (
      await listLevels({ limit: 10_000, sort: { field: "available", dir: "desc" } })
    ).data.map((l) => l.available);
    expect(levels).toEqual([...levels].sort((a, b) => b - a));
    const names = (
      await listLevels({ limit: 10_000, sort: { field: "warehouse", dir: "asc" } })
    ).data.map((l) => l.org_name);
    expect(names).toEqual([...names].sort(collate));
    const transfers = (await listTransfers({ sort: { field: "number", dir: "asc" } })).data.map(
      (t) => t.number,
    );
    expect(transfers).toEqual([...transfers].sort(collate));
    const counts = (await listCounts({ field: "number", dir: "desc" })).data.map((c) => c.number);
    expect(counts).toEqual([...counts].sort(collate).reverse());
    const lots = (await listLots("vi", { field: "left", dir: "asc" })).data.map((l) => l.on_hand);
    expect(lots).toEqual([...lots].sort((a, b) => a - b));
    const orders = (await listPurchaseOrders({ field: "total", dir: "desc" })).data.map((p) =>
      Number(p.total.amount),
    );
    expect(orders).toEqual([...orders].sort((a, b) => b - a));
  });
});
