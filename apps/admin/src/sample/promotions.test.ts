import { beforeEach, describe, expect, it } from "vitest";
import {
  allocate,
  applyBp,
  bpPercent,
  lowestAllowed,
  parseCartLines,
  parseCodes,
  parsePercentBp,
} from "@/lib/promotions";
import { ORG, resetSampleCatalog, VARIANT_ID } from "./catalog";
import {
  activatePromotion,
  type Cart,
  changePromotion,
  codeCounts,
  createPromotion,
  csvCell,
  type EvalContext,
  effectiveAt,
  evaluateCart,
  evaluateWith,
  exportNotice,
  extendPromotion,
  generateCodes,
  getPromotion,
  type LegalLimit,
  listCodes,
  listFlashItems,
  listNotices,
  listPromotions,
  listVersions,
  PROMOTION_ID,
  type Promotion,
  type PromotionSnapshot,
  recordNotice,
  resetSamplePromotions,
  setFlashPrice,
  setPromotionRunning,
  versionDiff,
} from "./promotions";
import { vietnamDay } from "./tax";

beforeEach(() => {
  resetSampleCatalog();
  resetSamplePromotions();
});

const cart = (lines: string, codes = "", over: Partial<Parameters<typeof evaluateCart>[0]> = {}) =>
  evaluateCart({
    org_id: ORG.Q3,
    lines,
    codes,
    customer_group: "",
    shipping_fee: "30000",
    ...over,
  });

describe("hàm thuần của khuyến mại", () => {
  it("làm tròn nửa xa số 0 và chia tiền luôn đủ tổng", () => {
    expect(applyBp(690_000, 1000)).toBe(69_000);
    expect(applyBp(5, 5000)).toBe(3);
    expect(applyBp(15, 1000)).toBe(2);
    const parts = allocate(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts).toEqual([34, 33, 33]);
    expect(allocate(50_000, [690_000, 99_000]).reduce((a, b) => a + b, 0)).toBe(50_000);
  });

  it("đọc dòng giỏ, mã và phần trăm gõ tay", () => {
    expect(parseCartLines("cg26 × 1, KB4-XA x2\nNRC750").lines).toEqual([
      { sku: "CG26", quantity: 1 },
      { sku: "KB4-XA", quantity: 2 },
      { sku: "NRC750", quantity: 1 },
    ]);
    expect(parseCartLines("CG26 × 0, ??").bad).toEqual(["CG26 × 0", "??"]);
    expect(parseCodes(" bepmoc10, BEPMOC10 trian10")).toEqual(["BEPMOC10", "TRIAN10"]);
    expect(parsePercentBp("12,5%")).toBe(1250);
    expect(parsePercentBp("120")).toBeNull();
    expect(bpPercent(1550, "vi")).toBe("15,5");
    expect(lowestAllowed(690_000, 5000)).toBe(345_000);
  });

  it("ô CSV bắt đầu bằng = + - @ không thành công thức", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
  });

  it("dữ liệu luật theo ngày hiệu lực: hai dòng, trước và sau ngày đổi", () => {
    const rows = [
      { id: "a", max: 5000, effective_from: "2025-01-01", effective_to: "2026-07-01" },
      { id: "b", max: 7000, effective_from: "2026-07-01", effective_to: null },
    ];
    expect(effectiveAt(rows, "2026-06-30", () => true)?.id).toBe("a");
    expect(effectiveAt(rows, "2026-07-01", () => true)?.id).toBe("b");
    expect(effectiveAt(rows, "2024-12-31", () => true)).toBeNull();
  });
});

