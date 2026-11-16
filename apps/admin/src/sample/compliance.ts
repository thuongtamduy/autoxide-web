// Dữ liệu mẫu cho màn "Tình trạng tuân thủ" (W-006, W-012): website TMĐT theo tên miền và hồ sơ Bộ
// Công Thương, danh sách kiểm có phiên bản, định danh KYC người bán, sự cố dữ liệu cá nhân, hồ sơ
// pháp lý và chính sách của khách. Hình dạng theo đặc tả bước 37 của core
// (`docs/steps/37-compliance.md`, mục A2–A4). Một bộ dữ liệu cho cả ứng dụng: website và trang bắt
// buộc lấy từ `content.ts`, nút người bán từ `org.ts`, văn bản từ `compliance-records.ts`.
//
// Lệnh ghi đổi một kho trong bộ nhớ của tiến trình máy chủ; khởi động lại thì về ban đầu.
import type { Problem } from "@autoxide/sdk";
import {
  currentVersion,
  listCases,
  listDocuments,
  listSubjectRequests,
} from "./compliance-records";
import { type ChecklistRuleItem, dayOf, type Localized, RULESET, ruleAt } from "./compliance-rules";
import { listWebsites, websiteChecklist } from "./content";
import { getCommentPolicy, type PostingLevel } from "./engage";
import { listUnits, SAMPLE_PROVINCES, SAMPLE_UNIT_IDS, type SampleOutcome } from "./org";

const DAY = 86_400_000;
const HOUR = 3_600_000;

function at(offset: number): string {
  return new Date(Date.now() + offset).toISOString();
}

function failed(status: number, code: string, detail: string): SampleOutcome<never> {
  return { ok: false, problem: { type: "about:blank", title: "Error", status, code, detail } };
}

function invalid(errors: NonNullable<Problem["errors"]>): SampleOutcome<never> {
  return {
    ok: false,
    problem: {
      type: "about:blank",
      title: "Unprocessable Entity",
      status: 422,
      code: "validation_failed",
      detail: "The request has invalid fields.",
      errors,
    },
  };
}

// ---------------------------------------------------------------- Kiểu

export type MoitStatus =
  | "not_submitted"
  | "submitted"
  | "needs_supplement"
  | "notified"
  | "registered"
  | "rejected";

/** Hồ sơ Bộ Công Thương của một website (`compliance_websites`). */
export interface MoitRecord {
  website_id: string;
  moit_status: MoitStatus;
  moit_reference: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  logo_link_url: string | null;
  logo_image_url: string | null;
  updated_at: string;
}

/** Website kèm hồ sơ (`GET /api/v1/compliance/websites`). */
export interface ComplianceWebsite extends MoitRecord {
  id: string;
  domain: string;
  website_kind: "sales" | "platform";
  org: { id: string; name: string };
}

export type ItemResult = "met" | "missing" | "unknown" | "manual";

/** Một dòng của `GET /api/v1/compliance/websites/{id}/checklist`. */
export interface ChecklistResult {
  key: string;
  title: Localized;
  type: ChecklistRuleItem["check"]["type"];
  result: ItemResult;
  /** Vì sao chưa đạt, cho người đọc: `draft` = có bản nháp chưa đăng. */
  reason: "draft" | "not_registered" | null;
  legal_basis: string;
  needs_legal_review: boolean;
}

export interface WebsiteChecklist {
  website_id: string;
  rule_key: string;
  version: number;
  effective_from: string;
  legal_basis: string;
  needs_legal_review: boolean;
  items: ChecklistResult[];
}

export type EntityType = "company" | "household_business" | "individual";

/** Hồ sơ pháp lý (`compliance_legal_profiles`); `org_id = null` là hồ sơ cấp khách. */
export interface LegalProfile {
  id: string;
  org_id: string | null;
  name: string;
  entity_type: EntityType;
  legal_name: string;
  trade_name: string;
  tax_code: string;
  registration_number: string;
  representative_name: string;
  representative_title: string;
  address: { province_code: string; province_name: string; commune_name: string; line: string };
  phone: string;
  email: string;
  kyc_profile_id: string | null;
  updated_at: string;
}

export type ProfileInput = Omit<
  LegalProfile,
  "id" | "org_id" | "name" | "address" | "kyc_profile_id" | "updated_at"
> & { province_code: string; commune_name: string; line: string };

/** Chính sách của khách (`GET /api/v1/compliance/policies`). */
export interface Policies {
  "complaints.contact": string;
  "privacy.contact": string;
  "posting.reviews": PostingLevel;
  "posting.livestream": PostingLevel;
  "posting.max_accounts_per_phone": number;
  updated_at: string;
}

/** Mức xác thực của người mua (đề xuất "mới": số đếm cho màn chính sách đăng nội dung). */
export interface VerificationStats {
  buyers: number;
  phone_verified: number;
  identity_verified: number;
}

