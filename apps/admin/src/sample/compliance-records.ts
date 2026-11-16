// Dữ liệu mẫu cho màn "Hồ sơ và dữ liệu cá nhân" của phân hệ Tuân thủ (W-006, W-012): văn bản
// pháp lý có phiên bản, sổ mục đích xử lý, hạn lưu, vụ việc, nội dung có nhãn AI ngoài bài viết, yêu
// cầu của chủ thể dữ liệu. Hình dạng theo đặc tả bước 37 của core (`docs/steps/37-compliance.md`,
// mục A2 và A4); sổ yêu cầu của chủ thể dữ liệu chưa có trong đặc tả nên là endpoint đề xuất ("mới").
// Nội dung mẫu lấy từ bản thiết kế (chuỗi "Bếp Mộc"); email miền `example.com`.
//
// Lệnh ghi đổi một kho trong bộ nhớ của tiến trình máy chủ; khởi động lại thì về ban đầu.
import type { Problem } from "@autoxide/sdk";
import { addBusinessDays, type CaseDeadline, dayOf, ruleAt } from "./compliance-rules";
import { SAMPLE_UNIT_IDS, type SampleOutcome } from "./org";

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

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------- Văn bản pháp lý

export type DocumentKind =
  | "terms_of_use"
  | "privacy_policy"
  | "general_conditions"
  | "platform_rules"
  | "seller_agreement";

/** Một lần phát hành (`compliance_document_versions`): ảnh chụp bất biến của trang nguồn. */
export interface DocumentVersion {
  id: string;
  version: number;
  locale: string;
  /** `content.entry:<id>` của trang nguồn. */
  source: string;
  source_title: string;
  sha256: string;
  effective_from: string;
  requires_reacceptance: boolean;
  published_at: string;
  /** Dự kiến (chưa có trong đặc tả): số người đã chấp nhận bản này. */
  accepted_count: number;
}

/** Một văn bản (`GET /api/v1/compliance/documents`). */
export interface LegalDocument {
  id: string;
  kind: DocumentKind;
  audience: "user" | "buyer" | "seller";
  org_id: string | null;
  title: string;
  /** Mới nhất trước. */
  versions: DocumentVersion[];
  /** Dự kiến: số người cần chấp nhận (người bán của sàn), để biết ai chưa chấp nhận. */
  audience_total: number | null;
}

/** Bằng chứng chấp nhận (`GET /api/v1/compliance/documents/{id}/acceptances`). */
export interface Acceptance {
  id: string;
  version: number;
  subject: string;
  channel: "web" | "mobile_app" | "api" | "in_store";
  method: "checkbox" | "click_wrap" | "signature";
  sha256: string;
  accepted_at: string;
}

export type DocumentState = "current" | "scheduled" | "none";

/** Trạng thái lúc đọc: bản mới nhất chưa tới ngày hiệu lực thì "chờ hiệu lực". */
export function documentState(doc: LegalDocument, today = dayOf()): DocumentState {
  const latest = doc.versions[0];
  if (!latest) return "none";
  return latest.effective_from > today ? "scheduled" : "current";
}

/** Bản đang có hiệu lực hôm nay (có thể khác bản mới nhất khi bản mới chờ hiệu lực). */
export function currentVersion(doc: LegalDocument, today = dayOf()): DocumentVersion | undefined {
  return doc.versions.find((v) => v.effective_from <= today);
}

export interface PublishInput {
  source_entry_id: string;
  source_title: string;
  /** Id các trang đã đăng thật của `content` (giao diện đọc từ core). */
  published: readonly string[];
  locale: string;
  effective_from: string;
  requires_reacceptance: boolean;
  acknowledged: boolean;
}

// ---------------------------------------------------------------- Mục đích xử lý

export type LegalBasis = "consent" | "contract" | "legal_obligation" | "vital_interest";
export const LEGAL_BASES: readonly LegalBasis[] = [
  "consent",
  "contract",
  "legal_obligation",
  "vital_interest",
];
export const DATA_CATEGORIES = [
  "name",
  "contact",
  "address",
  "tax",
  "identity_last4",
  "order_history",
  "device_id",
] as const;
/** Hạn lưu: khoảng ISO 8601, hoặc tới khi rút đồng ý / hết hạn hồ sơ KYC. */
export const RETENTIONS = [
  "P13M",
  "P1Y",
  "P3Y",
  "P5Y",
  "P10Y",
  "until_withdrawn",
  "kyc_validity",
] as const;

/** Một mục đích (`GET /api/v1/compliance/purposes`): mặc định của bộ quy định ∪ của khách. */
export interface Purpose {
  key: string;
  category: "service" | "marketing" | "analytics" | "legal" | "kyc";
  legal_basis: LegalBasis;
  data_categories: string[];
  channels: string[];
  description: { en: string; vi: string };
  retention: (typeof RETENTIONS)[number];
  active: boolean;
  source: "default" | "tenant";
  /** Dự kiến (chưa có trong đặc tả): số bản ghi đồng ý còn hiệu lực / đã rút. */
  consents: { granted: number; withdrawn: number } | null;
  updated_at: string;
}

export interface NewPurpose {
  key: string;
  description_en: string;
  description_vi: string;
  legal_basis: string;
  retention: string;
  data_categories: string[];
}

// ---------------------------------------------------------------- Hạn lưu

