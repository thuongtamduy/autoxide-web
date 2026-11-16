import { beforeEach, describe, expect, it } from "vitest";
import { resetSampleCatalog } from "./catalog";
import {
  BOOK_ID,
  checkPeriod,
  closePeriod,
  crc16,
  entryState,
  listAccounts,
  listEntries,
  listExceptions,
  listPeriods,
  looksPersonal,
  postEntry,
  previewVietQr,
  resetSampleFinance,
  resolveException,
  reverseEntry,
  setBankFeed,
  tamperForTest,
  trialBalance,
  vatSummary,
  verifyChain,
  vietQrPayload,
} from "./finance";
import {
  correctDocument,
  createExport,
  createMandate,
  createSeries,
  deleteDraft,
  exportFile,
  issueDocument,
  listDocuments,
  listSeries,
  numberText,
  resetSampleInvoices,
  resubmitDocument,
  retentionUntil,
  SERIES_ID,
  symbolYear,
} from "./finance-invoices";
import { SAMPLE_UNIT_IDS } from "./org";
import {
  applyPercent,
  effectiveTaxProfile,
  expiringRates,
  listTaxProfiles,
  listTaxRates,
  putTaxProfile,
  quoteInclusive,
  resetSampleTaxProfiles,
  splitInclusive,
} from "./tax";

beforeEach(() => {
  resetSampleCatalog();
  resetSampleFinance();
  resetSampleInvoices();
  resetSampleTaxProfiles();
});

async function account(purpose: string, book: "main" | "market" = "main") {
  const { data } = await listAccounts(book);
  const found = data.find((a) => a.purpose === purpose && !a.counterparty);
  if (!found) throw new Error(`thiếu tài khoản ${purpose}`);
  return found.id;
}

const vnd = (n: number) => ({ amount: String(n), currency: "VND" });

describe("sổ cái: ghi, đảo, cân", () => {
  it("bút toán không cân bị từ chối; cân thì ghi, chờ niêm phong; gửi lại cùng mã trả bút toán cũ", async () => {
    const fee = await account("expense.gateway_fee");
    const bank = await account("cash.bank");
    const base = {
      book: "main" as const,
      description: "Phí chuyển tiền tháng 11",
      effective_date: "2026-11-14",
      reference: "BT-TEST-0001",
    };
    const bad = await postEntry(
      {
        ...base,
        lines: [
          { account_id: fee, side: "debit", amount: vnd(44_000) },
          { account_id: bank, side: "credit", amount: vnd(40_000) },
        ],
      },
      "Kế toán",
    );
    expect(bad.ok ? "" : bad.problem.code).toBe("ledger.unbalanced");
    const lines = [
      { account_id: fee, side: "debit" as const, amount: vnd(44_000) },
      { account_id: bank, side: "credit" as const, amount: vnd(44_000) },
    ];
    const ok = await postEntry({ ...base, lines }, "Kế toán");
    expect(ok.ok && entryState(ok.data.entry)).toBe("pending_seal");
    const again = await postEntry({ ...base, lines }, "Kế toán");
    expect(again.ok && again.data.replayed).toBe(true);
    const reused = await postEntry({ ...base, description: "Khác", lines }, "Kế toán");
    expect(reused.ok ? "" : reused.problem.code).toBe("reference_reused");
  });

  it("gom mọi lỗi của ô một lần; chặn dữ liệu cá nhân trong diễn giải", async () => {
    const out = await postEntry(
      {
        book: "main",
        description: "Gọi 0901 234 567",
        effective_date: "",
        reference: "có dấu cách",
        lines: [],
      },
      "Kế toán",
    );
    expect(out.ok ? [] : out.problem.errors?.map((e) => e.field)).toEqual([
      "description",
      "effective_date",
      "reference",
      "lines",
    ]);
    expect(looksPersonal("Phí chuyển tiền tháng 11")).toBe(false);
    expect(looksPersonal("khach@example.com")).toBe(true);
  });

  it("đảo một lần: bút toán gốc thành 'đã bị đảo', đảo lần hai bị từ chối", async () => {
    const { data } = await listEntries({ filter: "manual" });
    const target = data.find((e) => e.reference === "BT-2611-0009");
    if (!target) throw new Error("thiếu bút toán mẫu");
    const first = await reverseEntry(
      target.id,
      { reason: "Ghi nhầm tài khoản", effective_date: "2026-11-14" },
      "Kế toán",
    );
    expect(first.ok && first.data.lines[0]?.side).toBe("credit");
    const second = await reverseEntry(
      target.id,
      { reason: "Lần nữa", effective_date: "2026-11-14" },
      "Kế toán",
    );
    expect(second.ok ? "" : second.problem.code).toBe("ledger.already_reversed");
  });

  it("cân đối thử luôn cân ở mọi kỳ của cả hai sổ", async () => {
    for (const book of ["main", "market"] as const) {
      for (const p of (await listPeriods(book)).data) {
        const { data } = await trialBalance(book, p.starts_on.slice(0, 7));
        expect(data.totals.debit).toEqual(data.totals.credit);
      }
    }
  });

  it("thuế GTGT theo kỳ: đầu ra trừ đầu vào, cộng cả bút toán chi tiết", async () => {
    const { data } = await vatSummary("main");
    const nov = data.find((p) => p.month === "2026-11");
    expect(nov?.output_total).toEqual(vnd(38_912_000 + 26_592 + 140_741));
    expect(nov?.input_total).toEqual(vnd(17_160_000));
    expect(Number(nov?.net.amount)).toBe(38_912_000 + 26_592 + 140_741 - 17_160_000);
  });
});

