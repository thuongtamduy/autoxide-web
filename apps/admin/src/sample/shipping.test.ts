import { beforeEach, describe, expect, it } from "vitest";
import {
  addWorkdays,
  chargeableWeight,
  type DeliveryCalendar,
  etaFor,
  formatWeight,
  maskPhone,
  parseStatement,
} from "@/lib/shipping";
import { ORG, resetSampleCatalog } from "./catalog";
import { ORDER_REFS, orderByNumber } from "./order-refs";
import {
  addHoliday,
  CARRIER_ID,
  changeShipment,
  createMethod,
  createShipment,
  getCalendar,
  importStatement,
  listDiscrepancies,
  listShipments,
  listStatements,
  METHOD_ID,
  quote,
  type Rate,
  rateFor,
  replaceCarrierKey,
  resetSampleShipping,
  resolveDiscrepancy,
  saveCalendar,
  setMethodActive,
  splitParcels,
  testCarrierAccount,
  trackShipment,
  zoneFor,
} from "./shipping";

beforeEach(() => {
  resetSampleCatalog();
  resetSampleShipping();
});

const MON_SAT: DeliveryCalendar = { cutoff: "16:00", workdays: [1, 2, 3, 4, 5, 6], holidays: [] };
/** 2026-11-13 (thứ Sáu) lúc `hh:mm` giờ Việt Nam. */
const friday = (hh: number, mm: number) =>
  Date.parse(`2026-11-13T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+07:00`);

async function shipment(order: string) {
  const { data } = await listShipments({ q: order, limit: 100 });
  const row = data[0];
  if (!row) throw new Error(`thiếu vận đơn ${order}`);
  return row;
}

describe("hàm thuần của vận chuyển", () => {
  it("cân tính phí là số lớn hơn giữa cân thật và cân quy đổi", () => {
    expect(
      chargeableWeight([{ weight_grams: 1900, length_mm: 320, width_mm: 280, height_mm: 180 }]),
    ).toEqual({ actual: 1900, volumetric: 2688, chargeable: 2688 });
    expect(
      chargeableWeight([{ weight_grams: 900, length_mm: null, width_mm: null, height_mm: null }])
        .chargeable,
    ).toBe(900);
    expect(formatWeight(1900, "vi")).toBe("1,9 kg");
    expect(maskPhone("0900 000 123")).toBe("••• ••• 123");
  });

  it("ngày giao dự kiến: trước giờ chốt lấy hôm nay, sau giờ chốt lấy ngày làm việc kế; bỏ Chủ nhật", () => {
    expect(etaFor(friday(15, 40), MON_SAT, 1, 2)).toMatchObject({
      pickup_date: "2026-11-13",
      eta_from: "2026-11-14",
      eta_to: "2026-11-16",
    });
    const late = etaFor(friday(16, 20), MON_SAT, 1, 2);
    expect(late).toMatchObject({
      pickup_date: "2026-11-14",
      eta_from: "2026-11-16",
      eta_to: "2026-11-17",
      order_by: null,
    });
    // Ngày nghỉ không tính.
    const holiday = { ...MON_SAT, holidays: [{ from: "2026-11-16", to: "2026-11-16" }] };
    expect(addWorkdays("2026-11-14", 1, holiday)).toBe("2026-11-17");
  });

  it("đọc bảng kê COD: thiếu cột, dòng sai ghi số dòng", () => {
    expect(parseStatement("tracking_number,cod\nA,1").missing).toEqual(["cod_amount", "fee"]);
    const out = parseStatement("tracking_number,cod_amount,fee\nGN-1,129.000,34000\nGN-2,abc,1");
    expect(out.rows).toEqual([{ tracking_number: "GN-1", cod: 129000, fee: 34000 }]);
    expect(out.bad).toEqual([3]);
  });

  it("bậc phí: vùng theo tỉnh thắng cả nước, cộng bước vượt", () => {
    const zones = [
      { id: "hcm", org_id: "r", name: "HCM", province_codes: ["79"] },
      { id: "all", org_id: "r", name: "All", province_codes: null },
    ];
    expect(zoneFor(zones, "79")?.id).toBe("hcm");
    expect(zoneFor(zones, "48")?.id).toBe("all");
    const money = (n: number) => ({ amount: String(n), currency: "VND" });
    const rates: Rate[] = [
      {
        id: "a",
        method_id: "m",
        zone_id: "hcm",
        min_weight_grams: 0,
        max_weight_grams: 2000,
        max_side_mm: null,
        amount: money(30000),
        step_grams: null,
        step_amount: null,
      },
      {
        id: "b",
        method_id: "m",
        zone_id: "hcm",
        min_weight_grams: 2000,
        max_weight_grams: null,
        max_side_mm: null,
        amount: money(30000),
        step_grams: 500,
        step_amount: money(5000),
      },
    ];
    expect(rateFor(rates, "hcm", 1999)?.amount).toBe(30000);
    expect(rateFor(rates, "hcm", 2000)?.amount).toBe(30000);
    expect(rateFor(rates, "hcm", 2600)?.amount).toBe(40000);
  });
});