export type KycStatus = "draft" | "pending" | "verified" | "rejected" | "expired" | "revoked";
export const KYC_REASONS = [
  "documents_missing",
  "document_unreadable",
  "name_mismatch",
  "duplicate_document",
  "other",
] as const;

/** Hồ sơ định danh (`GET /api/v1/compliance/kyc/profiles`). */
export interface KycProfile {
  id: string;
  subject_kind: "org" | "user";
  subject_id: string;
  /** Dự kiến API trả kèm tên chủ thể để danh sách khỏi gọi thêm. */
  subject_name: string;
  party_type: "individual" | "household_business" | "organization";
  method: "vneid" | "ekyc" | "business_registry" | "manual";
  activity: "sell" | "livestream" | "affiliate";
  status: KycStatus;
  /** Cảnh báo của người xét: hồ sơ còn thiếu giấy tờ (vẫn `pending`). */
  documents_missing: boolean;
  reason_code: string | null;
  verified_name: string | null;
  document_last4: string | null;
  verified_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export type IncidentStatus = "open" | "contained" | "reported" | "closed";
export const INCIDENT_CATEGORIES = ["contact", "address", "order_history", "identity"] as const;

/** Sự cố dữ liệu cá nhân (`GET /api/v1/compliance/incidents`). */
export interface Incident {
  id: string;
  reference: string;
  description: string;
  severity: "low" | "medium" | "high";
  status: IncidentStatus;
  /** Lưu lúc ghi nhận, không sửa được về sau. */
  detected_at: string;
  report_due_at: string;
  authority_notified_at: string | null;
  authority_reference: string | null;
  subjects_notified_at: string | null;
  data_categories: string[];
  affected_count: number | null;
  entries: { at: string; text: string }[];
  updated_at: string;
}

export interface NewIncident {
  description: string;
  severity: string;
  data_categories: string[];
  affected_count: string;
}

// ---------------------------------------------------------------- Kho

interface Store {
  moit: MoitRecord[];
  profiles: LegalProfile[];
  policies: Policies;
  kyc: KycProfile[];
  incidents: Incident[];
}

const id = (n: string) => `01a1e000-0000-7000-8000-0000000e${n}`;

function seed(websiteIds: readonly string[]): Store {
  const [main, market] = websiteIds;
  const sellers = SAMPLE_UNIT_IDS.sellers;
  const kyc = (
    n: string,
    seller: number,
    name: string,
    party: KycProfile["party_type"],
    method: KycProfile["method"],
    activity: KycProfile["activity"],
    status: KycStatus,
    days: number,
    missing = false,
  ): KycProfile => ({
    id: id(`k${n}`),
    subject_kind: "org",
    subject_id: sellers[seller] as string,
    subject_name: name,
    party_type: party,
    method,
    activity,
    status,
    documents_missing: missing,
    reason_code: null,
    verified_name: status === "verified" ? name : null,
    document_last4: status === "verified" ? "0000" : null,
    verified_at: status === "verified" ? at(days * DAY) : null,
    expires_at: status === "verified" ? at((days + 730) * DAY) : null,
    created_at: at(days * DAY),
    updated_at: at(days * DAY),
  });
  const profile = (
    n: string,
    org: string | null,
    name: string,
    entity: EntityType,
    kycId: string | null,
  ): LegalProfile => ({
    id: id(`p${n}`),
    org_id: org,
    name,
    entity_type: entity,
    legal_name: org ? name : "Công ty TNHH Bếp Mộc (mẫu)",
    trade_name: name,
    tax_code: "[MÃ SỐ THUẾ MẪU]",
    registration_number: "[SỐ ĐĂNG KÝ MẪU]",
    representative_name: org ? "[NGƯỜI ĐẠI DIỆN MẪU]" : "Trương Đức Anh",
    representative_title: org ? "Chủ hộ" : "Giám đốc",
    address: {
      province_code: "79",
      province_name: "TP. Hồ Chí Minh",
      commune_name: "Phường Xuân Hoà",
      line: "[Số nhà, đường mẫu]",
    },
    phone: "[SỐ ĐIỆN THOẠI MẪU]",
    email: org ? "seller@example.com" : "phapche@example.com",
    kyc_profile_id: kycId,
    updated_at: at(-20 * DAY),
  });
  return {
    moit: [
      {
        website_id: main as string,
        moit_status: "notified",
        moit_reference: "[SỐ HỒ SƠ MẪU]",
        submitted_at: at(-120 * DAY),
        decided_at: at(-110 * DAY),
        logo_link_url: "https://online.gov.vn/Home/WebDetails/0000",
        logo_image_url: "https://online.gov.vn/Content/EndUser/LogoCCDVSaleNoti/logoSaleNoti.png",
        updated_at: at(-110 * DAY),
      },
      {
        website_id: market as string,
        moit_status: "not_submitted",
        moit_reference: null,
        submitted_at: null,
        decided_at: null,
        logo_link_url: null,
        logo_image_url: null,
        updated_at: at(-30 * DAY),
      },
    ],
    profiles: [
      profile("00", null, "Bếp Mộc", "company", id("k00")),
      profile("01", sellers[0] as string, "Gia Dụng Nhà Na", "household_business", id("k01")),
      profile("02", sellers[1] as string, "Gốm Sứ Bát Tràng Xưa", "company", id("k02")),
      profile("06", sellers[5] as string, "Khăn Bông Hạ Long", "household_business", id("k06")),
    ],
    policies: {
      "complaints.contact": "hotro@example.com",
      "privacy.contact": "phapche@example.com",
      "posting.reviews": "phone",
      "posting.livestream": "identity",
      "posting.max_accounts_per_phone": 1,
      updated_at: at(-12 * DAY),
    },
    kyc: [
      {
        ...kyc("00", 0, "Bếp Mộc", "organization", "business_registry", "sell", "verified", -270),
        subject_id: SAMPLE_UNIT_IDS.root,
      },
      kyc("01", 0, "Gia Dụng Nhà Na", "household_business", "vneid", "sell", "pending", -2),
      kyc(
        "02",
        1,
        "Gốm Sứ Bát Tràng Xưa",
        "organization",
        "business_registry",
        "sell",
        "pending",
        -1,
      ),
      kyc("03", 2, "Bếp Nhà Thỏ", "individual", "vneid", "livestream", "pending", -1),
      kyc(
        "04",
        3,
        "Dao Kéo Đa Sỹ Truyền Thống",
        "household_business",
        "ekyc",
        "sell",
        "pending",
        -3,
        true,
      ),
      kyc(
        "05",
        4,
        "Thực Phẩm Sạch An Nhiên",
        "organization",
        "business_registry",
        "sell",
        "pending",
        -4,
        true,
      ),
      kyc("06", 5, "Khăn Bông Hạ Long", "household_business", "ekyc", "sell", "verified", -200),
      // Thêm cho màn Vận hành sàn (W-018): hồ sơ cũ của người bán đã bán trên Chợ Bếp Mộc. Gốm Sứ
      // còn hạn (hồ sơ "pending" ở trên là lần xác thực lại khi đổi người đại diện); Gia Dụng Nhà Na
      // hết hạn 14 ngày trước nên sàn tạm khoá tới khi hồ sơ mới được duyệt; Bếp Nhà Thỏ đã xác thực
      // để bán (hồ sơ "pending" ở trên là cho bán qua livestream).
      kyc(
        "07",
        1,
        "Gốm Sứ Bát Tràng Xưa",
        "organization",
        "business_registry",
        "sell",
        "verified",
        -250,
      ),
      {
        ...kyc("08", 0, "Gia Dụng Nhà Na", "household_business", "ekyc", "sell", "verified", -744),
        status: "expired",
      },
      kyc("09", 2, "Bếp Nhà Thỏ", "individual", "vneid", "sell", "verified", -3),
    ],
    incidents: [
      {
        id: id("i001"),
        reference: "SC-2609-01",
        description: "Lộ danh sách email người đăng ký bản tin qua tệp xuất để nhầm chỗ công khai.",
        severity: "medium",
        status: "closed",
        detected_at: at(-60 * DAY),
        report_due_at: at(-60 * DAY + 72 * HOUR),
        authority_notified_at: at(-59 * DAY),
        authority_reference: "[SỐ VĂN BẢN MẪU]",
        subjects_notified_at: at(-59 * DAY),
        data_categories: ["contact"],
        affected_count: 212,
        entries: [
          { at: at(-58 * DAY), text: "closed" },
          { at: at(-59 * DAY), text: "notify_authority" },
          { at: at(-60 * DAY + 2 * HOUR), text: "contain" },
          { at: at(-60 * DAY), text: "opened" },
        ],
        updated_at: at(-58 * DAY),
      },
    ],
  };
}

const KEY = Symbol.for("autoxide.sample.compliance");
type Holder = { [KEY]?: Store };

async function store(): Promise<Store> {
  const holder = globalThis as Holder;
  if (!holder[KEY]) {
    const { data } = await listWebsites();
    holder[KEY] = seed(data.map((w) => w.id));
  }
  return holder[KEY];
}

/** Về dữ liệu ban đầu (test). */
export async function resetSampleCompliance(): Promise<void> {
  const { data } = await listWebsites();
  (globalThis as Holder)[KEY] = seed(data.map((w) => w.id));
}

// ---------------------------------------------------------------- Website và hồ sơ Bộ Công Thương

/** Thay bằng GET /api/v1/compliance/websites (bước 37) khi core có. */
export async function listComplianceWebsites(): Promise<{ data: ComplianceWebsite[] }> {
  const [{ data: sites }, { moit }] = await Promise.all([listWebsites(), store()]);
  const owners = [SAMPLE_UNIT_IDS.root, SAMPLE_UNIT_IDS.market];
  const { data: units } = await listUnits();
  return {
    data: sites.flatMap((site, index) => {
      const record = moit.find((m) => m.website_id === site.id);
      if (!record) return [];
      const unit = units.find((u) => u.id === owners[index]);
      return [
        {
          ...record,
          id: site.id,
          domain: site.domain,
          website_kind: site.website_kind,
          org: { id: unit?.id ?? site.org.id, name: unit?.name ?? site.org.name },
        },
      ];
    }),
  };
}

/** Nghĩa vụ theo loại website: website bán hàng thông báo, sàn đăng ký. */
export function moitDuty(kind: ComplianceWebsite["website_kind"]): "notify" | "register" {
  return kind === "sales" ? "notify" : "register";
}

/**
 * Thay bằng GET /api/v1/compliance/websites/{id}/checklist (bước 37) khi core có. Danh sách kiểm là
 * bản `moit.checklist.<loại>` có hiệu lực hôm nay; mỗi mục kiểm theo dữ liệu thật của khách.
 */
export async function getChecklist(websiteId: string): Promise<SampleOutcome<WebsiteChecklist>> {
  const { data: sites } = await listComplianceWebsites();
  const site = sites.find((s) => s.id === websiteId);
  if (!site) return failed(404, "compliance.website_not_found", "No website has this id.");
  const ruleKey = `moit.checklist.${site.website_kind}`;
  const rule = ruleAt<ChecklistRuleItem[]>(ruleKey);
  if (!rule) return failed(404, "compliance.rules_missing", `No ${ruleKey} in effect.`);
  const [pages, { data: documents }, s] = await Promise.all([
    websiteChecklist(websiteId),
    listDocuments(),
    store(),
  ]);
  const tenant = s.profiles.find((p) => p.org_id === null);
  const tenantKyc = s.kyc.find((k) => k.id === tenant?.kyc_profile_id);
  const items = rule.body.map((item): ChecklistResult => {
    let result: ItemResult = "missing";
    let reason: ChecklistResult["reason"] = null;
    const check = item.check;
    if (check.type === "profile_field") {
      result =
        tenant && check.fields.every((f) => String(tenant[f as keyof LegalProfile] ?? "").trim())
          ? "met"
          : "missing";
    } else if (check.type === "page") {
      const page = pages.ok ? pages.data.pages.find((p) => p.page_kind === check.page_kind) : null;
      result = page?.status === "published" ? "met" : "missing";
      if (page?.status === "draft") reason = "draft";
    } else if (check.type === "document") {
      const doc = documents.find((d) => d.kind === check.kind);
      result = doc && currentVersion(doc) ? "met" : "missing";
    } else if (check.type === "kyc") {
      result = tenantKyc?.status === "verified" ? "met" : "missing";
    } else if (check.type === "policy") {
      result = String(s.policies[check.key as keyof Policies] ?? "").trim() ? "met" : "missing";
    } else if (check.type === "fact") {
      // Chưa module nào khai fact này (bước 46 của sàn): core trả `unknown`.
      result = "unknown";
      reason = "not_registered";
    } else {
      result = "manual";
    }
    return {
      key: item.key,
      title: item.title,
      type: check.type,
      result,
      reason,
      legal_basis: item.legal_basis,
      needs_legal_review: item.needs_legal_review,
    };
  });
  return {
    ok: true,
    data: {
      website_id: websiteId,
      rule_key: ruleKey,
      version: rule.version,
      effective_from: rule.effective_from,
      legal_basis: rule.legal_basis,
      needs_legal_review: rule.needs_legal_review,
      items,
    },
  };
}

/**
 * Thay bằng GET /api/v1/compliance/websites/{id}/dossier (bước 37) khi core có: các trường của tờ
 * khai điền từ hồ sơ thật, danh sách kiểm, lời nhắc cần người có chuyên môn pháp lý duyệt.
 */
export async function getDossier(
  websiteId: string,
): Promise<SampleOutcome<Record<string, unknown>>> {
  const checklist = await getChecklist(websiteId);
  if (!checklist.ok) return checklist;
  const [{ data: sites }, s, { data: documents }] = await Promise.all([
    listComplianceWebsites(),
    store(),
    listDocuments(),
  ]);
  const site = sites.find((w) => w.id === websiteId);
  const tenant = s.profiles.find((p) => p.org_id === null);
  return {
    ok: true,
    data: {
      sample: true,
      ruleset: `${RULESET.jurisdiction} ${RULESET.release}`,
      website: site,
      form: tenant ? { ...tenant, id: undefined, kyc_profile_id: undefined } : null,
      documents: documents.map((d) => ({
        kind: d.kind,
        title: d.title,
        current_version: currentVersion(d)?.version ?? null,
      })),
      checklist: checklist.data,
      generated_at: new Date().toISOString(),
      disclaimer:
        "Draft prepared from the configuration. A person with legal expertise must review it before submission.",
    },
  };
}

const GOV_LINK = /^https:\/\/online\.gov\.vn\/\S+$/;
const HTTPS = /^https:\/\/\S+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Thay bằng POST /api/v1/compliance/websites/{id}/status `{status: "submitted", reference}` (bước 37)
 * khi core có. Hồ sơ nộp trên cổng của Bộ Công Thương do người làm; ở đây chỉ ghi lại, không hoàn
 * tác được.
 */
export async function recordSubmission(
  websiteId: string,
  input: { reference: string; submitted_on: string; acknowledged: boolean },
): Promise<SampleOutcome<MoitRecord>> {
  const record = (await store()).moit.find((m) => m.website_id === websiteId);
  if (!record) return failed(404, "compliance.website_not_found", "No website has this id.");
  if (!["not_submitted", "needs_supplement"].includes(record.moit_status)) {
    return failed(409, "compliance.website_state_invalid", `The dossier is ${record.moit_status}.`);
  }
  const errors: NonNullable<Problem["errors"]> = [];
  if (!input.reference.trim()) {
    errors.push({ field: "reference", code: "required", detail: "must not be empty" });
  }
  if (!DATE.test(input.submitted_on)) {
    errors.push({ field: "submitted_on", code: "required", detail: "must be a date" });
  } else if (input.submitted_on > dayOf()) {
    errors.push({
      field: "submitted_on",
      code: "future_date",
      detail: "must not be in the future",
    });
  }
  if (!input.acknowledged) {
    errors.push({ field: "acknowledged", code: "acknowledge", detail: "must be confirmed" });
  }
  if (errors.length > 0) return invalid(errors);
  record.moit_status = "submitted";
  record.moit_reference = input.reference.trim();
  record.submitted_at = `${input.submitted_on}T00:00:00Z`;
  record.updated_at = new Date().toISOString();
  return { ok: true, data: { ...record } };
}

/**
 * Thay bằng POST /api/v1/compliance/websites/{id}/status (bước 37) khi core có. Kết quả do cơ quan
 * gửi: đã thông báo (website bán hàng) / đã đăng ký (sàn) kèm link và ảnh logo, cần bổ sung, từ chối.
 */
export async function recordDecision(
  websiteId: string,
  input: { status: string; link_url: string; image_url: string },
): Promise<SampleOutcome<MoitRecord>> {
  const { data: sites } = await listComplianceWebsites();
  const site = sites.find((w) => w.id === websiteId);
  const record = (await store()).moit.find((m) => m.website_id === websiteId);
  if (!site || !record)
    return failed(404, "compliance.website_not_found", "No website has this id.");
  if (record.moit_status !== "submitted") {
    return failed(409, "compliance.website_state_invalid", `The dossier is ${record.moit_status}.`);
  }
  const accepted = site.website_kind === "sales" ? "notified" : "registered";
  const errors: NonNullable<Problem["errors"]> = [];
  if (![accepted, "needs_supplement", "rejected"].includes(input.status)) {
    errors.push({ field: "status", code: "unknown", detail: "is not a result for this website" });
  }
  if (input.status === accepted) {
    if (!GOV_LINK.test(input.link_url.trim())) {
      errors.push({
        field: "link_url",
        code: "logo_link",
        detail: "must be an online.gov.vn link",
      });
    }
    if (!HTTPS.test(input.image_url.trim())) {
      errors.push({ field: "image_url", code: "https_url", detail: "must be an https address" });
    }
  }
  if (errors.length > 0) return invalid(errors);
  record.moit_status = input.status as MoitStatus;
  record.decided_at = new Date().toISOString();
  if (input.status === accepted) {
    record.logo_link_url = input.link_url.trim();
    record.logo_image_url = input.image_url.trim();
  }
  record.updated_at = record.decided_at;
  return { ok: true, data: { ...record } };
}

// ---------------------------------------------------------------- Hồ sơ pháp lý, chính sách

/** Thay bằng GET /api/v1/compliance/legal-profiles (bước 37) khi core có. Cấp khách trước. */
export async function listLegalProfiles(): Promise<{ data: LegalProfile[] }> {
  const { profiles } = await store();
  return {
    data: [...profiles].sort((a, b) => (a.org_id === null ? -1 : b.org_id === null ? 1 : 0)),
  };
}

const TAX_CODE = /^\d{10}(-\d{3})?$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Thay bằng PATCH /api/v1/compliance/legal-profiles/{id} (bước 37) khi core có. */
export async function updateLegalProfile(
  profileId: string,
  input: ProfileInput,
): Promise<SampleOutcome<LegalProfile>> {
  const profile = (await store()).profiles.find((p) => p.id === profileId);
  if (!profile) return failed(404, "compliance.profile_not_found", "No legal profile has this id.");
  const errors: NonNullable<Problem["errors"]> = [];
  const need = (field: keyof ProfileInput) => {
    if (!String(input[field]).trim()) {
      errors.push({ field, code: "required", detail: "must not be empty" });
      return false;
    }
    return true;
  };
  if (!["company", "household_business", "individual"].includes(input.entity_type)) {
    errors.push({ field: "entity_type", code: "unknown", detail: "is not an entity type" });
  }
  need("legal_name");
  if (need("tax_code") && !TAX_CODE.test(input.tax_code.trim())) {
    errors.push({ field: "tax_code", code: "tax_code", detail: "must be 10 or 13 digits" });
  }
  need("registration_number");
  need("representative_name");
  const province = SAMPLE_PROVINCES.find((p) => p.id === input.province_code);
  if (!province) {
    errors.push({ field: "province_code", code: "unknown", detail: "is not a province" });
  }
  need("commune_name");
  need("line");
  need("phone");
  if (need("email") && !EMAIL.test(input.email.trim())) {
    errors.push({ field: "email", code: "email", detail: "is not an email address" });
  }
  if (errors.length > 0 || !province) return invalid(errors);
  Object.assign(profile, {
    entity_type: input.entity_type,
    legal_name: input.legal_name.trim(),
    trade_name: input.trade_name.trim(),
    tax_code: input.tax_code.trim(),
    registration_number: input.registration_number.trim(),
    representative_name: input.representative_name.trim(),
    representative_title: input.representative_title.trim(),
    address: {
      province_code: province.id,
      province_name: province.name,
      commune_name: input.commune_name.trim(),
      line: input.line.trim(),
    },
    phone: input.phone.trim(),
    email: input.email.trim().toLowerCase(),
    updated_at: new Date().toISOString(),
  });
  return { ok: true, data: { ...profile } };
}

/** Thay bằng GET /api/v1/compliance/policies (bước 37) khi core có. */
export async function getPolicies(): Promise<{
  data: Policies & { "posting.comments": PostingLevel };
}> {
  const [{ policies }, { data: comments }] = await Promise.all([store(), getCommentPolicy()]);
  // `posting.comments` đặt ở màn Bình luận (cùng một kho mẫu), ở đây chỉ đọc.
  return { data: { ...policies, "posting.comments": comments.posting } };
}

const LEVELS: readonly PostingLevel[] = ["none", "phone", "identity"];

/**
 * Thay bằng PUT /api/v1/compliance/policies/{key} (bước 37) khi core có, mỗi khoá một lời gọi.
 * Từ ngày `kyc.required_activities` có hiệu lực, người phát trực tiếp bán hàng phải định danh.
 */
export async function updatePolicies(input: {
  "complaints.contact"?: string;
  "privacy.contact"?: string;
  "posting.reviews"?: string;
  "posting.livestream"?: string;
  "posting.max_accounts_per_phone"?: string;
}): Promise<SampleOutcome<Policies>> {
  const { policies } = await store();
  const errors: NonNullable<Problem["errors"]> = [];
  for (const field of ["complaints.contact", "privacy.contact"] as const) {
    const value = input[field];
    if (value !== undefined && !value.trim()) {
      errors.push({ field, code: "required", detail: "must not be empty" });
    }
  }
  for (const field of ["posting.reviews", "posting.livestream"] as const) {
    const value = input[field];
    if (value !== undefined && !LEVELS.includes(value as PostingLevel)) {
      errors.push({ field, code: "unknown", detail: "is not a level" });
    }
  }
  const kyc = ruleAt<{ livestream: boolean }>("kyc.required_activities");
  if (
    input["posting.livestream"] &&
    input["posting.livestream"] !== "identity" &&
    kyc?.body.livestream
  ) {
    errors.push({
      field: "posting.livestream",
      code: "identity_required",
      detail: "needs identity",
    });
  }
  const max = input["posting.max_accounts_per_phone"];
  if (max !== undefined && !/^(10|[1-9])$/.test(max.trim())) {
    errors.push({ field: "posting.max_accounts_per_phone", code: "range_1_10", detail: "1 to 10" });
  }
  if (errors.length > 0) return invalid(errors);
  if (input["complaints.contact"] !== undefined)
    policies["complaints.contact"] = input["complaints.contact"].trim();
  if (input["privacy.contact"] !== undefined)
    policies["privacy.contact"] = input["privacy.contact"].trim();
  if (input["posting.reviews"])
    policies["posting.reviews"] = input["posting.reviews"] as PostingLevel;
  if (input["posting.livestream"]) {
    policies["posting.livestream"] = input["posting.livestream"] as PostingLevel;
  }
  if (max !== undefined) policies["posting.max_accounts_per_phone"] = Number(max.trim());
  policies.updated_at = new Date().toISOString();
  return { ok: true, data: { ...policies } };
}

/** Đề xuất ("mới"): GET /api/v1/compliance/verification-stats. */
export async function verificationStats(): Promise<{ data: VerificationStats }> {
  return { data: { buyers: 9_870, phone_verified: 6_120, identity_verified: 214 } };
}

// ---------------------------------------------------------------- KYC

/** Thay bằng GET /api/v1/compliance/kyc/profiles?status= (bước 37) khi core có. Cũ nhất trước. */
export async function listKycProfiles(
  query: { status?: KycStatus } = {},
): Promise<{ data: KycProfile[] }> {
  const { kyc } = await store();
  return {
    data: kyc
      .filter((k) => !query.status || k.status === query.status)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((k) => ({ ...k })),
  };
}

/**
 * Thay bằng POST /api/v1/compliance/kyc/profiles/{id}/approve (bước 37) khi core có. Cần phiên đăng
 * nhập của người có `compliance.kyc.review` (API key không duyệt được). Hạn theo quy tắc.
 */
export async function approveKyc(profileId: string): Promise<SampleOutcome<KycProfile>> {
  const profile = (await store()).kyc.find((k) => k.id === profileId);
  if (!profile) return failed(404, "compliance.kyc_not_found", "No KYC profile has this id.");
  if (profile.status !== "pending") {
    return failed(409, "compliance.kyc_state_invalid", `The profile is ${profile.status}.`);
  }
  const days = ruleAt<{ valid_days: number }>("kyc.required_activities")?.body.valid_days ?? 730;
  profile.status = "verified";
  profile.documents_missing = false;
  profile.verified_name = profile.subject_name;
  profile.verified_at = new Date().toISOString();
  profile.expires_at = at(days * DAY);
  profile.updated_at = profile.verified_at;
  return { ok: true, data: { ...profile } };
}

/** Thay bằng POST /api/v1/compliance/kyc/profiles/{id}/reject `{reason_code}` (bước 37). */
export async function rejectKyc(
  profileId: string,
  input: { reason_code: string; note: string },
): Promise<SampleOutcome<KycProfile>> {
  const profile = (await store()).kyc.find((k) => k.id === profileId);
  if (!profile) return failed(404, "compliance.kyc_not_found", "No KYC profile has this id.");
  if (profile.status !== "pending") {
    return failed(409, "compliance.kyc_state_invalid", `The profile is ${profile.status}.`);
  }
  const errors: NonNullable<Problem["errors"]> = [];
  if (!(KYC_REASONS as readonly string[]).includes(input.reason_code)) {
    errors.push({ field: "reason_code", code: "required", detail: "choose a reason" });
  }
  if (input.reason_code === "other" && input.note.trim().length < 10) {
    errors.push({ field: "note", code: "length_10_500", detail: "10 to 500 characters" });
  }
  if (errors.length > 0) return invalid(errors);
  profile.status = "rejected";
  profile.reason_code = input.reason_code;
  profile.updated_at = new Date().toISOString();
  return { ok: true, data: { ...profile } };
}

// ---------------------------------------------------------------- Sự cố

/** Thay bằng GET /api/v1/compliance/incidents (bước 37) khi core có. Mới nhất trước. */
export async function listIncidents(): Promise<{ data: Incident[] }> {
  const { incidents } = await store();
  return {
    data: [...incidents]
      .sort((a, b) => b.detected_at.localeCompare(a.detected_at))
      .map((i) => ({ ...i, entries: [...i.entries] })),
  };
}

/**
 * Thay bằng POST /api/v1/compliance/incidents (bước 37) khi core có. Thời điểm phát hiện là lúc ghi
 * nhận và không sửa được; hạn báo cơ quan = phát hiện + giờ của `privacy.incident`.
 */
export async function openIncident(input: NewIncident): Promise<SampleOutcome<Incident>> {
  const s = await store();
  if (s.incidents.some((i) => i.status !== "closed")) {
    return failed(409, "compliance.incident_open", "Another incident is still open.");
  }
  const errors: NonNullable<Problem["errors"]> = [];
  const categories = input.data_categories.filter((c) =>
    (INCIDENT_CATEGORIES as readonly string[]).includes(c),
  );
  if (categories.length === 0) {
    errors.push({ field: "data_categories", code: "min_one", detail: "needs at least one" });
  }
  const description = input.description.trim();
  if (description.length < 10 || description.length > 2000) {
    errors.push({ field: "description", code: "length_10_2000", detail: "10 to 2000 characters" });
  }
  if (!["low", "medium", "high"].includes(input.severity)) {
    errors.push({ field: "severity", code: "unknown", detail: "is not a severity" });
  }
  const count = input.affected_count.trim();
  if (count && !/^\d{1,9}$/.test(count)) {
    errors.push({
      field: "affected_count",
      code: "whole_number",
      detail: "must be a whole number",
    });
  }
  if (errors.length > 0) return invalid(errors);
  const hours =
    ruleAt<{ report_within_hours: number }>("privacy.incident")?.body.report_within_hours ?? 72;
  const now = Date.now();
  const day = dayOf(now);
  const incident: Incident = {
    id: crypto.randomUUID(),
    reference: `SC-${day.slice(2, 4)}${day.slice(5, 7)}-${String(s.incidents.length + 1).padStart(2, "0")}`,
    description,
    severity: input.severity as Incident["severity"],
    status: "open",
    detected_at: new Date(now).toISOString(),
    report_due_at: new Date(now + hours * HOUR).toISOString(),
    authority_notified_at: null,
    authority_reference: null,
    subjects_notified_at: null,
    data_categories: categories,
    affected_count: count ? Number(count) : null,
    entries: [{ at: new Date(now).toISOString(), text: "opened" }],
    updated_at: new Date(now).toISOString(),
  };
  s.incidents.push(incident);
  return { ok: true, data: incident };
}

export type IncidentStep = "contain" | "notify_authority" | "notify_subjects" | "close";

/** Thay bằng PATCH /api/v1/compliance/incidents/{id} + POST …/entries (bước 37) khi core có. */
export async function advanceIncident(
  incidentId: string,
  step: string,
  reference = "",
): Promise<SampleOutcome<Incident>> {
  const incident = (await store()).incidents.find((i) => i.id === incidentId);
  if (!incident) return failed(404, "compliance.incident_not_found", "No incident has this id.");
  if (incident.status === "closed") {
    return failed(409, "compliance.incident_closed", "The incident is closed.");
  }
  const now = new Date().toISOString();
  if (step === "contain" && incident.status === "open") {
    incident.status = "contained";
  } else if (step === "notify_authority" && !incident.authority_notified_at) {
    if (!reference.trim()) {
      return invalid([
        { field: "authority_reference", code: "required", detail: "must not be empty" },
      ]);
    }
    incident.authority_notified_at = now;
    incident.authority_reference = reference.trim();
    incident.status = "reported";
  } else if (step === "notify_subjects" && !incident.subjects_notified_at) {
    incident.subjects_notified_at = now;
  } else if (step === "close") {
    incident.status = "closed";
  } else {
    return failed(409, "compliance.incident_step_invalid", `Step ${step} is done or unknown.`);
  }
  incident.entries.unshift({ at: now, text: step === "close" ? "closed" : step });
  incident.updated_at = now;
  return { ok: true, data: { ...incident, entries: [...incident.entries] } };
}

// ---------------------------------------------------------------- Tổng quan

export type Tone = "ok" | "warn" | "bad" | "info";

/** Một ô của tab Tình trạng: một nghĩa vụ, tô màu theo mức cần làm. */
export interface OverviewTile {
  area: "websites" | "kyc" | "privacy" | "documents" | "reports";
  tone: Tone;
  /** Số việc đang chờ trong khu vực này. */
  open: number;
  /** Dữ liệu cho câu mô tả. */
  facts: Record<string, string | number>;
}

/** Đề xuất ("mới"): GET /api/v1/compliance/overview — gom số việc của các khu vực. */
export async function getOverview(): Promise<{ data: OverviewTile[] }> {
  const [
    { data: sites },
    { data: kyc },
    { data: incidents },
    { data: requests },
    { data: docs },
    { data: cases },
  ] = await Promise.all([
    listComplianceWebsites(),
    listKycProfiles({ status: "pending" }),
    listIncidents(),
    listSubjectRequests(),
    listDocuments(),
    listCases(),
  ]);
  const unsubmitted = sites.filter((s) => !["notified", "registered"].includes(s.moit_status));
  const missing = await Promise.all(
    unsubmitted.map(async (site) => {
      const list = await getChecklist(site.id);
      return list.ok ? list.data.items.filter((i) => i.result === "missing").length : 0;
    }),
  );
  const openIncident = incidents.find((i) => i.status !== "closed");
  const openRequests = requests.filter((r) => !["done", "rejected"].includes(r.status)).length;
  const drafts = docs.filter((d) => d.versions.length === 0).length;
  const scheduled = docs.filter((d) => (d.versions[0]?.effective_from ?? "") > dayOf()).length;
  const pendingAcceptance = docs.reduce((sum, d) => {
    const current = currentVersion(d);
    if (!current?.requires_reacceptance || d.audience_total === null) return sum;
    return sum + Math.max(0, d.audience_total - current.accepted_count);
  }, 0);
  const openCases = cases.filter((c) => !["decided", "closed", "withdrawn"].includes(c.status));
  const nextDue = openCases
    .map((c) => c.respond_by ?? c.decide_by)
    .sort()
    .at(0);
  return {
    data: [
      {
        area: "websites",
        tone: unsubmitted.length > 0 ? "bad" : "ok",
        open: unsubmitted.length,
        facts: {
          domain: unsubmitted[0]?.domain ?? "",
          missing: missing.reduce((a, b) => a + b, 0),
          done: sites.length - unsubmitted.length,
        },
      },
      { area: "kyc", tone: kyc.length > 0 ? "warn" : "ok", open: kyc.length, facts: {} },
      {
        area: "privacy",
        tone: openIncident ? "bad" : openRequests > 0 ? "warn" : "ok",
        open: openRequests + (openIncident ? 1 : 0),
        facts: { requests: openRequests, incident: openIncident ? openIncident.reference : "none" },
      },
      {
        area: "documents",
        tone: pendingAcceptance > 0 || drafts > 0 ? "warn" : "ok",
        open: pendingAcceptance,
        facts: { pending: pendingAcceptance, scheduled },
      },
      {
        area: "reports",
        tone: openCases.length > 0 ? "info" : "ok",
        open: openCases.length,
        facts: { next: nextDue ?? "" },
      },
    ],
  };
}