describe("thử giỏ hàng (POST /promotions/evaluate, bước 43)", () => {
  it("mã BEPMOC10 giảm 10% chảo gang, đơn dưới 1.000.000 ₫ chưa miễn phí giao", async () => {
    const out = await cart("CG26 × 1", "bepmoc10");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const { evaluation } = out.data;
    expect(evaluation.total_discount.amount).toBe("69000");
    expect(evaluation.lines[0]?.reason.code).toBe("promotions.reason.percent_off");
    expect(evaluation.applied.map((a) => a.code)).toEqual(["BEPMOC10"]);
    const free = evaluation.skipped.find((x) => x.promotion_id === PROMOTION_ID.freeShipping);
    expect(free?.reason.code).toBe("promotions.skip.min_order");
    expect(free?.reason.params.missing).toBe("379000");
  });

  it("cùng giỏ, thứ tự dòng khác → cùng dấu vân tay", async () => {
    const a = await cart("CG26 × 1, KB4-XA × 2", "BEPMOC10");
    const b = await cart("KB4-XA × 2, CG26 × 1", "BEPMOC10");
    if (!a.ok || !b.ok) throw new Error("tính hỏng");
    // Khoá dòng theo thứ tự gõ nên khác nhau; tổng giảm và quà vẫn như nhau.
    expect(a.data.evaluation.total_discount).toEqual(b.data.evaluation.total_discount);
    expect(a.data.evaluation.gifts).toEqual(b.data.evaluation.gifts);
  });

  it("mua 2 khăn tặng 1 nước rửa là dòng quà riêng", async () => {
    const out = await cart("KB4-XA × 2");
    if (!out.ok) throw new Error("tính hỏng");
    expect(out.data.evaluation.gifts).toEqual([
      { promotion_id: PROMOTION_ID.towelsGift, variant_id: VARIANT_ID.NRC750, quantity: 1 },
    ]);
    const one = await cart("KB4-XA × 1");
    if (!one.ok) throw new Error("tính hỏng");
    expect(one.data.evaluation.gifts).toEqual([]);
    expect(
      one.data.evaluation.skipped.find((s) => s.promotion_id === PROMOTION_ID.towelsGift)?.reason
        .code,
    ).toBe("promotions.skip.min_quantity");
  });

  it("đơn từ 1.000.000 ₫ được miễn phí giao", async () => {
    const out = await cart("CG28 × 2");
    if (!out.ok) throw new Error("tính hỏng");
    expect(out.data.evaluation.shipping_discount.amount).toBe("30000");
  });

  it("mã sai không chặn cả giỏ; mã hết lượt và mã cần nhóm khách nêu lý do", async () => {
    const out = await cart("CG26 × 1", "KHONGCO, TRIAN10, KHSIX9TRW2");
    if (!out.ok) throw new Error("tính hỏng");
    const reasons = Object.fromEntries(
      out.data.evaluation.rejected_codes.map((r) => [r.code, r.reason.code]),
    );
    expect(reasons).toEqual({
      KHONGCO: "promotions.code_invalid",
      TRIAN10: "promotions.code_expired",
      KHSIX9TRW2: "promotions.code_not_applicable",
    });
    // Nhóm khách đúng nhưng chưa đủ giá trị đơn: vẫn là mã chưa đủ điều kiện, kèm số còn thiếu.
    const group = await cart("CG26 × 1", "KHSIX9TRW2", { customer_group: "si-nhahang" });
    if (!group.ok) throw new Error("tính hỏng");
    expect(group.data.evaluation.rejected_codes[0]?.reason.params.condition).toBe("min_order");
  });

  it("quá 5 mã, SKU lạ, dòng sai: báo dưới đúng ô một lần", async () => {
    const out = await cart("CG26 × 1, XYZ, ??", "A1, A2, A3, A4, A5, A6", { shipping_fee: "3k" });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    const fields = (out.problem.errors ?? []).map((e) => `${e.field}:${e.code}`);
    expect(fields).toEqual([
      "lines:promotions.line_format",
      "lines:catalog.variant_not_found",
      "codes:promotions.too_many_codes",
      "shipping_fee:money_minor",
    ]);
  });

  it("trần pháp luật: dòng giảm vượt 50% giá tham chiếu bị cắt và đánh dấu", () => {
    const promo = {
      id: "p1",
      org_id: "root",
      kind: "amount_off",
      scope: "items",
      trigger: "automatic",
      status: "active",
      value_bp: null,
      value: { amount: "400000", currency: "VND" },
      min_order: null,
      starts_at: "2026-01-01T00:00:00.000Z",
      ends_at: "2027-01-01T00:00:00.000Z",
      priority: 0,
      exclusive: false,
      usage_limit: null,
      usage_count: 0,
      program_kind: "regular",
      customer_groups: [],
      targets: [],
      translations: [{ locale: "vi", title: "Giảm 400k", terms: "" }],
      public: true,
    } as unknown as Promotion;
    const limit: LegalLimit = {
      id: "l",
      jurisdiction: "VN",
      promotion_kind: "price_reduction",
      program_kind: "regular",
      max_bp: 5000,
      effective_from: "2025-01-01",
      effective_to: null,
      legal_basis: "TT",
      source_url: "",
      note: "",
      pack_version: "t",
      needs_review: true,
    };
    const ctx: EvalContext = {
      promotions: [promo],
      codes: [],
      flash: [],
      limits: [limit],
      chain: ["store", "root"],
      snapshots: new Map([["v1", { product_id: "x", category_ids: [], sku: "A", name: "A" }]]),
      references: new Map([["p1:v1", 690_000]]),
    };
    const c: Cart = {
      org_id: "store",
      currency: "VND",
      buyer_id: null,
      customer_groups: [],
      channel: null,
      lines: [
        {
          line_key: "a",
          variant_id: "v1",
          quantity: 1,
          unit_price: { amount: "690000", currency: "VND" },
        },
      ],
      shipping_fee: null,
      codes: [],
      at: "2026-06-01T00:00:00.000Z",
      locale: "vi",
    };
    const out = evaluateWith(c, ctx);
    expect(out.lines[0]?.amount.amount).toBe("345000");
    expect(out.lines[0]?.capped_by_law).toBe(true);
    // Không có dòng luật hiệu lực: không tự cho qua.
    const none = evaluateWith(c, { ...ctx, limits: [] });
    expect(none.total_discount.amount).toBe("0");
    expect(none.skipped[0]?.reason.code).toBe("promotions.skip.no_legal_data");
  });
});