/** Một dòng của `GET /api/v1/compliance/retention`: module khai (`Module::retention`) + giới hạn. */
export interface RetentionItem {
  name: string;
  module: string;
  category: "basic" | "sensitive" | "security" | "accounting";
  /** Số ngày giữ; `null` = giữ mãi. */
  keep_days: number | null;
  /** Biến môi trường đặt hạn này (cấp máy chủ). */
  setting: string | null;
  limit_days: number | null;
}

export interface RetentionReport {
  residency: { country: string; set_by: "operator" };
  items: RetentionItem[];
}

/** Cần xem: dữ liệu cá nhân giữ mãi, hay vượt giới hạn của bộ quy định. */
export function retentionNeedsReview(item: RetentionItem): boolean {
  if (item.category !== "basic" && item.category !== "sensitive") return false;
  if (item.keep_days === null) return true;
  return item.limit_days !== null && item.keep_days > item.limit_days;
}

// ---------------------------------------------------------------- Vụ việc

export type CaseKind =
  | "ip_infringement"
  | "counterfeit"
  | "prohibited_goods"
  | "consumer_complaint"
  | "other";
export type CaseStatus =
  | "received"
  | "under_review"
  | "awaiting_response"
  | "decided"
  | "closed"
  | "withdrawn";
export const CASE_STATUSES: readonly CaseStatus[] = [
  "received",
  "under_review",
  "awaiting_response",
  "decided",
];

export interface CaseEntry {
  at: string;
  kind: "status" | "restriction" | "mail" | "decision" | "note";
  text: string;
}

/** Một vụ việc (`GET /api/v1/compliance/cases`). */
export interface ComplianceCase {
  id: string;
  /** Số hiệu cho người đọc. */
  reference: string;
  kind: CaseKind;
  /** `<module>.<loại>:<id>` + tên để hiện (dự kiến API trả kèm). */
  target: { ref: string; title: string };
  respondent: { org_id: string; name: string } | null;
  reporter_kind: "guest" | "user" | "rights_holder" | "authority";
  claim: string;
  status: CaseStatus;
  restricted: boolean;
  decision: "upheld" | "rejected" | "partially_upheld" | null;
  ack_due_at: string;
  respond_by: string | null;
  decide_by: string;
  decided_at: string | null;
  /** Mới nhất trước; chỉ thêm, không sửa (`compliance_case_entries`). */
  entries: CaseEntry[];
  updated_at: string;
}

// ---------------------------------------------------------------- Nhãn AI

/** Nội dung có nhãn AI ngoài bài viết (sản phẩm, alt ảnh): chưa có API lọc (đề xuất). */
export interface AiLabelled {
  id: string;
  kind: "product" | "media";
  title: string;
  label: "ai_generated" | "ai_assisted" | "removed";
  /** Phần do AI làm (chữ do người duyệt ghi, giữ nguyên). */
  what: string;
  reviewer: string | null;
  updated_at: string;
}

// ---------------------------------------------------------------- Yêu cầu của chủ thể dữ liệu

export type RequestKind = "access" | "rectify" | "erase" | "withdraw" | "object";
export const REQUEST_KINDS: readonly RequestKind[] = [
  "access",
  "rectify",
  "erase",
  "withdraw",
  "object",
];
export type RequestChannel = "email" | "phone" | "in_store" | "post";
export const REQUEST_CHANNELS: readonly RequestChannel[] = ["email", "phone", "in_store", "post"];
export type RequestStatus = "new" | "verifying" | "in_progress" | "done" | "rejected";
export const REQUEST_STATUSES: readonly RequestStatus[] = [
  "new",
  "verifying",
  "in_progress",
  "done",
  "rejected",
];

/** Yêu cầu nhận qua kênh khác (đề xuất "mới": `GET /api/v1/compliance/subject-requests`). */
export interface SubjectRequest {
  id: string;
  reference: string;
  kind: RequestKind;
  channel: RequestChannel;
  /** Email hoặc số điện thoại người yêu cầu. */
  subject: string;
  note: string;
  status: RequestStatus;
  received_at: string;
  due_at: string;
  recorded_by: string;
  reason: string | null;
  updated_at: string;
}

export interface NewSubjectRequest {
  kind: string;
  channel: string;
  subject: string;
  note: string;
}

/** Tự phục vụ trong 30 ngày (đề xuất: số đếm cho bảng tình trạng). */
export interface SelfService {
  exports_30d: number;
  deletions_30d: number;
}

// ---------------------------------------------------------------- Kho

interface Store {
  documents: LegalDocument[];
  acceptances: Map<string, Acceptance[]>;
  purposes: Purpose[];
  cases: ComplianceCase[];
  ai: AiLabelled[];
  requests: SubjectRequest[];
}

const id = (n: string) => `01a1e000-0000-7000-8000-0000000d${n}`;

function version(
  n: number,
  title: string,
  effective: string,
  reaccept: boolean,
  accepted: number,
  hash: string,
): DocumentVersion {
  return {
    id: id(`9${n}${hash.slice(0, 2)}`),
    version: n,
    locale: "vi",
    source: `content.entry:${id(`8${n}${hash.slice(0, 2)}`)}`,
    source_title: title,
    sha256: hash.padEnd(64, "0"),
    effective_from: effective,
    requires_reacceptance: reaccept,
    published_at: `${effective}T02:00:00Z`,
    accepted_count: accepted,
  };
}

