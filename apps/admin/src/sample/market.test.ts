import { afterEach, describe, expect, it } from "vitest";
import { approveKyc, listKycProfiles, resetSampleCompliance } from "./compliance";
import { acceptanceOf, resetSampleComplianceRecords } from "./compliance-records";
import {
  acceptSellerDocument,
  addFeeRule,
  addListing,
  answerDispute,
  appealPenalty,
  bpPercent,
  cancelFeeRule,
  commissionFor,
  decideListing,
  editListing,
  type FeeRule,
  getSeller,
  inviteSeller,
  kycOf,
  listDisputes,
  listFeeRules,
  listListingReviews,
  listPayouts,
  listSellerOrders,
  listSettlements,
  type MarketOrder,
  orderStats,
  parseRateBp,
  previewFees,
  resetSampleMarket,
  resolveDispute,
  retryPayout,
  SELLER,
  sellerOrderStats,
  sendPayout,
  setPayoutAccount,
  settle,
  shipSellerOrder,
  statementCsv,
  submitForReview,
  submitSellerDocument,
  transitionSeller,
} from "./market";
import { vietnamDay } from "./tax";

afterEach(async () => {
  resetSampleMarket();
  resetSampleComplianceRecords();
  await resetSampleCompliance();
});

const day = (offset: number) =>
  new Date(Date.parse(`${vietnamDay()}T00:00:00Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);

describe("tính tiền của sàn", () => {
  it("quyết toán theo số của bản thiết kế: hộ kinh doanh bị khấu trừ thay, doanh nghiệp thì không", () => {
    const household = settle({
      gross: 690_000,
      commission_bp: 600,
      fee_vat_percent: "10",
      seller_type: "household",
      vat_percent: "1",
      pit_percent: "0.5",
    });
    expect(household).toEqual({
      gross: 690_000,
      subsidy: 0,
      fees: 41_400,
      fee_vat: 3_764,
      withholding_vat: 6_900,
      withholding_pit: 3_450,
      net: 638_250,
    });
    const batch = settle({
      ...household,
      commission_bp: 600,
      fee_vat_percent: "10",
      seller_type: "household",
      vat_percent: "1",
      pit_percent: "0.5",
      gross: 24_600_000,
    });
    expect(batch.net).toBe(22_755_000);
    expect(batch.fees - batch.fee_vat).toBe(1_341_818);
    const company = settle({
      gross: 690_000,
      commission_bp: 600,
      fee_vat_percent: "10",
      seller_type: "enterprise",
      vat_percent: "1",
      pit_percent: "0.5",
    });
    expect(company.withholding_vat + company.withholding_pit).toBe(0);
    expect(company.net).toBe(648_600);
  });

  it("net luôn bằng gross + subsidy − phí − khấu trừ, từng đồng", () => {
    for (const gross of [1, 99, 12_345, 999_999, 7_654_321]) {
      const r = settle({
        gross,
        subsidy: 1_000,
        commission_bp: 550,
        fee_vat_percent: "10",
        seller_type: "individual",
        vat_percent: "1",
        pit_percent: "0.5",
      });
      expect(r.net).toBe(r.gross + r.subsidy - r.fees - r.withholding_vat - r.withholding_pit);
      expect(Number.isInteger(r.fees) && Number.isInteger(r.fee_vat)).toBe(true);
    }
  });

  it("đọc tỉ lệ hoa hồng", () => {
    expect(bpPercent(600)).toBe("6");
    expect(bpPercent(550)).toBe("5.5");
    expect(bpPercent(125)).toBe("1.25");
    expect(parseRateBp("6")).toBe(600);
    expect(parseRateBp("5,5%")).toBe(550);
    expect(parseRateBp("31")).toBeNull();
    expect(parseRateBp("abc")).toBeNull();
  });

  it("hoa hồng: ngành hàng gần nhất thắng mặc định, theo ngày đặt đơn", () => {
    const rule = (
      id: string,
      category: string | null,
      bp: number,
      from: string,
      to: string | null,
    ): FeeRule => ({
      id,
      fee_kind: "commission",
      category_id: category,
      seller_type: null,
      rate_bp: bp,
      fixed: null,
      unit: null,
      includes_vat: true,
      effective_from: from,
      effective_to: to,
      created_by: "test",
      created_at: "2026-01-01T00:00:00Z",
    });
    const rules = [
      rule("old", null, 700, "2026-01-01", "2026-02-28"),
      rule("all", null, 600, "2026-03-01", null),
      rule("parent", "tableware", 550, "2026-03-01", null),
      rule("child", "ceramics", 500, "2026-09-01", null),
    ];
    const lineage = ["ceramics", "tableware"];
    expect(commissionFor(rules, lineage, "household", "2026-02-15")?.id).toBe("old");
    expect(commissionFor(rules, lineage, "household", "2026-05-01")?.id).toBe("parent");
    expect(commissionFor(rules, lineage, "household", "2026-10-01")?.id).toBe("child");
    expect(commissionFor(rules, ["pots", "kitchen"], "household", "2026-10-01")?.id).toBe("all");
  });
});

describe("điều kiện bán gắn với Tuân thủ", () => {
  it("KYC: hồ sơ còn hạn thắng hồ sơ mới đang chờ; hết hạn thì không bán", async () => {
    const { data: profiles } = await listKycProfiles();
    expect(kycOf(profiles, SELLER.gomSu)).toMatchObject({
      state: "verified",
      renewal_pending: true,
    });
    expect(kycOf(profiles, SELLER.nhaNa).state).toBe("pending");
    expect(kycOf(profiles, SELLER.nhaTho).state).toBe("verified");
  });

  it("duyệt KYC ở Tuân thủ gỡ tạm khoá tự động; tạm khoá do người thì không tự gỡ", async () => {
    const before = await getSeller(SELLER.nhaNa);
    expect(before?.data).toMatchObject({ status: "suspended", status_reason: "kyc_expired" });
    expect(before?.data.gate.can_sell).toBe(false);
    const profile = (await listKycProfiles({ status: "pending" })).data.find(
      (p) => p.subject_id === SELLER.nhaNa,
    );
    expect(profile).toBeDefined();
    await approveKyc(profile?.id ?? "");
    const after = await getSeller(SELLER.nhaNa);
    expect(after?.data.status).toBe("active");
    expect(after?.data.gate.can_sell).toBe(true);
    expect(after?.data.history[0]?.kind).toBe("auto_reinstated");

    const suspended = await transitionSeller(
      SELLER.gomSu,
      { transition: "suspend", reason: "Kiểm tra hàng giả theo báo cáo" },
      "test",
    );
    expect(suspended.ok && suspended.data.previous).toBe("active");
    expect((await getSeller(SELLER.gomSu))?.data.status).toBe("suspended");
    const short = await transitionSeller(
      SELLER.khanBong,
      { transition: "suspend", reason: "ngắn" },
      "test",
    );
    expect(!short.ok && short.problem.errors?.[0]?.field).toBe("reason");
  });

  it("người bán gửi hồ sơ: thiếu gì báo đủ một lần; đủ thì chờ sàn duyệt rồi được bán", async () => {
    const missing = await submitForReview(SELLER.anNhien);
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.problem.errors?.map((e) => e.field)).toEqual([
        "kyc",
        "platform_rules",
        "seller_agreement",
        "documents",
        "payout_account",
      ]);
    }
    // Dao Kéo: chỉ còn thiếu KYC.
    const dao = (await listKycProfiles({ status: "pending" })).data.find(
      (p) => p.subject_id === SELLER.daoKeo,
    );
    await approveKyc(dao?.id ?? "");
    expect((await submitForReview(SELLER.daoKeo)).ok).toBe(true);
    const approved = await transitionSeller(
      SELLER.daoKeo,
      { transition: "approve", reason: "" },
      "test",
    );
    expect(approved.ok).toBe(true);
    expect((await getSeller(SELLER.daoKeo))?.data.gate.can_sell).toBe(true);
  });

  it("chấp nhận văn bản ghi vào Tuân thủ; giấy tờ ngành có điều kiện chờ sàn duyệt", async () => {
    expect(
      (await acceptanceOf("seller_agreement", "Thực Phẩm Sạch An Nhiên")).accepted_at,
    ).toBeNull();
    expect((await acceptSellerDocument(SELLER.anNhien, "seller_agreement")).ok).toBe(true);
    expect(
      (await acceptanceOf("seller_agreement", "Thực Phẩm Sạch An Nhiên")).accepted_at,
    ).not.toBeNull();
    const wrong = await submitSellerDocument(SELLER.anNhien, {
      doc_type: "circulation_registration",
      number: "12",
      valid_until: "",
    });
    expect(!wrong.ok && wrong.problem.errors?.map((e) => e.field)).toEqual(["doc_type", "number"]);
    expect(
      (
        await submitSellerDocument(SELLER.anNhien, {
          doc_type: "self_declaration",
          number: "[SỐ MẪU]",
          valid_until: "",
        })
      ).ok,
    ).toBe(true);
    const req = (await getSeller(SELLER.anNhien))?.data.gate.requirements.find(
      (r) => r.key === "documents",
    );
    expect(req?.state).toBe("submitted");
  });
});

describe("duyệt sản phẩm", () => {
  it("hàng có điều kiện thiếu giấy tờ không duyệt được; duyệt có Hoàn tác", async () => {
    const { data } = await listListingReviews({ status: "pending" });
    const salt = data.find((l) => l.seller_org_id === SELLER.anNhien);
    const bowl = data.find((l) => l.seller_org_id === SELLER.gomSu);
    const blocked = await decideListing(
      salt?.id ?? "",
      { decision: "approved", reason: "" },
      "test",
    );
    expect(!blocked.ok && blocked.problem.code).toBe("marketplace.documents_missing");
    const ok = await decideListing(bowl?.id ?? "", { decision: "approved", reason: "" }, "test");
    expect(ok.ok && ok.data.previous).toBe("pending");
    const undo = await decideListing(bowl?.id ?? "", { decision: "pending", reason: "" }, "test");
    expect(undo.ok).toBe(true);
    const reject = await decideListing(
      bowl?.id ?? "",
      { decision: "rejected", reason: "" },
      "test",
    );
    expect(!reject.ok && reject.problem.errors?.[0]?.field).toBe("reason");
  });

  it("người bán thêm sản phẩm: phát hiện tự động điền sẵn", async () => {
    const { CATEGORY_ID } = await import("./catalog");
    const added = await addListing(SELLER.khanBong, {
      name: "Muối hồng 500 g",
      category_id: CATEGORY_ID.spices,
      price: "45.000",
    });
    expect(added.ok && added.data.findings.map((f) => f.code)).toEqual(["documents_missing"]);
    const bad = await addListing(SELLER.khanBong, { name: "", category_id: "x", price: "-1" });
    expect(!bad.ok && bad.problem.errors?.map((e) => e.field)).toEqual([
      "name",
      "category_id",
      "price",
    ]);
  });
});

describe("người bán sửa sản phẩm", () => {
  it("sửa sản phẩm bị từ chối: bản sửa mới chờ duyệt, bỏ lý do cũ, giữ giá cũ để so", async () => {
    const { data } = await listListingReviews({ seller: SELLER.khanBong, status: "rejected" });
    const apron = data[0];
    expect(apron?.reason).toContain("logo");
    const bad = await editListing(SELLER.khanBong, apron?.id ?? "", { name: "", price: "abc" });
    expect(!bad.ok && bad.problem.errors?.map((e) => e.field)).toEqual(["name", "price"]);
    const foreign = await editListing(SELLER.gomSu, apron?.id ?? "", {
      name: "Tạp dề",
      price: "1",
    });
    expect(!foreign.ok && foreign.problem.code).toBe("marketplace.listing_not_found");
    const ok = await editListing(SELLER.khanBong, apron?.id ?? "", {
      name: apron?.product_name ?? "",
      price: "155.000",
    });
    expect(ok.ok && ok.data).toMatchObject({
      status: "pending",
      reason: null,
      change: "price",
      revision: 2,
      price: { amount: "155000" },
      previous_price: { amount: "145000" },
    });
  });
});

describe("phí sàn có ngày hiệu lực", () => {
  it("thêm dòng mới tự đóng dòng cũ; không thêm trong quá khứ; huỷ dòng chưa hiệu lực mở lại dòng cũ", async () => {
    const past = await addFeeRule(
      {
        fee_kind: "commission",
        category_id: "",
        seller_type: "",
        rate: "5",
        effective_from: vietnamDay(),
      },
      "test",
    );
    expect(!past.ok && past.problem.errors?.[0]?.code).toBe("fee_rule_in_past");
    const from = day(10);
    const added = await addFeeRule(
      { fee_kind: "commission", category_id: "", seller_type: "", rate: "5", effective_from: from },
      "test",
    );
    expect(added.ok).toBe(true);
    const overlap = await addFeeRule(
      {
        fee_kind: "commission",
        category_id: "",
        seller_type: "",
        rate: "4",
        effective_from: day(5),
      },
      "test",
    );
    expect(!overlap.ok && overlap.problem.code).toBe("marketplace.fee_rule_overlap");
    const { data } = await listFeeRules();
    const old = data.find((r) => r.rate_bp === 600);
    expect(old?.effective_to).toBe(day(9));
    expect(data.find((r) => r.rate_bp === 500 && r.category_id === null)?.state).toBe("scheduled");
    if (added.ok) expect((await cancelFeeRule(added.data.id)).ok).toBe(true);
    expect((await listFeeRules()).data.find((r) => r.rate_bp === 600)?.effective_to).toBeNull();
  });

  it("tính thử phí theo bản thiết kế", async () => {
    const { CATEGORY_ID } = await import("./catalog");
    const preview = await previewFees({
      category_id: CATEGORY_ID.pots,
      price: "690000",
      seller_type: "household",
      date: "",
    });
    expect(preview.ok && preview.data.net.amount).toBe("638250");
    const ceramics = await previewFees({
      category_id: CATEGORY_ID.ceramics,
      price: "690000",
      seller_type: "enterprise",
      date: "",
    });
    expect(ceramics.ok && ceramics.data.commission_bp).toBe(500);
  });
});

describe("quyết toán và chi trả", () => {
  it("quyết toán đơn 0350 khớp sổ Chợ Bếp Mộc", async () => {
    const { data } = await listSettlements({ seller: SELLER.nhaNa });
    const order = data.find((x) => x.order_number === "BM-2611-0350");
    expect(order?.net.amount).toBe("638250");
    expect(order?.fee_vat.amount).toBe("3764");
  });

  it("người bán chưa đủ điều kiện không nhận chi trả; chi lại dùng cùng mã tham chiếu", async () => {
    const { data } = await listPayouts();
    const naNa = data.find((p) => p.seller_org_id === SELLER.nhaNa && p.status === "building");
    expect(naNa?.amount.amount).toBe("22755000");
    const blocked = await sendPayout(naNa?.id ?? "");
    expect(!blocked.ok && blocked.problem.code).toBe("marketplace.seller_not_active");
    const failed = data.find((p) => p.status === "failed");
    const reference = failed?.reference;
    const retry = await retryPayout(failed?.id ?? "");
    expect(retry.ok && retry.data.reference).toBe(reference);
    expect((await retryPayout(failed?.id ?? "")).ok).toBe(false);
    const gom = data.find((p) => p.seller_org_id === SELLER.gomSu && p.status === "building");
    expect((await sendPayout(gom?.id ?? "")).ok).toBe(true);
  });

  it("tài khoản nhận tiền chỉ giữ 4 số cuối", async () => {
    const bad = await setPayoutAccount(SELLER.khanBong, {
      bank_name: "",
      holder_name: "",
      account_number: "12ab",
    });
    expect(!bad.ok && bad.problem.errors?.map((e) => e.field)).toEqual([
      "bank_name",
      "holder_name",
      "account_number",
    ]);
    const ok = await setPayoutAccount(SELLER.khanBong, {
      bank_name: "Ngân hàng mẫu",
      holder_name: "Khăn Bông Hạ Long",
      account_number: "0123 4567 8901",
    });
    expect(ok.ok && ok.data.payout_account).toMatchObject({ number_last4: "8901" });
    expect(JSON.stringify(ok)).not.toContain("012345678901");
  });

  it("sao kê CSV chặn công thức và có BOM", async () => {
    const csv = await statementCsv(SELLER.nhaNa);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"BM-2611-0350"');
  });

  it("đơn của người bán chỉ là đơn của nút đó", async () => {
    const page = await listSellerOrders(SELLER.gomSu);
    expect(page.data.every((o) => o.seller_org_id === SELLER.gomSu)).toBe(true);
    expect(page.data.length).toBe(4);
  });

  it("đơn lọc theo trạng thái và tìm không dấu theo mã đơn / tên người mua", async () => {
    const paid = await listSellerOrders(SELLER.gomSu, { status: "paid" });
    expect(paid.data.map((o) => o.number)).toEqual(["BM-2611-0413"]);
    const byBuyer = await listSellerOrders(SELLER.gomSu, { q: "ngoc anh" });
    expect(byBuyer.data.map((o) => o.buyer_name)).toEqual(["Võ Ngọc Ánh"]);
    const byNumber = await listSellerOrders(SELLER.gomSu, { q: "0393" });
    expect(byNumber.data.map((o) => o.number)).toEqual(["BM-2611-0393"]);
    const other = await listSellerOrders(SELLER.gomSu, { q: "0417" });
    expect(other.data).toEqual([]);
  });

  it("số đơn theo trạng thái; doanh thu 7 ngày bỏ đơn huỷ và đơn cũ", () => {
    const now = Date.parse("2026-11-17T00:00:00Z");
    const order = (status: MarketOrder["status"], daysAgo: number, total: number): MarketOrder => ({
      id: `${status}-${daysAgo}`,
      number: "BM",
      seller_org_id: "s",
      placed_at: new Date(now - daysAgo * 86_400_000).toISOString(),
      total: { amount: String(total), currency: "VND" },
      items: 1,
      buyer_name: "A",
      status,
    });
    const stats = orderStats(
      [
        order("paid", 1, 100_000),
        order("shipping", 7, 50_000),
        order("cancelled", 2, 900_000),
        order("completed", 8, 300_000),
      ],
      now,
    );
    expect(stats.by_status).toEqual({
      paid: 1,
      shipping: 1,
      delivered: 0,
      completed: 1,
      cancelled: 1,
    });
    expect(stats.revenue_7d).toEqual({ amount: "150000", currency: "VND" });
    expect(stats.orders_7d).toBe(2);
  });

  it("giao cho hãng: chỉ đơn chờ gửi của chính người bán", async () => {
    const [order] = (await listSellerOrders(SELLER.gomSu, { status: "paid" })).data;
    const foreign = await shipSellerOrder(SELLER.nhaNa, order?.id ?? "");
    expect(!foreign.ok && foreign.problem.code).toBe("marketplace.order_not_found");
    const ok = await shipSellerOrder(SELLER.gomSu, order?.id ?? "");
    expect(ok.ok && ok.data.status).toBe("shipping");
    const again = await shipSellerOrder(SELLER.gomSu, order?.id ?? "");
    expect(!again.ok && again.problem.code).toBe("marketplace.invalid_transition");
    const { data } = await sellerOrderStats(SELLER.gomSu);
    expect(data.by_status.paid).toBe(0);
    expect(data.by_status.shipping).toBe(1);
  });
});

describe("tranh chấp", () => {
  it("phân xử: hoàn một phần không vượt số đã trả; hoàn xong tính lại quyết toán", async () => {
    const { data } = await listDisputes({ status: "escalated" });
    const d = data[0];
    expect(d?.number).toBe("TC-2611-0031");
    const tooMuch = await resolveDispute(
      d?.id ?? "",
      {
        resolution: "refund_partial",
        amount: "999999",
        reason: "Hàng vỡ có ảnh chứng minh",
        acknowledged: true,
      },
      "test",
    );
    expect(!tooMuch.ok && tooMuch.problem.errors?.[0]?.code).toBe("resolution_exceeds_order");
    const missing = await resolveDispute(
      d?.id ?? "",
      { resolution: "", amount: "", reason: "", acknowledged: false },
      "test",
    );
    expect(!missing.ok && missing.problem.errors?.map((e) => e.field)).toEqual([
      "resolution",
      "reason",
      "acknowledged",
    ]);
    const done = await resolveDispute(
      d?.id ?? "",
      {
        resolution: "refund_partial",
        amount: "200000",
        reason: "Hai chiếc vỡ trong bộ sáu",
        acknowledged: true,
      },
      "test",
    );
    expect(done.ok && done.data.status).toBe("resolved");
    const st = (await listSettlements({ seller: SELLER.gomSu })).data.find(
      (x) => x.order_number === "BM-2611-0384",
    );
    expect(st?.gross.amount).toBe("220000");
    expect(
      (
        await resolveDispute(
          d?.id ?? "",
          { resolution: "reject", amount: "", reason: "Thử lại lần hai", acknowledged: true },
          "test",
        )
      ).ok,
    ).toBe(false);
  });

  it("người bán trả lời hay đồng ý hoàn; không thấy tranh chấp của người khác", async () => {
    const { data } = await listDisputes({ seller: SELLER.nhaNa, status: "open" });
    const d = data[0];
    const other = await answerDispute(SELLER.gomSu, d?.id ?? "", {
      answer: "reply",
      body: "Không phải của tôi",
    });
    expect(!other.ok && other.problem.code).toBe("marketplace.dispute_not_found");
    const short = await answerDispute(SELLER.nhaNa, d?.id ?? "", { answer: "reply", body: "ngắn" });
    expect(!short.ok && short.problem.errors?.[0]?.field).toBe("body");
    const replied = await answerDispute(SELLER.nhaNa, d?.id ?? "", {
      answer: "reply",
      body: "Shop gửi ảnh lúc đóng gói, nồi còn nguyên.",
    });
    expect(replied.ok && replied.data.status).toBe("seller_responded");
  });

  it("khiếu nại chế tài một lần", async () => {
    const { sellerPerformance } = await import("./market");
    const { data } = await sellerPerformance(SELLER.khanBong);
    const p = data.penalties[0];
    expect(data.points).toBe(3);
    expect(
      (
        await appealPenalty(SELLER.khanBong, p?.id ?? "", {
          reason: "Hãng vận chuyển lấy hàng trễ, có biên bản.",
        })
      ).ok,
    ).toBe(true);
    const again = await appealPenalty(SELLER.khanBong, p?.id ?? "", {
      reason: "Gửi lại khiếu nại lần nữa.",
    });
    expect(!again.ok && again.problem.code).toBe("marketplace.penalty_already_appealed");
  });
});

it("mời người bán: lỗi theo ô, không mời trùng", async () => {
  const bad = await inviteSeller({ email: "x", seller_type: "shop", note: "" });
  expect(!bad.ok && bad.problem.errors?.map((e) => e.field)).toEqual(["email", "seller_type"]);
  expect(
    (await inviteSeller({ email: "moi@example.com", seller_type: "household", note: "" })).ok,
  ).toBe(true);
  const again = await inviteSeller({
    email: "MOI@example.com",
    seller_type: "household",
    note: "",
  });
  expect(!again.ok && again.problem.errors?.[0]?.code).toBe("taken");
});