describe("chương trình: bật, tạm dừng, kéo dài, phiên bản", () => {
  it("flash sale vượt trần bị chặn; sửa giá về giá thấp nhất thì còn thiếu thông báo", async () => {
    const blocked = await activatePromotion(PROMOTION_ID.flashWeekend);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.problem.code).toBe("promotions.exceeds_legal_limit");
    const rows = await listFlashItems(PROMOTION_ID.flashWeekend);
    const pan = rows?.data.find((r) => r.variant_id === VARIANT_ID.CG26);
    expect(pan?.over_limit).toBe(true);
    expect(pan?.lowest_allowed?.amount).toBe("345000");
    const low = await setFlashPrice(PROMOTION_ID.flashWeekend, VARIANT_ID.CG26, "300000", "");
    expect(low.ok).toBe(false);
    if (!low.ok) expect(low.problem.errors?.[0]?.code).toBe("promotions.exceeds_legal_limit");
    expect((await setFlashPrice(PROMOTION_ID.flashWeekend, VARIANT_ID.CG26, "345000", "")).ok).toBe(
      true,
    );
    const again = await activatePromotion(PROMOTION_ID.flashWeekend);
    if (!again.ok) expect(again.problem.code).toBe("promotions.notice_required");
    expect((await recordNotice(PROMOTION_ID.flashWeekend, "TB-1 (mẫu)", vietnamDay())).ok).toBe(
      true,
    );
    const done = await activatePromotion(PROMOTION_ID.flashWeekend);
    expect(done.ok).toBe(true);
    const versions = await listVersions({ promotion_id: PROMOTION_ID.flashWeekend });
    expect(versions.data.map((v) => v.version)).toEqual([1]);
  });

  it("ngày nộp ở tương lai bị từ chối; chương trình không cần thông báo thì báo lỗi", async () => {
    const bad = await recordNotice(PROMOTION_ID.christmas, "", "2999-01-01");
    if (bad.ok) throw new Error("phải lỗi");
    expect((bad.problem.errors ?? []).map((e) => `${e.field}:${e.code}`)).toEqual([
      "reference:required",
      "submitted_on:not_future",
    ]);
    const free = await recordNotice(PROMOTION_ID.freeShipping, "X", vietnamDay());
    expect(free.ok).toBe(false);
  });

  it("tạm dừng rồi chạy lại (Hoàn tác) ghi phiên bản; huỷ chương trình đang chạy không được", async () => {
    const paused = await setPromotionRunning(PROMOTION_ID.panTenOff, "paused");
    expect(paused.ok && paused.data.previous).toBe("active");
    const back = await setPromotionRunning(PROMOTION_ID.panTenOff, "active");
    expect(back.ok).toBe(true);
    const cancel = await changePromotion(PROMOTION_ID.panTenOff, "cancel");
    if (!cancel.ok) expect(cancel.problem.code).toBe("promotions.invalid_transition");
    const versions = await listVersions({ promotion_id: PROMOTION_ID.panTenOff });
    expect(versions.data[0]?.version).toBe(5);
    expect(versions.data[0]?.changes.map((c) => c.field)).toEqual(["status"]);
  });

  it("chỉ được kéo dài và tăng lượt; mỗi thay đổi một phiên bản", async () => {
    const shorter = await extendPromotion(PROMOTION_ID.panTenOff, {
      ends_at: "2020-01-01T00:00",
      usage_limit: "900",
      reason: "",
    });
    if (shorter.ok) throw new Error("phải lỗi");
    expect((shorter.problem.errors ?? []).map((e) => `${e.field}:${e.code}`)).toEqual([
      "ends_at:promotions.extend_only",
      "usage_limit:promotions.raise_only",
      "reason:required",
    ]);
    const ok = await extendPromotion(PROMOTION_ID.panTenOff, {
      ends_at: "2099-12-07T23:59",
      usage_limit: "1500",
      reason: "Bán chạy",
    });
    expect(ok.ok).toBe(true);
    const versions = await listVersions({ promotion_id: PROMOTION_ID.panTenOff });
    expect(versions.data.slice(0, 2).map((v) => v.change.code)).toEqual([
      "usage_limit_raised",
      "extended",
    ]);
  });

  it("tạo bản nháp: gom mọi lỗi; mã trùng báo dưới ô mã", async () => {
    const bad = await createPromotion({
      title: "",
      kind: "percent_off",
      trigger: "code",
      code: "bepmoc10",
      value: "150%",
      min_order: "",
      starts_at: "2026-12-10T00:00",
      ends_at: "2026-12-01T00:00",
      usage_limit: "10",
      per_customer_limit: "20",
      exclusive: false,
      org_id: ORG.ROOT,
      targets: "CG26, KHONGCO",
    });
    if (bad.ok) throw new Error("phải lỗi");
    expect((bad.problem.errors ?? []).map((e) => `${e.field}:${e.code}`)).toEqual([
      "title:required",
      "value:percent",
      "ends_at:promotions.invalid_window",
      "per_customer_limit:promotions.per_customer_over_total",
      "code:promotions.code_taken",
      "targets:promotions.target_unknown",
    ]);
    const ok = await createPromotion({
      title: "Giảm 5% thớt",
      kind: "percent_off",
      trigger: "automatic",
      code: "",
      value: "5",
      min_order: "",
      starts_at: "2099-01-01T00:00",
      ends_at: "2099-01-31T23:59",
      usage_limit: "",
      per_customer_limit: "",
      exclusive: false,
      org_id: ORG.ROOT,
      targets: "TG35",
    });
    expect(ok.ok && ok.data.status).toBe("draft");
    expect(ok.ok && ok.data.notice_status).toBe("pending");
  });

  it("Giáng sinh bị chặn vì chưa thông báo; danh sách lọc được theo 'bị chặn'", async () => {
    const out = await activatePromotion(PROMOTION_ID.christmas);
    if (out.ok) throw new Error("phải lỗi");
    expect(out.problem.code).toBe("promotions.notice_required");
    const blocked = await listPromotions({ status: "blocked" });
    expect(blocked.data.map((p) => p.id).sort()).toEqual(
      [PROMOTION_ID.christmas, PROMOTION_ID.flashWeekend].sort(),
    );
    const detail = await getPromotion(PROMOTION_ID.panTenOff);
    expect(
      detail?.data.price_lines.map((l) => [l.sku, l.reference?.amount, l.after?.amount]),
    ).toEqual([
      ["CG26", "690000", "621000"],
      ["CG28", "760000", "684000"],
    ]);
  });

  it("so phiên bản chỉ ra trường đã đổi", () => {
    const base: PromotionSnapshot = {
      status: "active",
      title_vi: "A",
      title_en: "A",
      value_bp: 1000,
      value: null,
      min_order: null,
      starts_at: "s",
      ends_at: "e",
      usage_limit: 500,
      per_customer_limit: 1,
      exclusive: false,
      targets: ["x"],
      notice_status: "submitted",
      notice_reference: "r",
    };
    expect(versionDiff(null, base)).toEqual([]);
    expect(versionDiff(base, { ...base, usage_limit: 1000 })).toEqual([
      { field: "usage_limit", from: "500", to: "1000" },
    ]);
  });
});