function seed(): Store {
  const market = SAMPLE_UNIT_IDS.market;
  const sellers = SAMPLE_UNIT_IDS.sellers;
  const documents: LegalDocument[] = [
    {
      id: id("0001"),
      kind: "platform_rules",
      audience: "seller",
      org_id: market,
      title: "Quy chế Chợ Bếp Mộc",
      versions: [
        version(2, "Quy chế Chợ Bếp Mộc", "2026-10-01", true, 6, "3fa19c02"),
        version(1, "Quy chế Chợ Bếp Mộc", "2026-03-01", true, 7, "a81d4410"),
      ],
      audience_total: 7,
    },
    {
      id: id("0002"),
      kind: "privacy_policy",
      audience: "user",
      org_id: null,
      title: "Chính sách bảo vệ dữ liệu cá nhân",
      versions: [
        version(4, "Chính sách bảo vệ dữ liệu cá nhân", "2026-12-01", false, 0, "77c0e2b9"),
        version(3, "Chính sách bảo vệ dữ liệu cá nhân", "2026-03-01", false, 10_084, "5b2e9017"),
      ],
      audience_total: null,
    },
    {
      id: id("0003"),
      kind: "general_conditions",
      audience: "buyer",
      org_id: null,
      title: "Điều kiện giao dịch chung",
      versions: [version(3, "Điều kiện giao dịch chung", "2026-07-01", false, 9_870, "c40e11aa")],
      audience_total: null,
    },
    {
      id: id("0004"),
      kind: "terms_of_use",
      audience: "user",
      org_id: null,
      title: "Điều khoản sử dụng",
      versions: [version(2, "Điều khoản sử dụng", "2026-03-01", false, 10_084, "9e3d6f21")],
      audience_total: null,
    },
    {
      id: id("0005"),
      kind: "seller_agreement",
      audience: "seller",
      org_id: market,
      title: "Hợp đồng người bán",
      versions: [
        version(2, "Hợp đồng người bán", "2026-10-01", true, 6, "1c8a7d53"),
        version(1, "Hợp đồng người bán", "2026-03-01", true, 7, "e04b2c88"),
      ],
      audience_total: 7,
    },
  ];
  const acceptance = (
    n: string,
    ver: number,
    subject: string,
    channel: Acceptance["channel"],
    hash: string,
    offset: number,
  ): Acceptance => ({
    id: id(`a${n}`),
    version: ver,
    subject,
    channel,
    method: "click_wrap",
    sha256: hash.padEnd(64, "0"),
    accepted_at: at(offset),
  });
  const acceptances = new Map<string, Acceptance[]>([
    [
      id("0001"),
      [
        acceptance("001", 2, "Gia Dụng Nhà Na", "web", "3fa19c02", -40 * DAY),
        acceptance("002", 2, "Gốm Sứ Bát Tràng Xưa", "web", "3fa19c02", -42 * DAY),
        acceptance("003", 2, "Bếp Nhà Thỏ", "mobile_app", "3fa19c02", -44 * DAY),
        // Thêm cho màn Vận hành sàn (W-018): người bán đang bán đã chấp nhận bản hiện hành.
        acceptance("006", 2, "Dao Kéo Đa Sỹ Truyền Thống", "web", "3fa19c02", -43 * DAY),
        acceptance("007", 2, "Khăn Bông Hạ Long", "web", "3fa19c02", -41 * DAY),
      ],
    ],
    [
      id("0005"),
      [
        acceptance("004", 2, "Gia Dụng Nhà Na", "web", "1c8a7d53", -40 * DAY),
        acceptance("005", 2, "Dao Kéo Đa Sỹ Truyền Thống", "web", "1c8a7d53", -43 * DAY),
        acceptance("008", 2, "Gốm Sứ Bát Tràng Xưa", "web", "1c8a7d53", -42 * DAY),
        acceptance("009", 2, "Bếp Nhà Thỏ", "mobile_app", "1c8a7d53", -44 * DAY),
        acceptance("010", 2, "Khăn Bông Hạ Long", "web", "1c8a7d53", -41 * DAY),
      ],
    ],
  ]);
  const purpose = (
    key: string,
    category: Purpose["category"],
    legal_basis: LegalBasis,
    data_categories: string[],
    channels: string[],
    description: { en: string; vi: string },
    retention: Purpose["retention"],
    source: Purpose["source"],
    active = true,
    consents: Purpose["consents"] = null,
  ): Purpose => ({
    key,
    category,
    legal_basis,
    data_categories,
    channels,
    description,
    retention,
    active,
    source,
    consents,
    updated_at: at(-30 * DAY),
  });
  return {
    documents,
    acceptances,
    purposes: [
      purpose(
        "orders.fulfilment",
        "service",
        "contract",
        ["name", "contact", "address"],
        ["checkout", "in_store"],
        { en: "Deliver orders and look after them", vi: "Giao hàng và chăm sóc đơn" },
        "P5Y",
        "default",
      ),
      purpose(
        "legal.accounting",
        "legal",
        "legal_obligation",
        ["name", "tax", "address"],
        ["checkout"],
        { en: "Invoices and accounting records", vi: "Hoá đơn và kế toán" },
        "P10Y",
        "default",
      ),
      purpose(
        "marketing",
        "marketing",
        "consent",
        ["contact"],
        ["email", "sms", "zalo"],
        { en: "Send promotions", vi: "Gửi tin khuyến mại" },
        "until_withdrawn",
        "tenant",
        true,
        { granted: 8_412, withdrawn: 1_036 },
      ),
      purpose(
        "kyc.seller",
        "kyc",
        "legal_obligation",
        ["name", "identity_last4"],
        ["seller_signup"],
        { en: "Verify sellers", vi: "Xác thực người bán" },
        "kyc_validity",
        "default",
      ),
      purpose(
        "analytics",
        "analytics",
        "consent",
        ["device_id"],
        ["website"],
        { en: "Measure page views", vi: "Đo lường lượt xem" },
        "P13M",
        "tenant",
        false,
        { granted: 0, withdrawn: 0 },
      ),
    ],
    cases: [
      {
        id: id("c012"),
        reference: "VV-2611-0012",
        kind: "ip_infringement",
        target: { ref: `catalog.product:${id("p001")}`, title: "Bát gốm men lam (bộ 6)" },
        respondent: { org_id: sellers[1], name: "Gốm Sứ Bát Tràng Xưa" },
        reporter_kind: "rights_holder",
        claim: "Trùng kiểu dáng công nghiệp đã đăng ký ([SỐ VĂN BẰNG MẪU]).",
        status: "awaiting_response",
        restricted: true,
        decision: null,
        ack_due_at: at(-2 * DAY),
        respond_by: at(2 * DAY),
        decide_by: at(9 * DAY),
        decided_at: null,
        entries: [
          {
            at: at(-2 * DAY),
            kind: "mail",
            text: "Đã báo người bán, hạn phản hồi theo ngày làm việc",
          },
          {
            at: at(-3 * DAY + HOUR),
            kind: "restriction",
            text: "Tự ẩn sản phẩm (cases.auto_restrict)",
          },
          { at: at(-3 * DAY), kind: "status", text: "Nhận báo từ chủ văn bằng" },
        ],
        updated_at: at(-2 * DAY),
      },
      {
        id: id("c015"),
        reference: "VV-2611-0015",
        kind: "consumer_complaint",
        target: { ref: `orders.order:${id("o412")}`, title: "Đơn BM-2611-0412" },
        respondent: null,
        reporter_kind: "user",
        claim: "Giao trễ 5 ngày, không ai trả lời.",
        status: "received",
        restricted: false,
        decision: null,
        ack_due_at: at(20 * HOUR),
        respond_by: null,
        decide_by: at(7 * DAY),
        decided_at: null,
        entries: [
          { at: at(-4 * HOUR), kind: "status", text: "Nhận khiếu nại qua form trên website" },
        ],
        updated_at: at(-4 * HOUR),
      },
      {
        id: id("c009"),
        reference: "VV-2611-0009",
        kind: "prohibited_goods",
        target: { ref: `catalog.product:${id("p002")}`, title: "Mật ong rừng U Minh 500 ml" },
        respondent: { org_id: sellers[4], name: "Thực Phẩm Sạch An Nhiên" },
        reporter_kind: "guest",
        claim: "Thiếu số tự công bố sản phẩm.",
        status: "under_review",
        restricted: true,
        decision: null,
        ack_due_at: at(-4 * DAY),
        respond_by: null,
        decide_by: at(DAY),
        decided_at: null,
        entries: [
          { at: at(-4 * DAY), kind: "restriction", text: "Ẩn sản phẩm, chờ giấy chứng nhận" },
          { at: at(-5 * DAY), kind: "status", text: "Nhận báo từ khách vãng lai" },
        ],
        updated_at: at(-4 * DAY),
      },
      {
        id: id("c031"),
        reference: "VV-2610-0031",
        kind: "counterfeit",
        target: { ref: `catalog.product:${id("p003")}`, title: "Chảo gang 26 cm (gian khác)" },
        respondent: { org_id: sellers[3], name: "Dao Kéo Đa Sỹ Truyền Thống" },
        reporter_kind: "rights_holder",
        claim: "Nghi hàng giả nhãn hiệu Bếp Mộc.",
        status: "decided",
        restricted: true,
        decision: "upheld",
        ack_due_at: at(-24 * DAY),
        respond_by: at(-21 * DAY),
        decide_by: at(-15 * DAY),
        decided_at: at(-18 * DAY),
        entries: [
          { at: at(-18 * DAY), kind: "decision", text: "Chấp nhận phản ánh, giữ gỡ" },
          { at: at(-25 * DAY), kind: "status", text: "Nhận báo" },
        ],
        updated_at: at(-18 * DAY),
      },
    ],
    ai: [
      {
        id: id("e001"),
        kind: "product",
        title: "Mô tả: Nồi inox 3 đáy 20 cm",
        label: "ai_generated",
        what: "AI viết nháp mô tả",
        reviewer: null,
        updated_at: at(-DAY),
      },
      {
        id: id("e002"),
        kind: "media",
        title: "Alt ảnh: 120 ảnh sản phẩm",
        label: "ai_assisted",
        what: "Gợi ý alt",
        reviewer: "Minh Anh",
        updated_at: at(-3 * DAY),
      },
      {
        id: id("e003"),
        kind: "product",
        title: "Mô tả: Thớt gỗ nghiến 35 cm",
        label: "ai_assisted",
        what: "Áp gợi ý SEO",
        reviewer: "Lan Phạm",
        updated_at: at(-6 * DAY),
      },
    ],
    requests: [
      request("004", "erase", "email", "khach.vanglai@example.com", "verifying", -3, "Lan Phạm"),
      request("005", "withdraw", "in_store", "[SỐ ĐIỆN THOẠI MẪU]", "new", -2, "Ngô Mai"),
      request("002", "access", "phone", "nguoimua.b@example.com", "in_progress", -7, "Lan Phạm"),
      request("019", "rectify", "email", "nguoimua.c@example.com", "done", -18, "Lan Phạm"),
    ],
  };
}

