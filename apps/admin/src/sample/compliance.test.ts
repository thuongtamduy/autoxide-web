import { afterEach, describe, expect, it } from "vitest";
import {
  advanceIncident,
  approveKyc,
  getChecklist,
  getOverview,
  listComplianceWebsites,
  listKycProfiles,
  openIncident,
  recordDecision,
  recordSubmission,
  rejectKyc,
  resetSampleCompliance,
  updateLegalProfile,
  updatePolicies,
} from "./compliance";
import {
  createSubjectRequest,
  decideCase,
  documentState,
  listCases,
  listDocuments,
  moveSubjectRequest,
  publishVersion,
  resetSampleComplianceRecords,
  restrictCase,
  retentionNeedsReview,
  setPurposeActive,
} from "./compliance-records";
import { addBusinessDays, ruleAt, ruleHistory } from "./compliance-rules";
import { resetContentSample } from "./content";

afterEach(async () => {
  resetContentSample();
  resetSampleComplianceRecords();
  await resetSampleCompliance();
});

async function sites() {
  const { data } = await listComplianceWebsites();
  const sales = data.find((s) => s.website_kind === "sales");
  const platform = data.find((s) => s.website_kind === "platform");
  if (!sales || !platform) throw new Error("thiếu website mẫu");
  return { sales, platform };
}

describe("bộ quy định có ngày hiệu lực", () => {
  it("chọn phiên bản theo ngày; danh sách kiểm có lịch sử phiên bản", () => {
    expect(ruleAt("moit.checklist.sales", "2026-06-30")?.version).toBe(1);
    expect(ruleAt("moit.checklist.sales", "2026-07-01")?.version).toBe(2);
    expect(ruleAt("kyc.required_activities", "2026-06-30")).toBeUndefined();
    expect(ruleHistory("moit.checklist.platform").map((r) => r.version)).toEqual([2, 1]);
  });

  it("ngày làm việc bỏ thứ Bảy, Chủ nhật", () => {
    // Thứ Sáu 13/11/2026 + 1 ngày làm việc = thứ Hai 16/11.
    expect(addBusinessDays(new Date("2026-11-13T09:00:00Z"), 1).toISOString().slice(0, 10)).toBe(
      "2026-11-16",
    );
  });
});

describe("website TMĐT và hồ sơ Bộ Công Thương", () => {
  it("danh sách kiểm đọc trang bắt buộc của Nội dung: bản nháp chưa đăng là thiếu", async () => {
    const { platform } = await sites();
    const list = await getChecklist(platform.id);
    if (!list.ok) throw new Error("không có danh sách kiểm");
    const rules = list.data.items.find((i) => i.key === "page.platform_rules");
    expect(rules).toMatchObject({ result: "missing", reason: "draft" });
    expect(list.data.items.find((i) => i.type === "fact")?.result).toBe("unknown");
  });

  it("ghi nộp: gom lỗi theo ô; rồi ghi kết quả với link logo của cơ quan", async () => {
    const { platform, sales } = await sites();
    const bad = await recordSubmission(platform.id, {
      reference: "",
      submitted_on: "2999-01-01",
      acknowledged: false,
    });
    expect(bad.ok ? [] : bad.problem.errors?.map((e) => e.field)).toEqual([
      "reference",
      "submitted_on",
      "acknowledged",
    ]);
    const done = await recordSubmission(sales.id, {
      reference: "X",
      submitted_on: "2026-11-01",
      acknowledged: true,
    });
    expect(done.ok ? "" : done.problem.code).toBe("compliance.website_state_invalid");
    expect(
      (
        await recordSubmission(platform.id, {
          reference: "HS-1",
          submitted_on: "2026-11-14",
          acknowledged: true,
        })
      ).ok,
    ).toBe(true);
    const wrong = await recordDecision(platform.id, {
      status: "registered",
      link_url: "https://example.com/logo",
      image_url: "http://x",
    });
    expect(wrong.ok ? [] : wrong.problem.errors?.map((e) => e.code)).toEqual([
      "logo_link",
      "https_url",
    ]);
    const ok = await recordDecision(platform.id, {
      status: "registered",
      link_url: "https://online.gov.vn/Home/WebDetails/1",
      image_url: "https://online.gov.vn/logo.png",
    });
    expect(ok.ok && ok.data.moit_status).toBe("registered");
  });

  it("hồ sơ pháp lý kiểm mã số thuế và email", async () => {
    const input = {
      entity_type: "company" as const,
      legal_name: "Công ty mẫu",
      trade_name: "",
      tax_code: "[MÃ SỐ THUẾ MẪU]",
      registration_number: "1",
      representative_name: "A",
      representative_title: "",
      province_code: "79",
      commune_name: "Phường Xuân Hoà",
      line: "1",
      phone: "1",
      email: "sai",
    };
    const bad = await updateLegalProfile("01a1e000-0000-7000-8000-0000000ep00", input);
    expect(bad.ok ? [] : bad.problem.errors?.map((e) => e.field)).toEqual(["tax_code", "email"]);
  });
});