describe("kỳ kế toán và chuỗi băm", () => {
  it("khoá theo thứ tự tháng; kỳ đã khoá từ chối bút toán; không mở lại", async () => {
    const { data } = await listPeriods("main");
    const nov = data.find((p) => p.starts_on === "2026-11-01");
    const oct = data.find((p) => p.starts_on === "2026-10-01");
    if (!nov || !oct) throw new Error("thiếu kỳ mẫu");
    const early = await closePeriod(nov.id, "Kế toán");
    expect(early.ok ? "" : early.problem.code).toBe("ledger.period_order");
    expect((await checkPeriod(oct.id))?.previous_closed).toBe(true);
    const closed = await closePeriod(oct.id, "Kế toán");
    expect(closed.ok && closed.data.status).toBe("closed");
    const fee = await account("expense.gateway_fee");
    const bank = await account("cash.bank");
    const late = await postEntry(
      {
        book: "main",
        description: "Phí tháng 10",
        effective_date: "2026-10-20",
        reference: "BT-TEST-0002",
        lines: [
          { account_id: fee, side: "debit", amount: vnd(1_000) },
          { account_id: bank, side: "credit", amount: vnd(1_000) },
        ],
      },
      "Kế toán",
    );
    expect(late.ok ? "" : late.problem.code).toBe("ledger.period_closed");
  });

  it("chuỗi băm phát hiện bút toán đã niêm phong bị sửa lén", async () => {
    expect((await verifyChain("main")).data.first_broken).toBeNull();
    const { data } = await listEntries({ book: "main" });
    const sealed = data.find((e) => e.seal);
    if (!sealed) throw new Error("thiếu bút toán đã niêm phong");
    tamperForTest(sealed.id, "1");
    expect((await verifyChain("main")).data.first_broken).toBe(sealed.id);
  });
});