function request(
  n: string,
  kind: RequestKind,
  channel: RequestChannel,
  subject: string,
  status: RequestStatus,
  days: number,
  by: string,
): SubjectRequest {
  const received = Date.now() + days * DAY;
  return {
    id: id(`r${n}`),
    reference: `YC-2611-${n}`,
    kind,
    channel,
    subject,
    note:
      kind === "erase"
        ? "Đặt đơn không có tài khoản; xin xoá dữ liệu."
        : kind === "withdraw"
          ? "Không muốn nhận SMS khuyến mại."
          : kind === "access"
            ? "Xin bản sao dữ liệu cá nhân."
            : "Sửa địa chỉ giao hàng.",
    status,
    received_at: new Date(received).toISOString(),
    due_at: new Date(received + requestDays(kind) * DAY).toISOString(),
    recorded_by: by,
    reason: null,
    updated_at: new Date(received).toISOString(),
  };
}

function requestDays(kind: RequestKind): number {
  return ruleAt<Record<RequestKind, number>>("privacy.subject_requests")?.body[kind] ?? 7;
}

const KEY = Symbol.for("autoxide.sample.compliance-records");
type Holder = { [KEY]?: Store };

function store(): Store {
  const holder = globalThis as Holder;
  holder[KEY] ??= seed();
  return holder[KEY];
}