describe("vận đơn (bước 44)", () => {
  it("đơn mẫu dùng chung: mọi vận đơn trỏ tới mã đơn có trong order-refs", async () => {
    const { data } = await listShipments({ limit: 100 });
    for (const x of data) expect(orderByNumber(x.order_number)?.id).toBe(x.order_id);
    expect(ORDER_REFS.every((o) => /^BM-2611-0\d{3}$/.test(o.number))).toBe(true);
  });

  it("đặt hãng cấp mã vận đơn; huỷ sau khi hãng đã lấy hàng bị từ chối", async () => {
    const pending = await shipment("BM-2611-0415");
    const booked = await changeShipment(pending.id, "book");
    expect(booked.ok && booked.data.status).toBe("ready_to_ship");
    expect(booked.ok && booked.data.parcels[0]?.tracking_number).toMatch(/^HH-55 /);
    const moving = await shipment("BM-2611-0414");
    const cancel = await changeShipment(moving.id, "cancel");
    if (cancel.ok) throw new Error("phải lỗi");
    expect(cancel.problem.code).toBe("shipping.cancel_too_late");
  });

  it("giao thất bại → hoàn hàng → nhận hàng hoàn; chuyển sai thì báo", async () => {
    const failed = await shipment("BM-2611-0407");
    expect((await changeShipment(failed.id, "return")).ok).toBe(true);
    const wrong = await changeShipment(failed.id, "redeliver");
    if (wrong.ok) throw new Error("phải lỗi");
    expect(wrong.problem.code).toBe("shipping.invalid_transition");
    const back = await changeShipment(failed.id, "receive_return");
    expect(back.ok && back.data.status).toBe("returned");
  });

  it("tách kiện chỉ khi chưa đặt hãng; cân sai báo dưới ô", async () => {
    const pending = await shipment("BM-2611-0415");
    const bad = await splitParcels(pending.id, "1200, 0, abc");
    if (bad.ok) throw new Error("phải lỗi");
    expect(bad.problem.errors?.[0]).toMatchObject({ field: "weights", detail: "0, abc" });
    const ok = await splitParcels(pending.id, "1200, 700");
    expect(ok.ok && ok.data.parcels.map((p) => p.weight_grams)).toEqual([1200, 700]);
  });

  it("vận đơn tay: gom mọi lỗi; đơn đã có vận đơn thì thành lần giao thứ hai", async () => {
    const bad = await createShipment({
      order_number: "0420",
      origin_org_id: ORG.Q3,
      method_id: METHOD_ID.standard,
      recipient_name: "",
      recipient_phone: "12345",
      province_code: "79",
      address_line: "",
      cod: "3k",
      weight_grams: "",
    });
    if (bad.ok) throw new Error("phải lỗi");
    expect((bad.problem.errors ?? []).map((e) => `${e.field}:${e.code}`)).toEqual([
      "order_number:shipping.order_number_format",
      "recipient_name:required",
      "recipient_phone:phone",
      "address_line:required",
      "cod:money_minor",
      "weight_grams:required",
    ]);
    const ok = await createShipment({
      order_number: "bm-2611-0415",
      origin_org_id: ORG.CG,
      method_id: METHOD_ID.standard,
      recipient_name: "Người nhận (mẫu)",
      recipient_phone: "0900 000 000",
      province_code: "01",
      address_line: "Phường Ba Đình, 1 đường Mẫu",
      cod: "0",
      weight_grams: "800",
    });
    expect(ok.ok && ok.data.request_key).toBe("part-2");
    expect(ok.ok && ok.data.eta_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("phí vận chuyển và lịch giao", () => {
  it("báo giá: kế thừa, miễn phí từ giá trị đơn, hãng lỗi vào 'không khả dụng'", async () => {
    const out = await quote({
      org_id: ORG.Q3,
      province_code: "79",
      weight_grams: "1400",
      order_value: "690000",
    });
    if (!out.ok) throw new Error("báo giá hỏng");
    const codes = out.data.options.map((o) => [o.method_code, o.amount.amount]);
    expect(codes).toEqual([
      ["pickup", "0"],
      ["standard", "30000"],
      ["same_day", "30000"],
    ]);
    expect(
      out.data.options.find((o) => o.method_code === "standard")?.free_shipping_missing?.amount,
    ).toBe("310000");
    expect(out.data.unavailable).toEqual([
      {
        method_code: "economy",
        name: "Giao tiết kiệm",
        reason_code: "shipping.carrier_unavailable",
      },
    ]);
    // CN Cầu Giấy ghi đè `standard`: Hà Nội 35.000 ₫ thay vì 40.000 ₫.
    const hn = await quote({
      org_id: ORG.CG,
      province_code: "01",
      weight_grams: "1000",
      order_value: "1",
    });
    expect(hn.ok && hn.data.options.find((o) => o.method_code === "standard")?.amount.amount).toBe(
      "35000",
    );
    const free = await quote({
      org_id: ORG.Q3,
      province_code: "48",
      weight_grams: "1000",
      order_value: "1000000",
    });
    expect(
      free.ok && free.data.options.find((o) => o.method_code === "standard")?.free_shipping_applied,
    ).toBe(true);
  });

  it("tắt phương thức thì không báo giá; mã trùng ở cùng nút bị từ chối", async () => {
    await setMethodActive(METHOD_ID.sameDay, false);
    const out = await quote({
      org_id: ORG.Q3,
      province_code: "79",
      weight_grams: "100",
      order_value: "1",
    });
    expect(out.ok && out.data.options.some((o) => o.method_code === "same_day")).toBe(false);
    const taken = await createMethod({
      name: "Tiêu chuẩn 2",
      code: "standard",
      kind: "table_rate",
      org_id: ORG.ROOT,
      free_over: "",
      days: "3-1",
      carrier_account_id: "",
    });
    if (taken.ok) throw new Error("phải lỗi");
    expect((taken.problem.errors ?? []).map((e) => e.code)).toEqual([
      "shipping.method_code_taken",
      "shipping.days_range",
    ]);
  });

  it("lịch là dữ liệu có ngày hiệu lực: chỉ thêm phiên bản áp từ ngày mai trở đi", async () => {
    const past = await saveCalendar({
      cutoff: "25:00",
      workdays: "x",
      effective_from: "2020-01-01",
    });
    if (past.ok) throw new Error("phải lỗi");
    expect((past.problem.errors ?? []).map((e) => `${e.field}:${e.code}`)).toEqual([
      "cutoff:time",
      "workdays:unknown",
      "effective_from:future_day",
    ]);
    expect(
      (await saveCalendar({ cutoff: "15:30", workdays: "all", effective_from: "2099-01-01" })).ok,
    ).toBe(true);
    const { data } = await getCalendar();
    expect(data.versions.map((v) => v.effective_from)).toEqual(["2099-01-01", "2026-01-01"]);
    expect(data.current?.cutoff).toBe("16:00");
  });

  it("nhập ngày nghỉ Tết thay dòng 'chờ thông báo'; tới ngày trước từ ngày thì báo", async () => {
    const bad = await addHoliday({ from: "2027-02-10", to: "2027-02-01", name: "", org_id: "" });
    if (bad.ok) throw new Error("phải lỗi");
    expect((bad.problem.errors ?? []).map((e) => `${e.field}:${e.code}`)).toEqual([
      "to:shipping.range_order",
      "name:required",
    ]);
    await addHoliday({
      from: "2027-02-05",
      to: "2027-02-11",
      name: "Tết Nguyên đán 2027",
      org_id: "",
    });
    const { data } = await getCalendar();
    expect(data.holidays.filter((h) => h.status === "awaiting_notice")).toEqual([]);
  });
});

describe("đối soát COD và hãng", () => {
  it("hỏi lại hành trình: hãng xác nhận đã giao thì dòng lệch tự khớp, bảng kê thành 'đã khớp'", async () => {
    const open = await listDiscrepancies({ status: "open" });
    expect(open.data).toHaveLength(2);
    for (const order of ["BM-2611-0362", "BM-2611-0367"]) {
      const x = await shipment(order);
      const out = await trackShipment(x.id);
      expect(out.ok && out.data.changed).toBe(true);
    }
    expect((await listDiscrepancies({ status: "open" })).data).toEqual([]);
    const { data } = await listStatements();
    expect(data.find((x) => x.statement_reference === "GNSG-2026-W45")?.status).toBe("reconciled");
  });

  it("đóng dòng lệch cần lý do; không đóng lại lần hai", async () => {
    const [first] = (await listDiscrepancies({ status: "open" })).data;
    if (!first) throw new Error("thiếu dòng lệch");
    expect((await resolveDiscrepancy(first.id, "ok")).ok).toBe(false);
    expect((await resolveDiscrepancy(first.id, "Hãng xác nhận bằng email")).ok).toBe(true);
    const again = await resolveDiscrepancy(first.id, "Lần hai nữa");
    expect(!again.ok && again.problem.code).toBe("shipping.discrepancy_resolved");
  });

  it("nhập bảng kê: khớp, lệch tiền, mã lạ; nhập lại cùng nội dung không nhân đôi", async () => {
    const csv =
      "tracking_number,cod_amount,fee\nGN-8813 0102,1059000,40000\nGN-0000 0000,10000,1000";
    const first = await importStatement({
      carrier_account_id: CARRIER_ID.gnsg,
      reference: "gnsg-2026-w46",
      csv,
    });
    if (!first.ok) throw new Error("nhập hỏng");
    expect(first.data.statement.lines.map((l) => l.match)).toEqual(["matched", "unknown_tracking"]);
    expect(first.data.statement.status).toBe("has_mismatch");
    const replay = await importStatement({
      carrier_account_id: CARRIER_ID.gnsg,
      reference: "GNSG-2026-W46",
      csv,
    });
    expect(replay.ok && replay.data.replayed).toBe(true);
    const changed = await importStatement({
      carrier_account_id: CARRIER_ID.gnsg,
      reference: "GNSG-2026-W46",
      csv: "tracking_number,cod_amount,fee\nGN-8813 0102,1,1",
    });
    expect(!changed.ok && changed.problem.errors?.[0]?.code).toBe("shipping.statement_duplicate");
  });

  it("hãng lỗi khoá: kiểm báo lỗi; thay khoá thì kết nối lại, khoá không được lưu", async () => {
    const bad = await testCarrierAccount(CARRIER_ID.vtbm);
    expect(!bad.ok && bad.problem.code).toBe("shipping.carrier_error");
    const short = await replaceCarrierKey(CARRIER_ID.vtbm, "abc");
    expect(!short.ok && short.problem.errors?.[0]?.code).toBe("shipping.key_too_short");
    const ok = await replaceCarrierKey(CARRIER_ID.vtbm, "k".repeat(32));
    expect(ok.ok && ok.data.check_status).toBe("ok");
    expect(JSON.stringify(ok)).not.toContain("kkkk");
  });
});
