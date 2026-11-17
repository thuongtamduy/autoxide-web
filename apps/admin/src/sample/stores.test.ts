import { beforeEach, describe, expect, it } from "vitest";
import { ORG, resetSampleCatalog } from "./catalog";
import { resetSampleInventory } from "./inventory";
import { resetSampleOrders } from "./orders";
import { resetSamplePromotions } from "./promotions";
import {
  average,
  closeShift,
  createPosSale,
  listReviews,
  listShifts,
  moderateReview,
  openShift,
  openShiftAt,
  posCatalog,
  resetSampleStores,
  shiftLagging,
  shiftMatches,
} from "./stores";

beforeEach(() => {
  resetSampleCatalog();
  resetSampleInventory();
  resetSamplePromotions();
  resetSampleOrders();
  resetSampleStores();
});

describe("ca thu ngân và bán tại quầy", () => {
  it("ca đã đóng của CN Thủ Đức có đơn BM-2611-0416 lệch −20.000 ₫, có lý do", async () => {
    const { data } = await listShifts();
    const td = data.find((x) => x.cash_order_numbers.includes("BM-2611-0416"));
    expect(td?.status).toBe("closed");
    expect(td?.expected_cash.amount).toBe("3900000");
    expect(td?.difference?.amount).toBe("-20000");
    expect(td?.difference_reason).toBeTruthy();
    expect(data.filter((x) => x.status === "open")).toHaveLength(3);
  });

  it("bán tiền mặt cộng vào ca đang mở và trừ tồn; vượt tồn bị chặn; gửi lại cùng mã không tạo đơn mới", async () => {
    const before = (await posCatalog(ORG.Q3)).data.find((i) => i.sku === "BG6");
    expect(before?.available).toBeGreaterThan(0);
    const sale = await createPosSale({
      org_id: ORG.Q3,
      lines: "BG6 x 1",
      method: "cash",
      reference: "ref-1",
    });
    expect(sale.ok && sale.data.order.status).toBe("delivered");
    expect(sale.ok && sale.data.order.invoice?.kind).toBe("cash_register");
    const again = await createPosSale({
      org_id: ORG.Q3,
      lines: "BG6 x 1",
      method: "cash",
      reference: "ref-1",
    });
    expect(again.ok && again.data.replayed).toBe(true);
    const after = (await posCatalog(ORG.Q3)).data.find((i) => i.sku === "BG6");
    expect(after?.available).toBe((before?.available ?? 0) - 1);
    const shift = await openShiftAt(ORG.Q3);
    expect(shift?.expected_cash.amount).toBe(String(2_000_000 + 420_000));
    const tooMany = await createPosSale({
      org_id: ORG.Q3,
      lines: "BG6 x 999",
      method: "cash",
      reference: "ref-2",
    });
    expect(!tooMany.ok && tooMany.problem.code).toBe("orders.out_of_stock");
  });

  it("quầy: danh mục có mã vạch, nhóm hàng; tạo đơn nhận mã giảm giá và tên khách", async () => {
    const pan = (await posCatalog(ORG.Q3)).data.find((i) => i.sku === "CG26");
    expect(pan?.category?.name).toBeTruthy();
    const sale = await createPosSale({
      org_id: ORG.Q3,
      lines: "CG26 x 1",
      method: "card_terminal",
      reference: "ref-code",
      codes: ["BEPMOC10"],
      buyer: "Nguyễn Thu Hà",
    });
    if (!sale.ok) throw new Error("bán hỏng");
    expect(sale.data.order.buyer.name).toBe("Nguyễn Thu Hà");
    expect(Number(sale.data.order.total.amount)).toBeLessThan(690_000);
    const walkIn = await createPosSale({
      org_id: ORG.Q3,
      lines: "CG26 x 1",
      method: "cash",
      reference: "ref-walk",
    });
    expect(walkIn.ok && walkIn.data.order.buyer.name).toBe("Khách tại quầy");
  });

  it("đóng ca lệch phải ghi lý do; bán khi chưa mở ca bị chặn; một quầy một ca mở", async () => {
    const shift = await openShiftAt(ORG.CG);
    if (!shift) throw new Error("thiếu ca");
    const noReason = await closeShift(shift.id, { counted: "1000000", reason: "" });
    expect(!noReason.ok && noReason.problem.errors?.[0]?.code).toBe(
      "orders.shift_difference_reason_required",
    );
    expect((await closeShift(shift.id, { counted: "1500000", reason: "" })).ok).toBe(true);
    const blocked = await createPosSale({
      org_id: ORG.CG,
      lines: "KB4-XA",
      method: "cash",
      reference: "x",
    });
    expect(!blocked.ok && blocked.problem.code).toBe("orders.shift_not_open");
    expect((await openShift({ org_id: ORG.CG, register: "Quầy 1", opening: "1500000" })).ok).toBe(
      true,
    );
    const twice = await openShift({ org_id: ORG.CG, register: "quầy 1", opening: "0" });
    expect(!twice.ok && twice.problem.code).toBe("orders.shift_already_open");
  });
});

