import { describe, expect, it } from "vitest";
import {
  buildQuote,
  type CheckoutForm,
  checkCode,
  EMPTY_FORM,
  type QuoteInput,
  STORE_PICKUP,
  validateCheckout,
  validateDelivery,
  validatePayment,
  vatIncluded,
  vatPercentOn,
} from "./checkout";
import { addWorkdays, deliveryWindow, standardFee, zoneOf } from "./shipping";

// Thứ Sáu 13/11/2026, 10:00 giờ Việt Nam (03:00 UTC): trước giờ chốt 16:00.
const NOW = new Date("2026-11-13T03:00:00Z");

const input = (over: Partial<QuoteInput> = {}): QuoteInput => ({
  lines: [
    { sku: "CG26", quantity: 1 },
    { sku: "TG35", quantity: 1 },
    { sku: "GS-DIA26", quantity: 2 },
  ],
  code: null,
  store: "q3",
  delivery: "ship",
  province: null,
  points: 0,
  balance: null,
  now: NOW,
  ...over,
});

const filled: CheckoutForm = {
  ...EMPTY_FORM,
  name: "Nguyễn Văn A",
  phone: "0912 345 678",
  province: "79",
  ward: "26743",
  street: "[Số nhà mẫu]",
  payment: "vietqr",
  terms: true,
};

describe("báo giá giỏ hàng (mẫu)", () => {
  it("chia dòng theo nơi bán: Bếp Mộc trước, mỗi người bán một nhóm, phí riêng", () => {
    const quote = buildQuote(input({ province: "79" }));
    expect(quote.groups.map((g) => g.seller)).toEqual([null, "gom-su-bat-trang-xua"]);
    const [own, seller] = quote.groups;
    expect(own?.goods).toBe(950_000);
    // CG26 3,1 kg + TG35 1,8 kg = 4,9 kg tới TP.HCM: 30.000 + 6 bước 500 g × 5.000.
    expect(own?.shipping).toBe(60_000);
    expect(seller?.goods).toBe(360_000);
    expect(seller?.shipping).toBe(30_000);
    expect(quote.subtotal).toBe(1_310_000);
    expect(quote.total).toBe(1_310_000 + 60_000 + 30_000);
    expect(quote.shipping_known).toBe(true);
  });

  it("chưa chọn tỉnh: phí của Bếp Mộc chưa biết, tổng chỉ cộng phí đã biết", () => {
    const quote = buildQuote(input());
    expect(quote.groups[0]?.shipping).toBeNull();
    expect(quote.shipping_known).toBe(false);
    expect(quote.total).toBe(1_310_000 + 30_000);
  });

  it("mã BEPMOC10: −10% chảo gang 26/28 cm; mã lạ, giỏ không có chảo thì không giảm", () => {
    expect(checkCode("bepmoc10", input().lines)).toBe("applied");
    expect(checkCode("KHONGCO", input().lines)).toBe("unknown");
    expect(checkCode("BEPMOC10", [{ sku: "TG35", quantity: 1 }])).toBe("not_eligible");
    const quote = buildQuote(input({ code: "BEPMOC10" }));
    expect(quote.discount).toBe(69_000);
    expect(quote.code).toEqual({ code: "BEPMOC10", status: "applied" });
    const none = buildQuote(input({ code: "BEPMOC10", lines: [{ sku: "TG35", quantity: 1 }] }));
    expect(none.discount).toBe(0);
    expect(none.code?.status).toBe("not_eligible");
  });

  it("miễn phí giao từ 1.000.000 ₫ hàng Bếp Mộc (sau giảm); còn thiếu bao nhiêu", () => {
    const below = buildQuote(input({ province: "01" }));
    expect(below.groups[0]?.free_remaining).toBe(50_000);
    const above = buildQuote(
      input({
        province: "01",
        lines: [
          { sku: "CG26", quantity: 1 },
          { sku: "DB3", quantity: 1 },
        ],
      }),
    );
    expect(above.groups[0]?.shipping).toBe(0);
    expect(above.groups[0]?.shipping_kind).toBe("free");
  });

  it("nhận tại cửa hàng: không phí, không ngày giao; hàng người bán vẫn giao", () => {
    const quote = buildQuote(input({ delivery: "pickup", province: "01" }));
    expect(quote.groups[0]).toMatchObject({ shipping: 0, shipping_kind: "pickup", eta: null });
    expect(quote.groups[1]?.shipping).toBe(30_000);
    expect(STORE_PICKUP).toEqual(["q3", "td"]);
  });

  it("phí theo vùng và cân như bảng của trang quản trị; CN Cầu Giấy có phí Hà Nội riêng", () => {
    expect(zoneOf("79")).toBe("hcm");
    expect(zoneOf("92")).toBe("south");
    expect(zoneOf("56")).toBe("nation");
    expect(standardFee("01", 1500, "q3")).toBe(40_000);
    expect(standardFee("01", 1500, "cg")).toBe(35_000);
    expect(standardFee("75", 2000, "q3")).toBe(35_000);
    expect(standardFee("56", 2600, "q3")).toBe(60_000 + 2 * 8_000);
    expect(standardFee("56", 25_000, "q3")).toBeNull();
  });

  it("điểm: chỉ khi đăng nhập, từ 100 điểm, tối đa 30% đơn Bếp Mộc", () => {
    const guest = buildQuote(input({ province: "79", points: 500 }));
    expect(guest.points_cap).toBe(0);
    expect(guest.points_used).toBe(0);
    // (950.000 + 60.000) × 30% / 100 = 3.030 điểm, nhưng chỉ còn 1.240.
    const member = buildQuote(input({ province: "79", points: 1_000, balance: 1_240 }));
    expect(member.points_cap).toBe(1_240);
    expect(member.points_value).toBe(100_000);
    expect(member.total).toBe(1_400_000 - 100_000);
    const small = buildQuote(
      input({ province: "79", lines: [{ sku: "MT200", quantity: 1 }], balance: 1_240, points: 50 }),
    );
    // (45.000 + 30.000 phí) × 30% / 100 = 225 điểm; dùng 50 điểm thì dưới mức tối thiểu.
    expect(small.points_cap).toBe(225);
    expect(small.points_used).toBe(0);
  });

  it("COD chỉ khi mọi nơi bán nhận COD", () => {
    expect(buildQuote(input()).cod_available).toBe(false);
    expect(buildQuote(input({ lines: [{ sku: "CG26", quantity: 1 }] })).cod_available).toBe(true);
    expect(buildQuote(input({ lines: [{ sku: "KB-TRE5", quantity: 1 }] })).cod_available).toBe(
      true,
    );
  });

  it("hàng người bán đang tạm khoá không vào báo giá", () => {
    const quote = buildQuote(input({ lines: [{ sku: "NA-CCD28", quantity: 1 }] }));
    expect(quote.groups).toEqual([]);
  });

  it("thuế GTGT theo ngày hiệu lực, phần thuế trong giá đã gồm thuế", () => {
    expect(vatPercentOn("2026-12-31")).toBe(8);
    expect(vatPercentOn("2027-01-01")).toBe(10);
    expect(vatIncluded(108_000, 8)).toBe(8_000);
    expect(buildQuote(input()).vat).toBe(
      vatIncluded(690_000, 8) + vatIncluded(260_000, 8) + vatIncluded(360_000, 8),
    );
  });
});