/** Về dữ liệu ban đầu (test). */
export function resetSampleComplianceRecords(): void {
  (globalThis as Holder)[KEY] = seed();
}

// ---------------------------------------------------------------- Văn bản

/** Thay bằng GET /api/v1/compliance/documents (bước 37) khi core có. */
export async function listDocuments(): Promise<{ data: LegalDocument[] }> {
  return { data: store().documents.map((d) => ({ ...d, versions: [...d.versions] })) };
}

/** Thay bằng GET /api/v1/compliance/documents/{id}/acceptances (bước 37) khi core có. */
export async function listAcceptances(documentId: string): Promise<{ data: Acceptance[] }> {
  return { data: [...(store().acceptances.get(documentId) ?? [])] };
}

/** Một chủ thể đã chấp nhận bản đang hiệu lực của văn bản loại `kind` chưa (W-018). */
export interface AcceptanceState {
  kind: DocumentKind;
  title: string;
  version: number | null;
  accepted_at: string | null;
}

/**
 * Thay bằng `LegalDocuments::has_accepted` (bước 37): sàn hỏi qua trait, giao diện người bán đọc
 * qua `GET /api/v1/marketplace/sellers/me` (bước 46). Thêm cho màn Vận hành sàn.
 */
export async function acceptanceOf(kind: DocumentKind, subject: string): Promise<AcceptanceState> {
  const doc = store().documents.find((d) => d.kind === kind);
  const current = doc ? currentVersion(doc) : undefined;
  // Bản mới không đòi chấp nhận lại thì lần chấp nhận bản trước vẫn còn giá trị: bản cần có là bản
  // hiệu lực mới nhất có `requires_reacceptance` (không có thì bản đang hiệu lực).
  const today = dayOf();
  const needed =
    doc?.versions.find((v) => v.effective_from <= today && v.requires_reacceptance) ?? current;
  const found =
    doc && needed
      ? (store().acceptances.get(doc.id) ?? []).find(
          (a) => a.subject === subject && a.version >= needed.version,
        )
      : undefined;
  return {
    kind,
    title: doc?.title ?? kind,
    version: current?.version ?? null,
    accepted_at: found?.accepted_at ?? null,
  };
}

/**
 * Thay bằng `POST /api/v1/compliance/documents/{id}/acceptances` (bước 37) khi core có: người bán
 * chấp nhận bản đang hiệu lực. Gửi lại khi đã chấp nhận thì trả bản cũ (không ghi hai lần).
 */
export async function recordAcceptance(
  kind: DocumentKind,
  subject: string,
): Promise<SampleOutcome<AcceptanceState>> {
  const doc = store().documents.find((d) => d.kind === kind);
  const current = doc ? currentVersion(doc) : undefined;
  if (!doc || !current) {
    return failed(404, "compliance.document_not_found", "No document of this kind is in effect.");
  }
  const list = store().acceptances.get(doc.id) ?? [];
  if (!list.some((a) => a.subject === subject && a.version === current.version)) {
    list.unshift({
      id: crypto.randomUUID(),
      version: current.version,
      subject,
      channel: "web",
      method: "click_wrap",
      sha256: current.sha256,
      accepted_at: new Date().toISOString(),
    });
    store().acceptances.set(doc.id, list);
    current.accepted_count += 1;
  }
  return { ok: true, data: await acceptanceOf(kind, subject) };
}

/**
 * Thay bằng POST /api/v1/compliance/documents/{id}/versions (bước 37) khi core có. Core chép ảnh
 * chụp bất biến của trang nguồn đã đăng; bản đã phát hành không sửa, không xoá được.
 */
