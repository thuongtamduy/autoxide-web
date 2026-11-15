import { beforeEach, describe, expect, it } from "vitest";
import {
  addRule,
  changeSession,
  createLink,
  listCommissions,
  listPayouts,
  listRules,
  listSessions,
  markPayoutPaid,
  PARTNER_ID,
  type PitRule,
  pickRule,
  pinProduct,
  previewCommission,
  resetSampleAffiliate,
  retryPayout,
  scheduleSession,
  transitionPartner,
  withholdingFor,
} from "./affiliate";
import { CATEGORY_ID, resetSampleCatalog } from "./catalog";
import { resetSampleInventory } from "./inventory";
import { ordersState, resetSampleOrders, transitionOrder } from "./orders";
import { resetSamplePromotions } from "./promotions";
import { vietnamDay } from "./tax";

beforeEach(() => {
  resetSampleCatalog();
  resetSampleInventory();
  resetSamplePromotions();
  resetSampleOrders();
  resetSampleAffiliate();
});

const vnd = (n: number) => ({ amount: String(n), currency: "VND" });

describe("khấu trừ thuế TNCN theo dữ liệu thuế", () => {
  const rules: PitRule[] = [
    {
      id: "a",
      subject: "individual_resident",
      rate_bp: 1000,
      threshold: vnd(2_000_000),
      basis: "",
      verify: true,
      effective_from: "2013-10-01",
      effective_to: "2026-12-31",
    },
    {
      id: "b",
      subject: "individual_resident",
      rate_bp: 1000,
      threshold: vnd(5_000_000),
      basis: "",
      verify: true,
      effective_from: "2027-01-01",
      effective_to: null,
    },
    {
      id: "c",
      subject: "commitment",
      rate_bp: 0,
      threshold: null,
      basis: "",
      verify: true,
      effective_from: "2013-10-01",
      effective_to: null,
    },
    {
      id: "d",
      subject: "enterprise",
      rate_bp: 0,
      threshold: null,
      basis: "",
      verify: false,
      effective_from: "2013-10-01",
      effective_to: null,
    },
  ];

  it("cùng số tiền, khấu trừ khác nhau theo ngày chi khi ngưỡng đổi; doanh nghiệp và có cam kết không khấu trừ", () => {
    expect(
      withholdingFor(rules, "individual_resident", false, 3_000_000, "2026-11-15").withheld,
    ).toBe(300_000);
    expect(
      withholdingFor(rules, "individual_resident", false, 3_000_000, "2027-01-02").withheld,
    ).toBe(0);
    expect(
      withholdingFor(rules, "individual_resident", false, 1_999_999, "2026-11-15").withheld,
    ).toBe(0);
    expect(withholdingFor(rules, "enterprise", false, 9_000_000, "2026-11-15").withheld).toBe(0);
    expect(
      withholdingFor(rules, "individual_resident", true, 9_000_000, "2026-11-15").withheld,
    ).toBe(0);
  });
});