describe("đánh giá", () => {
  it("chỉ ẩn với lý do trong danh sách; mở lại được", async () => {
    const low = (await listReviews("low")).data.find((r) => r.status === "published");
    if (!low) throw new Error("thiếu đánh giá");
    const bad = await moderateReview(low.id, { action: "hide", reason: "negative", note: "chê" });
    expect(!bad.ok && bad.problem.errors?.[0]?.code).toBe("orders.moderation_reason_invalid");
    expect(
      (
        await moderateReview(low.id, {
          action: "hide",
          reason: "contact_info",
          note: "có số điện thoại",
        })
      ).ok,
    ).toBe(true);
    const back = await moderateReview(low.id, { action: "publish" });
    expect(back.ok && back.data.status).toBe("published");
  });

  it("điểm trung bình một chữ số lẻ", () => {
    expect(average([5, 7, 10, 27, 79])).toEqual({ total: 128, mean: 4.3 });
    expect(average([0, 0, 0, 0, 0])).toEqual({ total: 0, mean: 0 });
  });
});

describe("bảng ca: bộ lọc mặc định và sắp", () => {
  it("mặc định giữ ca đang mở và ca lệch; 'all' giữ mọi ca", async () => {
    const { data } = await listShifts();
    const attention = data.filter((x) => shiftMatches(x, "attention"));
    expect(attention.length).toBeGreaterThan(0);
    for (const x of attention) expect(x.status === "open" || shiftLagging(x)).toBe(true);
    for (const x of data.filter((y) => !shiftMatches(y, "attention"))) {
      expect(x.status === "closed" && !shiftLagging(x)).toBe(true);
    }
    expect(data.filter((x) => shiftMatches(x, "all"))).toHaveLength(data.length);
    const even = { status: "closed" as const, difference: { amount: "0", currency: "VND" } };
    expect(shiftMatches(even, "diff")).toBe(false);
    expect(shiftMatches(even, "closed")).toBe(true);
  });

  it("sắp theo số lệch: ca chưa có số lệch luôn ở cuối; sắp theo giờ mở ca", async () => {
    const { data } = await listShifts({ field: "difference", dir: "asc" });
    const values = data.map((x) => (x.difference ? Number(x.difference.amount) : null));
    const known = values.filter((v): v is number => v !== null);
    expect(known).toEqual([...known].sort((a, b) => a - b));
    const firstNull = values.indexOf(null);
    if (firstNull >= 0) expect(values.slice(firstNull).every((v) => v === null)).toBe(true);
    const opened = (await listShifts({ field: "opened", dir: "desc" })).data.map((x) =>
      Date.parse(x.opened_at),
    );
    expect(opened).toEqual([...opened].sort((a, b) => b - a));
  });
});