export async function publishVersion(
  documentId: string,
  input: PublishInput,
): Promise<SampleOutcome<DocumentVersion>> {
  const doc = store().documents.find((d) => d.id === documentId);
  if (!doc) return failed(404, "compliance.document_not_found", "No document has this id.");
  const errors: NonNullable<Problem["errors"]> = [];
  if (!input.source_entry_id) {
    errors.push({ field: "source_entry_id", code: "required", detail: "must not be empty" });
  } else if (!input.published.includes(input.source_entry_id)) {
    errors.push({ field: "source_entry_id", code: "not_published", detail: "is not published" });
  }
  if (!["vi", "en"].includes(input.locale)) {
    errors.push({ field: "locale", code: "unknown", detail: "is not a content language" });
  }
  if (!DATE.test(input.effective_from)) {
    errors.push({ field: "effective_from", code: "required", detail: "must be a date" });
  } else if (input.effective_from < dayOf()) {
    errors.push({ field: "effective_from", code: "past_date", detail: "must not be in the past" });
  }
  if (!input.acknowledged) {
    errors.push({ field: "acknowledged", code: "acknowledge", detail: "must be confirmed" });
  }
  if (errors.length > 0) return invalid(errors);
  const next = (doc.versions[0]?.version ?? 0) + 1;
  // Băm giả cho bản mẫu; core tính SHA-256 của ảnh chụp thật.
  const hash = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const created: DocumentVersion = {
    id: crypto.randomUUID(),
    version: next,
    locale: input.locale,
    source: `content.entry:${input.source_entry_id}`,
    source_title: input.source_title,
    sha256: hash,
    effective_from: input.effective_from,
    requires_reacceptance: input.requires_reacceptance,
    published_at: new Date().toISOString(),
    accepted_count: 0,
  };
  doc.versions.unshift(created);
  return { ok: true, data: created };
}

// ---------------------------------------------------------------- Mục đích

/** Thay bằng GET /api/v1/compliance/purposes (bước 37) khi core có. */
export async function listPurposes(): Promise<{ data: Purpose[] }> {
  return { data: store().purposes.map((p) => ({ ...p })) };
}

const PURPOSE_KEY = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

/** Thay bằng POST /api/v1/compliance/purposes (bước 37) khi core có. */
export async function createPurpose(input: NewPurpose): Promise<SampleOutcome<Purpose>> {
  const errors: NonNullable<Problem["errors"]> = [];
  const key = input.key.trim();
  if (!key) errors.push({ field: "key", code: "required", detail: "must not be empty" });
  else if (!PURPOSE_KEY.test(key) || key.length > 64) {
    errors.push({ field: "key", code: "purpose_key", detail: "use lowercase words and dots" });
  } else if (store().purposes.some((p) => p.key === key)) {
    errors.push({ field: "key", code: "taken", detail: "is already a purpose" });
  }
  for (const field of ["description_en", "description_vi"] as const) {
    if (!input[field].trim()) errors.push({ field, code: "required", detail: "must not be empty" });
  }
  if (!LEGAL_BASES.includes(input.legal_basis as LegalBasis)) {
    errors.push({ field: "legal_basis", code: "unknown", detail: "is not a legal basis" });
  }
  if (!(RETENTIONS as readonly string[]).includes(input.retention)) {
    errors.push({ field: "retention", code: "unknown", detail: "is not a retention period" });
  }
  const categories = input.data_categories.filter((c) =>
    (DATA_CATEGORIES as readonly string[]).includes(c),
  );
  if (categories.length === 0) {
    errors.push({ field: "data_categories", code: "min_one", detail: "needs at least one" });
  }
  if (errors.length > 0) return invalid(errors);
  const purpose: Purpose = {
    key,
    category: input.legal_basis === "consent" ? "marketing" : "service",
    legal_basis: input.legal_basis as LegalBasis,
    data_categories: categories,
    channels: [],
    description: { en: input.description_en.trim(), vi: input.description_vi.trim() },
    retention: input.retention as Purpose["retention"],
    active: true,
    source: "tenant",
    consents: input.legal_basis === "consent" ? { granted: 0, withdrawn: 0 } : null,
    updated_at: new Date().toISOString(),
  };
  store().purposes.push(purpose);
  return { ok: true, data: purpose };
}

/**
 * Thay bằng PATCH /api/v1/compliance/purposes/{key} `{active}` (bước 37) khi core có. Mục đích theo
 * nghĩa vụ pháp lý không tắt được (vẫn phải thu và lưu theo luật).
 */
export async function setPurposeActive(
  key: string,
  active: boolean,
): Promise<SampleOutcome<Purpose & { previous: boolean }>> {
  const purpose = store().purposes.find((p) => p.key === key);
  if (!purpose) return failed(404, "compliance.purpose_not_found", "No purpose has this key.");
  if (!active && purpose.legal_basis === "legal_obligation") {
    return failed(409, "compliance.purpose_required_by_law", "This purpose is required by law.");
  }
  const previous = purpose.active;
  purpose.active = active;
  purpose.updated_at = new Date().toISOString();
  return { ok: true, data: { ...purpose, previous } };
}

// ---------------------------------------------------------------- Hạn lưu

/** Thay bằng GET /api/v1/compliance/retention (bước 37) khi core có. */
export async function getRetention(): Promise<{ data: RetentionReport }> {
  const limits = ruleAt<Record<string, number>>("privacy.retention_limits")?.body ?? {};
  const item = (
    name: string,
    module: string,
    category: RetentionItem["category"],
    keep_days: number | null,
    setting: string | null,
  ): RetentionItem => ({
    name,
    module,
    category,
    keep_days,
    setting,
    limit_days: limits[name] ?? null,
  });
  return {
    data: {
      residency: { country: "VN", set_by: "operator" },
      items: [
        item("forms.submissions", "forms", "basic", null, "AUTOXIDE_FORMS_RETENTION_DAYS"),
        item("auth.sessions", "auth", "security", 30, "AUTOXIDE_AUTH_REFRESH_TOKEN_DAYS"),
        item("comments.ip_traces", "comments", "basic", 90, "AUTOXIDE_COMMENTS_IP_RETENTION_DAYS"),
        item(
          "compliance.kyc_documents",
          "compliance",
          "sensitive",
          30,
          "AUTOXIDE_COMPLIANCE_KYC_DOCUMENT_RETENTION_DAYS",
        ),
        item("webhooks.deliveries", "webhooks", "basic", 30, null),
        item("audit.events", "audit", "basic", 730, "AUTOXIDE_AUDIT_RETENTION_DAYS"),
      ],
    },
  };
}