describe("mã giảm giá và thông báo", () => {
  it("số lượt còn là số thật; mã hết lượt / hết hạn đúng trạng thái", async () => {
    const { data } = await listCodes({ q: "bepmoc" });
    expect(data[0]?.remaining).toBe(732);
    expect(data[0]?.applies_to).toEqual(["CG26", "CG28"]);
    const counts = await codeCounts();
    expect(counts.all).toBe(52);
    expect(counts.expired).toBe(1);
    expect(counts.exhausted).toBe(1);
  });

  it("sinh lô mã: kiểm số lượng, tiền tố; trên 500 mã thì xếp job", async () => {
    const bad = await generateCodes({
      promotion_id: PROMOTION_ID.christmas,
      count: "20000",
      prefix: "gs-b",
      per_code: "0",
    });
    if (bad.ok) throw new Error("phải lỗi");
    expect((bad.problem.errors ?? []).map((e) => `${e.field}:${e.code}`)).toEqual([
      "promotion_id:promotions.not_code_based",
      "count:promotions.too_many_generated",
      "prefix:prefix_format",
      "per_code:whole_number",
    ]);
    const ok = await generateCodes({
      promotion_id: PROMOTION_ID.panTenOff,
      count: "600",
      prefix: "gsb",
      per_code: "1",
    });
    expect(ok.ok && ok.data).toMatchObject({ generated: 600, queued: true });
    expect(ok.ok && ok.data.first.startsWith("GSB")).toBe(true);
    expect(ok.ok && /[01IOL]/.test(ok.data.first.slice(3))).toBe(false);
  });

  it("hồ sơ thông báo: địa bàn theo cửa hàng, CSV chặn công thức", async () => {
    const { data } = await listNotices();
    expect(data[0]?.notice_status).toBe("pending");
    const christmas = data.find((n) => n.promotion_id === PROMOTION_ID.christmas);
    expect(christmas?.provinces).toEqual(["Hà Nội", "TP. Hồ Chí Minh"]);
    const csv = await exportNotice(PROMOTION_ID.christmas, "csv");
    expect(csv.ok && csv.data.body.startsWith("field,value")).toBe(true);
    expect(csv.ok && csv.data.body).toContain("Giảm giá 20%");
  });
});