describe("ngày giao dự kiến", () => {
  it("bỏ Chủ nhật; qua 16:00 thì tính từ hôm sau", () => {
    expect(addWorkdays("2026-11-13", 1)).toBe("2026-11-14");
    expect(addWorkdays("2026-11-14", 1)).toBe("2026-11-16");
    expect(deliveryWindow(NOW, [1, 3])).toEqual(["2026-11-14", "2026-11-17"]);
    // 17:00 thứ Bảy giờ Việt Nam: tính từ Chủ nhật.
    expect(deliveryWindow(new Date("2026-11-14T10:00:00Z"), [1, 2])).toEqual([
      "2026-11-16",
      "2026-11-17",
    ]);
  });
});

describe("kiểm form đặt hàng (gom mọi lỗi một lần)", () => {
  it("form trống: báo mọi ô thiếu của cả hai bước, mỗi ô một lỗi", () => {
    const quote = buildQuote(input());
    const errors = validateCheckout(EMPTY_FORM, quote, null);
    expect(errors.map((e) => e.code)).toEqual([
      "name_required",
      "phone_invalid",
      "province_required",
      "ward_required",
      "street_required",
      "payment_required",
      "terms_required",
    ]);
  });

  it("form đủ thì không lỗi; số điện thoại có khoảng trắng vẫn nhận", () => {
    expect(validateCheckout(filled, buildQuote(input({ province: "79" })), null)).toEqual([]);
  });

  it("nhận tại cửa hàng không cần địa chỉ khi giỏ chỉ có hàng Bếp Mộc", () => {
    const lines = [{ sku: "CG26", quantity: 1 }];
    const form = {
      ...filled,
      delivery: "pickup" as const,
      pickup_store: "q3",
      province: "",
      ward: "",
      street: "",
    };
    expect(validateDelivery(form, buildQuote(input({ lines, delivery: "pickup" })))).toEqual([]);
    expect(
      validateDelivery(
        { ...form, pickup_store: "cg" },
        buildQuote(input({ lines, delivery: "pickup" })),
      ),
    ).toEqual([{ field: "pickup_store", code: "pickup_store_required" }]);
    // Giỏ có hàng người bán: vẫn cần địa chỉ cho người bán giao.
    expect(
      validateDelivery(form, buildQuote(input({ delivery: "pickup" }))).map((e) => e.field),
    ).toEqual(["province", "ward", "street"]);
  });

  it("COD với hàng người bán không nhận COD, hoá đơn công ty, điểm vượt mức", () => {
    const quote = buildQuote(input({ province: "79", balance: 1_240 }));
    const errors = validatePayment(
      { ...filled, payment: "cod", invoice: true, tax_code: "123", points: 50 },
      quote,
      1_240,
    );
    expect(errors).toEqual([
      { field: "payment", code: "cod_unavailable" },
      { field: "points", code: "points_below_min", params: { min: 100 } },
      { field: "tax_code", code: "tax_code_invalid" },
      { field: "email", code: "email_required_invoice" },
    ]);
    expect(
      validatePayment(
        { ...filled, invoice: true, tax_code: "0101234567-001", email: "kt@example.com" },
        quote,
        1_240,
      ),
    ).toEqual([]);
  });

  it("giỏ trống thì chỉ báo giỏ trống", () => {
    expect(validateCheckout(filled, buildQuote(input({ lines: [] })), null)).toEqual([
      { field: "lines", code: "cart_empty" },
    ]);
  });
});