describe("KYC, sự cố, chính sách", () => {
  it("duyệt và trả lại hồ sơ đang chờ; trả lại cần lý do", async () => {
    const [first, second] = (await listKycProfiles({ status: "pending" })).data;
    if (!first || !second) throw new Error("thiếu hồ sơ chờ");
    const approved = await approveKyc(first.id);
    expect(approved.ok && approved.data.status).toBe("verified");
    expect((await approveKyc(first.id)).ok).toBe(false);
    const noReason = await rejectKyc(second.id, { reason_code: "", note: "" });
    expect(noReason.ok ? "" : noReason.problem.errors?.[0]?.field).toBe("reason_code");
    expect((await rejectKyc(second.id, { reason_code: "name_mismatch", note: "" })).ok).toBe(true);
  });

  it("sự cố: hạn = phát hiện + 72 giờ của quy tắc; báo cơ quan cần số văn bản; một sự cố mở mỗi lúc", async () => {
    const bad = await openIncident({
      description: "ngắn",
      severity: "x",
      data_categories: [],
      affected_count: "a",
    });
    expect(bad.ok ? [] : bad.problem.errors?.map((e) => e.field)).toEqual([
      "data_categories",
      "description",
      "severity",
      "affected_count",
    ]);
    const made = await openIncident({
      description: "Lộ tệp xuất đơn hàng",
      severity: "high",
      data_categories: ["contact"],
      affected_count: "",
    });
    if (!made.ok) throw new Error("không ghi được sự cố");
    expect(Date.parse(made.data.report_due_at) - Date.parse(made.data.detected_at)).toBe(
      72 * 3_600_000,
    );
    const second = await openIncident({
      description: "Sự cố thứ hai",
      severity: "low",
      data_categories: ["address"],
      affected_count: "",
    });
    expect(second.ok ? "" : second.problem.code).toBe("compliance.incident_open");
    const noRef = await advanceIncident(made.data.id, "notify_authority");
    expect(noRef.ok ? "" : noRef.problem.errors?.[0]?.field).toBe("authority_reference");
    const reported = await advanceIncident(made.data.id, "notify_authority", "CV-1");
    expect(reported.ok && reported.data.status).toBe("reported");
    expect((await getOverview()).data.find((t) => t.area === "privacy")?.tone).toBe("bad");
  });

  it("phát trực tiếp bán hàng phải định danh khi quy tắc KYC có hiệu lực", async () => {
    const bad = await updatePolicies({
      "posting.livestream": "phone",
      "posting.max_accounts_per_phone": "0",
    });
    expect(bad.ok ? [] : bad.problem.errors?.map((e) => e.code)).toEqual([
      "identity_required",
      "range_1_10",
    ]);
  });
});