// ---------------------------------------------------------------- Vụ việc

/** Thay bằng GET /api/v1/compliance/cases?status= (bước 37) khi core có. Hạn gần nhất trước. */
export async function listCases(
  query: { status?: CaseStatus } = {},
): Promise<{ data: ComplianceCase[] }> {
  const data = store()
    .cases.filter((c) => !query.status || c.status === query.status)
    .sort((a, b) => a.decide_by.localeCompare(b.decide_by))
    .map((c) => ({ ...c, entries: [...c.entries] }));
  return { data };
}

function findCase(caseId: string): ComplianceCase | undefined {
  return store().cases.find((c) => c.id === caseId);
}

function stateInvalid(c: ComplianceCase): SampleOutcome<never> {
  return failed(409, "compliance.case_state_invalid", `The case is ${c.status}.`);
}

const OPEN: readonly CaseStatus[] = ["received", "under_review", "awaiting_response"];

/**
 * Thay bằng POST /api/v1/compliance/cases/{id}/restrict (bước 37): ẩn tạm đích trong lúc xem xét
 * (event `compliance.target_restricted`, module sở hữu đích tự ẩn). Không phải quyết định cuối.
 */
export async function restrictCase(
  caseId: string,
): Promise<SampleOutcome<ComplianceCase & { previous: string }>> {
  const c = findCase(caseId);
  if (!c) return failed(404, "compliance.case_not_found", "No case has this id.");
  if (!OPEN.includes(c.status) || c.restricted) return stateInvalid(c);
  const previous = c.status;
  c.restricted = true;
  if (c.status === "received") c.status = "under_review";
  c.entries.unshift({ at: new Date().toISOString(), kind: "restriction", text: "restricted" });
  c.updated_at = new Date().toISOString();
  return { ok: true, data: { ...c, previous } };
}

/** Thay bằng POST /api/v1/compliance/cases/{id}/restore (bước 37): hiện lại đích (Hoàn tác). */
export async function restoreCase(
  caseId: string,
  status?: CaseStatus,
): Promise<SampleOutcome<ComplianceCase>> {
  const c = findCase(caseId);
  if (!c) return failed(404, "compliance.case_not_found", "No case has this id.");
  if (!OPEN.includes(c.status) || !c.restricted) return stateInvalid(c);
  c.restricted = false;
  if (status && OPEN.includes(status)) c.status = status;
  c.entries.unshift({ at: new Date().toISOString(), kind: "restriction", text: "restored" });
  c.updated_at = new Date().toISOString();
  return { ok: true, data: { ...c } };
}

/**
 * Thay bằng POST /api/v1/compliance/cases/{id}/entries `{kind: "mail"}` (bước 37): báo bên bị phản
 * ánh, hạn phản hồi tính theo ngày làm việc từ `cases.deadlines`.
 */
export async function notifyRespondent(caseId: string): Promise<SampleOutcome<ComplianceCase>> {
  const c = findCase(caseId);
  if (!c) return failed(404, "compliance.case_not_found", "No case has this id.");
  if (!["received", "under_review"].includes(c.status) || !c.respondent) return stateInvalid(c);
  const deadlines = ruleAt<Record<CaseKind, CaseDeadline>>("cases.deadlines")?.body;
  const days = deadlines?.[c.kind]?.respond_days ?? 3;
  c.status = "awaiting_response";
  c.respond_by = addBusinessDays(new Date(), days).toISOString();
  c.entries.unshift({ at: new Date().toISOString(), kind: "mail", text: "respondent_notified" });
  c.updated_at = new Date().toISOString();
  return { ok: true, data: { ...c } };
}

/**
 * Thay bằng POST /api/v1/compliance/cases/{id}/decision (bước 37) khi core có. Cần phiên đăng nhập
 * của người có `compliance.cases.handle` (API key, agent không quyết được); không đảo được.
 */
export async function decideCase(
  caseId: string,
  input: { decision: string; reason: string },
): Promise<SampleOutcome<ComplianceCase>> {
  const c = findCase(caseId);
  if (!c) return failed(404, "compliance.case_not_found", "No case has this id.");
  if (!OPEN.includes(c.status)) return stateInvalid(c);
  const errors: NonNullable<Problem["errors"]> = [];
  if (!["upheld", "rejected", "partially_upheld"].includes(input.decision)) {
    errors.push({ field: "decision", code: "unknown", detail: "is not a decision" });
  }
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 500) {
    errors.push({ field: "reason", code: "length_10_500", detail: "10 to 500 characters" });
  }
  if (errors.length > 0) return invalid(errors);
  c.status = "decided";
  c.decision = input.decision as ComplianceCase["decision"];
  c.decided_at = new Date().toISOString();
  if (c.decision === "rejected") c.restricted = false;
  c.entries.unshift({ at: c.decided_at, kind: "decision", text: reason });
  c.updated_at = c.decided_at;
  return { ok: true, data: { ...c } };
}