describe("quy tắc hoa hồng", () => {
  it("sản phẩm thắng danh mục (ưu tiên cao hơn); quy tắc riêng chưa hiệu lực không áp; quy tắc theo ngày đặt", () => {
    const rules = [
      {
        scope: "default" as const,
        target_id: null,
        partner_id: null,
        priority: 0,
        effective_from: "2026-07-01",
        effective_to: null,
      },
      {
        scope: "category" as const,
        target_id: "cat",
        partner_id: null,
        priority: 20,
        effective_from: "2026-10-01",
        effective_to: null,
      },
      {
        scope: "product" as const,
        target_id: "p1",
        partner_id: null,
        priority: 30,
        effective_from: "2026-11-01",
        effective_to: null,
      },
      {
        scope: "category" as const,
        target_id: "cat",
        partner_id: "hang",
        priority: 40,
        effective_from: "2026-12-01",
        effective_to: null,
      },
    ];
    const line = { product_id: "p1", category_ids: ["cat"] };
    expect(pickRule(rules, line, "hang", "2026-11-15")?.scope).toBe("product");
    expect(pickRule(rules, line, "hang", "2026-10-15")?.scope).toBe("category");
    expect(pickRule(rules, line, "hang", "2026-12-02")?.partner_id).toBe("hang");
    expect(
      pickRule(rules, { product_id: "x", category_ids: [] }, "hang", "2026-11-15")?.scope,
    ).toBe("default");
  });

  it("thêm quy tắc: hiệu lực hôm nay bị từ chối, trùng phạm vi cùng ngày báo trùng", async () => {
    const today = await addRule({
      scope: "default",
      target: "",
      partner: "",
      rate: "6",
      cap: "",
      priority: "1",
      from: vietnamDay(),
    });
    expect(!today.ok && today.problem.errors?.[0]?.code).toBe("affiliate.rule_in_past");
    const from = vietnamDay(Date.now() + 3 * 86_400_000);
    const ok = await addRule({
      scope: "category",
      target: CATEGORY_ID.kitchen,
      partner: "",
      rate: "7,5",
      cap: "",
      priority: "5",
      from,
    });
    expect(ok.ok && ok.data.rate_bp).toBe(750);
    const dup = await addRule({
      scope: "category",
      target: CATEGORY_ID.kitchen,
      partner: "",
      rate: "9",
      cap: "",
      priority: "5",
      from,
    });
    expect(!dup.ok && dup.problem.code).toBe("affiliate.rule_overlap");
    expect((await listRules()).data.some((r) => r.target_name === "Bếp")).toBe(true);
  });

  it("xem trước hoa hồng tính trên tiền sau giảm, chưa thuế", async () => {
    const out = await previewCommission({
      sku: "CG26",
      code: "BEPMOC10",
      day: vietnamDay(),
      partner: "",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(Number(out.data.base.amount)).toBe(
      Number(out.data.net.amount) - Number(out.data.tax.amount),
    );
    expect(Number(out.data.amount.amount)).toBe(
      Math.round((Number(out.data.base.amount) * (out.data.rule?.rate_bp ?? 0)) / 10_000),
    );
  });
});

describe("hoa hồng từ đơn mẫu", () => {
  it("mỗi dòng đơn được ghi nhận một dòng hoa hồng; huỷ đơn thì hoa hồng huỷ", async () => {
    const { data } = await listCommissions();
    expect(data.length).toBeGreaterThan(10);
    const { orders } = await ordersState();
    for (const c of data.slice(0, 20)) {
      const o = orders.find((x) => x.id === c.order_id);
      expect(o?.channel).toBe("web");
      const line = o?.lines.find((l) => l.id === c.order_line_id);
      const tax = line?.taxes.reduce((s, t) => s + Number(t.amount.amount), 0) ?? 0;
      expect(Number(c.base.amount)).toBe(Number(line?.net.amount) - tax);
    }
    const pending = data.find((c) => c.status === "pending" && c.order_status !== "shipping");
    if (pending) {
      expect((await transitionOrder(pending.order_id, "cancelled")).ok).toBe(true);
      const after = (await listCommissions()).data.filter((c) => c.order_id === pending.order_id);
      expect(after.every((c) => c.status === "void")).toBe(true);
    }
  });
});

describe("người tiếp thị", () => {
  it("duyệt hồ sơ chờ duyệt; chưa xác thực thì không duyệt được; mở lại cần xác thực còn hạn; tạm khoá cần lý do", async () => {
    expect((await transitionPartner(PARTNER_ID.mebo, "approve")).ok).toBe(true);
    const unverified = await transitionPartner(PARTNER_ID.tuan, "approve");
    expect(!unverified.ok && unverified.problem.code).toBe("affiliate.invalid_transition");
    const expired = await transitionPartner(PARTNER_ID.lanchi, "reopen");
    expect(!expired.ok && expired.problem.code).toBe("affiliate.kyc_required");
    const noReason = await transitionPartner(PARTNER_ID.minh, "suspend", "");
    expect(!noReason.ok && noReason.problem.errors?.[0]?.field).toBe("reason");
    const ok = await transitionPartner(PARTNER_ID.minh, "suspend", "Vi phạm điều khoản");
    expect(ok.ok && ok.data.previous).toBe("active");
    const link = await createLink(
      { code: "minh-moi", target_kind: "store", sku: "" },
      PARTNER_ID.minh,
    );
    expect(!link.ok && link.problem.code).toBe("affiliate.partner_not_active");
  });

  it("mã link trùng mã người tiếp thị hay link khác thì báo trùng", async () => {
    const dup = await createLink({ code: "hangbep", target_kind: "store", sku: "" });
    expect(!dup.ok && dup.problem.code).toBe("affiliate.code_taken");
    expect(
      (await createLink({ code: "hang-noi-inox", target_kind: "product", sku: "NI20" })).ok,
    ).toBe(true);
  });
});

describe("chi trả", () => {
  it("Hằng Bếp Vui (cá nhân cư trú, từ 2 triệu) bị khấu trừ 10%; doanh nghiệp không; ghi đã chi cần mã giao dịch và ngày hợp lệ", async () => {
    const { data } = await listPayouts();
    const hang = data.find((p) => p.partner_id === PARTNER_ID.hang);
    expect(Number(hang?.withheld.amount)).toBe(Math.round(Number(hang?.gross.amount) / 10));
    const mocan = data.find((p) => p.partner_id === PARTNER_ID.mocan);
    expect(mocan?.withheld.amount).toBe("0");
    const building = data.find((p) => p.status === "building");
    const bad = await markPayoutPaid(building?.id ?? "", {
      bank_reference: "",
      date: "2099-01-01",
    });
    expect(!bad.ok && bad.problem.errors?.map((e) => e.field)).toEqual(["bank_reference", "date"]);
    const ok = await markPayoutPaid(building?.id ?? "", {
      bank_reference: "GD-TEST-0001",
      date: vietnamDay(),
    });
    expect(ok.ok && ok.data.status).toBe("paid");
    const failed = data.find((p) => p.status === "failed");
    expect((await retryPayout(failed?.id ?? "")).ok).toBe(true);
    expect(!(await retryPayout(failed?.id ?? "")).ok).toBe(true);
  });
});

describe("livestream", () => {
  it("người phát chưa xác thực SĐT không lên lịch được; giờ trong quá khứ báo dưới ô; sản phẩm chưa bán không gắn được", async () => {
    const future = new Date(Date.now() + 7 * 3_600_000 + 3 * 86_400_000).toISOString().slice(0, 16);
    const tuan = await scheduleSession({
      title: "Thử",
      host: PARTNER_ID.tuan,
      platform: "tiktok",
      at: future,
    });
    expect(!tuan.ok && tuan.problem.code).toBe("affiliate.phone_verification_required");
    const past = await scheduleSession({
      title: "Thử",
      host: PARTNER_ID.hang,
      platform: "tiktok",
      at: "2020-01-01T10:00",
    });
    expect(!past.ok && past.problem.errors?.[0]?.code).toBe("affiliate.time_in_past");
    const { data } = await listSessions();
    const live = data.find((s) => s.status === "live");
    const draft = await pinProduct(live?.id ?? "", { sku: "BNI3", code: "" });
    expect(!draft.ok && draft.problem.code).toBe("affiliate.variant_not_sellable");
    expect((await pinProduct(live?.id ?? "", { sku: "NI20", code: "" })).ok).toBe(true);
    const ended = await changeSession(live?.id ?? "", "ended");
    expect(ended.ok && ended.data.log.at(-1)?.kind).toBe("ended");
    const report = data.find((s) => s.status === "ended")?.report;
    expect(report?.orders).toBeGreaterThan(0);
  });
});