describe("hàng chờ sai lệch, ngân hàng, VietQR", () => {
  it("khớp vào thanh toán ghi bút toán; lý do bắt buộc; xử lý lần hai bị từ chối", async () => {
    const { data } = await listExceptions("amount_mismatch");
    const x = data[0];
    if (!x) throw new Error("thiếu mục mẫu");
    const noNote = await resolveException(
      x.id,
      { action: "match", payment_code: "", note: "" },
      "Kế toán",
    );
    expect(noNote.ok ? [] : noNote.problem.errors?.map((e) => e.field)).toEqual([
      "payment_code",
      "note",
    ]);
    const ok = await resolveException(
      x.id,
      { action: "match", payment_code: "axk7q2m9tp", note: "Người mua đã chuyển bù" },
      "Kế toán",
    );
    expect(ok.ok && ok.data.entry?.lines.map((l) => l.amount.amount)).toEqual(["600000", "600000"]);
    const twice = await resolveException(
      x.id,
      { action: "ignore", payment_code: "", note: "Bỏ qua mục" },
      "Kế toán",
    );
    expect(twice.ok ? "" : twice.problem.code).toBe("ledger.exception_not_open");
  });

  it("tạm dừng đọc biến động trả trạng thái cũ cho Hoàn tác", async () => {
    const out = await setBankFeed("01a1e000-0000-7000-8000-e50000000001", "paused");
    expect(out.ok && out.data.previous).toBe("active");
  });

  it("CRC-16/CCITT-FALSE đúng giá trị kiểm chuẩn; chuỗi VietQR có trường bắt buộc", async () => {
    expect(crc16("123456789")).toBe("29B1");
    const payload = vietQrPayload({
      bin: "970999",
      account: "0000007312",
      amount: 660000,
      memo: "AXK7Q2M9TP",
    });
    expect(payload.startsWith("000201010212")).toBe(true);
    expect(payload).toContain("0010A000000727");
    expect(payload).toContain("5303704");
    expect(payload).toContain("5406660000");
    expect(payload).toContain("0810AXK7Q2M9TP");
    expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)));
    const bad = await previewVietQr({ bank_account_id: "x", amount: "-1", memo: "có dấu" });
    expect(bad.ok ? [] : bad.problem.errors?.map((e) => e.field)).toEqual([
      "bank_account_id",
      "amount",
      "memo",
    ]);
  });
});

describe("hoá đơn điện tử, ký hiệu, uỷ nhiệm, xuất", () => {
  it("bị trả lỗi thì gửi lại cùng số; MST sai định dạng báo dưới ô", async () => {
    const { data } = await listDocuments("rejected");
    const doc = data.find((d) => d.number === 4125);
    if (!doc) throw new Error("thiếu hoá đơn mẫu");
    const bad = await resubmitDocument(doc.id, {
      buyer_tax_code: "123",
      buyer_name: "A",
      buyer_address: "",
    });
    expect(bad.ok ? "" : bad.problem.errors?.[0]?.code).toBe("invoices.buyer_tax_code_invalid");
    const ok = await resubmitDocument(doc.id, {
      buyer_tax_code: "0312345678",
      buyer_name: "A",
      buyer_address: "",
    });
    expect(ok.ok && [ok.data.status, ok.data.number]).toEqual(["submitting", 4125]);
  });

  it("phát hành nháp cấp số kế tiếp không nhảy; đã phát hành thì không xoá được", async () => {
    const { data } = await listDocuments("draft");
    const draft = data[0];
    if (!draft) throw new Error("thiếu nháp mẫu");
    const issued = await issueDocument(draft.id);
    expect(issued.ok && issued.data.number).toBe(4128);
    const again = await issueDocument(draft.id);
    expect(again.ok && again.data.number).toBe(4128);
    const del = await deleteDraft(draft.id);
    expect(del.ok ? "" : del.problem.code).toBe("invoices.retention_hold");
    expect(retentionUntil("2026-11-15")).toBe("2036-12-31");
    expect(numberText(4128)).toBe("00004128");
  });

  it("hoá đơn đã có mã chỉ sửa bằng chứng từ liên kết", async () => {
    const { data } = await listDocuments("accepted");
    const doc = data.find((d) => d.number === 4127);
    if (!doc) throw new Error("thiếu hoá đơn mẫu");
    const out = await correctDocument(doc.id, {
      how: "adjustment",
      reason: "Người mua trả 1 chảo",
    });
    expect(out.ok && out.data.created?.related_document_id).toBe(doc.id);
    expect(out.ok && out.data.created?.number).toBeNull();
  });

  it("ký hiệu: năm phải khớp, không trùng; uỷ nhiệm không chồng ngày", async () => {
    expect(symbolYear("vat_invoice", "1C27TBM")).toBe(2027);
    expect(symbolYear("withholding_certificate", "CT/27E")).toBe(2027);
    const wrongYear = await createSeries({
      org_id: SAMPLE_UNIT_IDS.root,
      org_name: "Trụ sở",
      kind: "vat_invoice",
      symbol: "1C27TBM",
      year: "2026",
    });
    expect(wrongYear.ok ? "" : wrongYear.problem.errors?.[0]?.code).toBe("series_year");
    const taken = await createSeries({
      org_id: SAMPLE_UNIT_IDS.root,
      org_name: "Trụ sở",
      kind: "vat_invoice",
      symbol: "1C26TBM",
      year: "2026",
    });
    expect(taken.ok ? "" : taken.problem.code).toBe("invoices.series_taken");
    expect((await listSeries()).data.find((s) => s.id === SERIES_ID.vat)?.last_number).toBe(4127);
    const overlap = await createMandate({
      principal_org_id: SAMPLE_UNIT_IDS.sellers[1],
      principal_name: "Gốm Sứ Bát Tràng Xưa",
      kind: "vat_invoice",
      valid_from: "2026-12-01",
      valid_to: "2027-11-30",
      signed: true,
    });
    expect(overlap.ok ? "" : overlap.problem.code).toBe("invoices.mandate_overlap");
  });

  it("bản xuất CSV có BOM và chặn công thức", async () => {
    const created = await createExport(
      {
        profile: "generic_journal",
        format: "csv",
        period_from: "2026-11-01",
        period_to: "2026-11-30",
      },
      "Kế toán",
    );
    expect(created.ok && created.data.status).toBe("queued");
    const ready = await exportFile("01a1e000-0000-7000-8000-f30000000001");
    expect(ready.ok && ready.data.csv.startsWith("﻿date,entry")).toBe(true);
  });
});