// ---------------------------------------------------------------- Nhãn AI

/** Đề xuất ("mới"): lọc `ai_generated` / `ai_assisted` trên sản phẩm và media. */
export async function listAiLabelled(): Promise<{ data: AiLabelled[] }> {
  return { data: store().ai.map((a) => ({ ...a })) };
}

/** Đề xuất ("mới"): bỏ hay gắn lại nhãn "AI hỗ trợ" (ghi audit kèm người làm). */
export async function setAiLabel(
  itemId: string,
  label: AiLabelled["label"],
): Promise<SampleOutcome<AiLabelled & { previous: string }>> {
  const item = store().ai.find((a) => a.id === itemId);
  if (!item) return failed(404, "compliance.ai_item_not_found", "No item has this id.");
  // Nội dung do AI tạo (chưa người viết lại) không bỏ nhãn được.
  if (item.label === "ai_generated" || label === "ai_generated") {
    return failed(409, "compliance.ai_label_locked", "AI-generated content keeps its label.");
  }
  const previous = item.label;
  item.label = label;
  item.updated_at = new Date().toISOString();
  return { ok: true, data: { ...item, previous } };
}

// ---------------------------------------------------------------- Yêu cầu của chủ thể dữ liệu

/** Đề xuất ("mới"): GET /api/v1/compliance/subject-requests?status=. Hạn gần nhất trước. */
export async function listSubjectRequests(
  query: { status?: RequestStatus } = {},
): Promise<{ data: SubjectRequest[] }> {
  const data = store()
    .requests.filter((r) => !query.status || r.status === query.status)
    .sort((a, b) => a.due_at.localeCompare(b.due_at))
    .map((r) => ({ ...r }));
  return { data };
}

/** Đề xuất ("mới"): số lần tự xuất / tự xoá trong 30 ngày (chạy ngay, chỉ để theo dõi). */
export async function selfServiceStats(): Promise<{ data: SelfService }> {
  return { data: { exports_30d: 14, deletions_30d: 3 } };
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE = /^\+?[0-9 .-]{8,15}$/;

/** Đề xuất ("mới"): POST /api/v1/compliance/subject-requests. Hạn tính từ quy tắc. */
export async function createSubjectRequest(
  input: NewSubjectRequest,
  recordedBy: string,
): Promise<SampleOutcome<SubjectRequest>> {
  const errors: NonNullable<Problem["errors"]> = [];
  if (!REQUEST_KINDS.includes(input.kind as RequestKind)) {
    errors.push({ field: "kind", code: "unknown", detail: "is not a request kind" });
  }
  if (!REQUEST_CHANNELS.includes(input.channel as RequestChannel)) {
    errors.push({ field: "channel", code: "unknown", detail: "is not a channel" });
  }
  const subject = input.subject.trim();
  if (!subject) errors.push({ field: "subject", code: "required", detail: "must not be empty" });
  else if (!EMAIL.test(subject) && !PHONE.test(subject)) {
    errors.push({ field: "subject", code: "email_or_phone", detail: "is not an email or phone" });
  }
  const note = input.note.trim();
  if (note.length < 5 || note.length > 2000) {
    errors.push({ field: "note", code: "length_5_2000", detail: "5 to 2000 characters" });
  }
  if (errors.length > 0) return invalid(errors);
  const kind = input.kind as RequestKind;
  const now = Date.now();
  const count = store().requests.length + 1;
  const created: SubjectRequest = {
    id: crypto.randomUUID(),
    reference: `YC-${dayOf(now).slice(2, 4)}${dayOf(now).slice(5, 7)}-${String(count + 20).padStart(3, "0")}`,
    kind,
    channel: input.channel as RequestChannel,
    subject: EMAIL.test(subject) ? subject.toLowerCase() : subject,
    note,
    status: "new",
    received_at: new Date(now).toISOString(),
    due_at: new Date(now + requestDays(kind) * DAY).toISOString(),
    recorded_by: recordedBy,
    reason: null,
    updated_at: new Date(now).toISOString(),
  };
  store().requests.push(created);
  return { ok: true, data: created };
}

const REQUEST_MOVES: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  new: ["verifying", "in_progress", "rejected"],
  verifying: ["in_progress", "rejected"],
  in_progress: ["done", "rejected"],
  done: [],
  rejected: [],
};

/**
 * Đề xuất ("mới"): POST /api/v1/compliance/subject-requests/{id}/status. Đã trả lời hay từ chối thì
 * không mở lại được; từ chối cần lý do (người yêu cầu nhận lý do và cách khiếu nại).
 */
export async function moveSubjectRequest(
  requestId: string,
  status: string,
  reason = "",
): Promise<SampleOutcome<SubjectRequest>> {
  const found = store().requests.find((r) => r.id === requestId);
  if (!found) return failed(404, "compliance.request_not_found", "No request has this id.");
  if (!REQUEST_MOVES[found.status].includes(status as RequestStatus)) {
    return failed(409, "compliance.request_state_invalid", `The request is ${found.status}.`);
  }
  if (status === "rejected") {
    const text = reason.trim();
    if (text.length < 10 || text.length > 500) {
      return invalid([{ field: "reason", code: "length_10_500", detail: "10 to 500 characters" }]);
    }
    found.reason = text;
  }
  found.status = status as RequestStatus;
  found.updated_at = new Date().toISOString();
  return { ok: true, data: { ...found } };
}