describe("hồ sơ và dữ liệu cá nhân", () => {
  it("phát hành văn bản chỉ từ trang đã đăng; bản tương lai là chờ hiệu lực", async () => {
    const doc = (await listDocuments()).data.find((d) => d.kind === "terms_of_use");
    if (!doc) throw new Error("thiếu văn bản");
    const base = {
      source_entry_id: "p1",
      source_title: "Điều khoản",
      published: ["p2"],
      locale: "vi",
      effective_from: "2999-01-01",
      requires_reacceptance: true,
      acknowledged: false,
    };
    const bad = await publishVersion(doc.id, base);
    expect(bad.ok ? [] : bad.problem.errors?.map((e) => `${e.field}:${e.code}`)).toEqual([
      "source_entry_id:not_published",
      "acknowledged:acknowledge",
    ]);
    const ok = await publishVersion(doc.id, { ...base, published: ["p1"], acknowledged: true });
    expect(ok.ok && ok.data.version).toBe(3);
    const after = (await listDocuments()).data.find((d) => d.id === doc.id);
    expect(after && documentState(after)).toBe("scheduled");
  });

  it("mục đích theo nghĩa vụ pháp lý không tắt được; tắt rồi bật lại được", async () => {
    const locked = await setPurposeActive("legal.accounting", false);
    expect(locked.ok ? "" : locked.problem.code).toBe("compliance.purpose_required_by_law");
    const off = await setPurposeActive("marketing", false);
    expect(off.ok && off.data.previous).toBe(true);
    expect((await setPurposeActive("marketing", true)).ok).toBe(true);
  });

  it("hạn lưu: dữ liệu cá nhân giữ mãi là cần xem; dữ liệu bảo mật thì không", () => {
    const base = { name: "x", module: "x", setting: null, limit_days: 365 };
    expect(retentionNeedsReview({ ...base, category: "basic", keep_days: null })).toBe(true);
    expect(retentionNeedsReview({ ...base, category: "basic", keep_days: 400 })).toBe(true);
    expect(retentionNeedsReview({ ...base, category: "security", keep_days: null })).toBe(false);
  });

  it("vụ việc: ẩn tạm rồi quyết định; quyết định cần lý do và không quyết lại được", async () => {
    const received = (await listCases({ status: "received" })).data[0];
    const review = (await listCases({ status: "under_review" })).data[0];
    if (!received || !review) throw new Error("thiếu vụ việc");
    const restricted = await restrictCase(received.id);
    expect(restricted.ok && restricted.data).toMatchObject({
      status: "under_review",
      previous: "received",
    });
    const short = await decideCase(review.id, { decision: "upheld", reason: "ngắn" });
    expect(short.ok ? "" : short.problem.errors?.[0]?.field).toBe("reason");
    expect(
      (await decideCase(review.id, { decision: "rejected", reason: "Đã có giấy chứng nhận" })).ok,
    ).toBe(true);
    const again = await decideCase(review.id, { decision: "upheld", reason: "Quyết lại lần nữa" });
    expect(again.ok ? "" : again.problem.code).toBe("compliance.case_state_invalid");
  });

  it("yêu cầu của chủ thể: kiểm email / số; hạn theo quy tắc; đã trả lời thì không mở lại", async () => {
    const bad = await createSubjectRequest(
      { kind: "erase", channel: "email", subject: "abc", note: "" },
      "A",
    );
    expect(bad.ok ? [] : bad.problem.errors?.map((e) => e.field)).toEqual(["subject", "note"]);
    const made = await createSubjectRequest(
      {
        kind: "withdraw",
        channel: "in_store",
        subject: "Nguoi@Example.com",
        note: "Không nhận SMS",
      },
      "A",
    );
    if (!made.ok) throw new Error("không ghi được yêu cầu");
    expect(made.data.subject).toBe("nguoi@example.com");
    expect(Date.parse(made.data.due_at) - Date.parse(made.data.received_at)).toBe(86_400_000);
    const noReason = await moveSubjectRequest(made.data.id, "rejected", "");
    expect(noReason.ok ? "" : noReason.problem.errors?.[0]?.field).toBe("reason");
    expect((await moveSubjectRequest(made.data.id, "in_progress")).ok).toBe(true);
    expect((await moveSubjectRequest(made.data.id, "done")).ok).toBe(true);
    const reopen = await moveSubjectRequest(made.data.id, "in_progress");
    expect(reopen.ok ? "" : reopen.problem.code).toBe("compliance.request_state_invalid");
  });
});