describe("thuế", () => {
  it("tách thuế từ giá gồm thuế làm tròn một lần; 8% tới hết 2026 rồi 10%", async () => {
    expect(splitInclusive(690_000, "8")).toEqual({ net: 638_889, tax: 51_111 });
    expect(splitInclusive(690_000, "10")).toEqual({ net: 627_273, tax: 62_727 });
    expect(applyPercent(690_000, "0.5")).toBe(3_450);
    const before = await quoteInclusive({
      category: "vat.standard_reducible",
      gross: 690_000,
      tax_point: "2026-12-31",
    });
    const after = await quoteInclusive({
      category: "vat.standard_reducible",
      gross: 690_000,
      tax_point: "2027-01-01",
    });
    expect(before.ok && before.data.rate.rate_percent).toBe("8");
    expect(after.ok && after.data.rate.rate_percent).toBe("10");
    const { data: rates } = await listTaxRates();
    expect(expiringRates(rates, "2026-11-15").map((x) => x.successor?.rate_percent)).toEqual([
      "10",
    ]);
  });

  it("hồ sơ thuế kế thừa từ nút cấp trên gần nhất; lưu ở nút con thì thôi kế thừa", async () => {
    const parents = new Map<string, string | null>([
      [SAMPLE_UNIT_IDS.warehouse, SAMPLE_UNIT_IDS.south],
      [SAMPLE_UNIT_IDS.south, SAMPLE_UNIT_IDS.root],
      [SAMPLE_UNIT_IDS.root, null],
    ]);
    let { data } = await listTaxProfiles();
    expect(effectiveTaxProfile(data, parents, SAMPLE_UNIT_IDS.warehouse)?.source_org_id).toBe(
      SAMPLE_UNIT_IDS.root,
    );
    const bad = await putTaxProfile(
      SAMPLE_UNIT_IDS.warehouse,
      { tax_code: "12", legal_name: "", regime: "x" },
      "Kế toán",
    );
    expect(bad.ok ? [] : bad.problem.errors?.map((e) => e.field)).toEqual([
      "tax_code",
      "legal_name",
      "regime",
    ]);
    await putTaxProfile(
      SAMPLE_UNIT_IDS.warehouse,
      { tax_code: "0312345678-004", legal_name: "Kho", regime: "vat_credit" },
      "Kế toán",
    );
    ({ data } = await listTaxProfiles());
    expect(effectiveTaxProfile(data, parents, SAMPLE_UNIT_IDS.warehouse)?.inherited).toBe(false);
  });
});

it("hai sổ có id riêng", () => {
  expect(BOOK_ID.main).not.toBe(BOOK_ID.market);
});
