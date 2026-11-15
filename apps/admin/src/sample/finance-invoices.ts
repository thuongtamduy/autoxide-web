// Dữ liệu mẫu của module `invoices` (bước 36 của core, chưa có): chứng từ và hoá đơn điện tử (gửi nhà
// cung cấp, bị trả lỗi, gửi lại cùng số, điều chỉnh / thay thế / huỷ), ký hiệu và dãy số không nhảy,
// uỷ nhiệm lập hoá đơn thay người bán, bản xuất kế toán. Màn "Kế toán" (W-016). Hình dạng theo đặc tả
// `docs/steps/36-money-ledger-tax.md` (bảng `invoices_*`, mục "Chứng từ và hoá đơn điện tử", "API
// REST", "Mã lỗi"); chỗ đặc tả chưa có ghi "đề xuất".
//
// Số cấp tuần tự theo ký hiệu, chỉ khi phát hành (nháp không có số); hoá đơn đã có mã của cơ quan
// thuế chỉ sửa bằng chứng từ điều chỉnh / thay thế liên kết; chứng từ đã phát hành không xoá được
// (lưu ít nhất 10 năm). Việc của nhà cung cấp (trả mã, lập bản xuất) tiến theo thời gian thật mỗi lần
// đọc. Lệnh ghi đổi một kho trong bộ nhớ của tiến trình máy chủ.
import type { Problem } from "@autoxide/sdk";
import { csvCell, type Money, VARIANT_ID } from "./catalog";
import { FINANCE_ORDER_REFS, journalLines, type SampleOutcome } from "./finance";
import { SAMPLE_UNIT_IDS } from "./org";
import { isTaxCodeFormat, vietnamDay } from "./tax";

const SECOND = 1000;
const DAY = 86_400_000;

/** Nhà cung cấp trả mã của cơ quan thuế sau chừng này (mô phỏng job `invoices.poll_einvoice_status`). */
export const PROVIDER_DELAY_MS = 4 * SECOND;

// ---------------------------------------------------------------- Kiểu theo đặc tả bước 36

export type DocumentKind =
  | "vat_invoice"
  | "sales_invoice"
  | "cash_register_invoice"
  | "withholding_certificate"
  | "cash_receipt";
export const DOCUMENT_KINDS: readonly DocumentKind[] = [
  "vat_invoice",
  "sales_invoice",
  "cash_register_invoice",
  "withholding_certificate",
  "cash_receipt",
];

export type DocumentStatus =
  | "draft"
  | "issued"
  | "submitting"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "replaced"
  | "adjusted";

export interface Party {
  name: string;
  /** Mã số thuế; `null` với người mua cá nhân không có MST. */
  tax_code: string | null;
  kind: "consumer" | "business";
  address: string | null;
}

export interface DocumentLine {
  line_no: number;
  item_ref: string | null;
  /** Ảnh chụp mô tả lúc lập (không đổi khi sản phẩm đổi tên). */
  description: string;
  quantity: string;
  unit_price: Money;
  total: Money;
  rate_percent: string | null;
}

export interface DocumentEvent {
  at: string;
  event:
    | "created"
    | "issued"
    | "submitted"
    | "accepted"
    | "rejected"
    | "resubmitted"
    | "cancelled"
    | "replaced"
    | "adjusted";
  note: string | null;
}

/** Chứng từ (`invoices_documents` + `invoices_lines`). */
export interface InvoiceDocument {
  id: string;
  org_id: string;
  org_name: string;
  /** Lập thay người bán theo uỷ nhiệm. */
  on_behalf_of: { org_id: string; name: string; mandate_number: string } | null;
  kind: DocumentKind;
  series_id: string;
  symbol: string;
  /** `null` khi nháp. */
  number: number | null;
  status: DocumentStatus;
  issue_date: string | null;
  buyer: Party;
  /** Người mua muốn hoá đơn công ty (thông tin xuất hoá đơn khai lúc đặt). */
  buyer_requested_company: boolean;
  lines: DocumentLine[];
  subtotal: Money;
  tax: Money;
  total: Money;
  source_module: "orders" | "marketplace";
  source_id: string;
  related_document_id: string | null;
  correction: "adjustment" | "replacement" | null;
  authority_code: string | null;
  lookup_code: string | null;
  provider_error: { code: string; message: string; at: string } | null;
  retention_until: string | null;
  history: DocumentEvent[];
  /** Lúc nhà cung cấp sẽ trả mã (mô phỏng); `null` = chưa hỏi lại. */
  accept_at: string | null;
}

/** Ký hiệu chứng từ (`invoices_series`), mỗi ký hiệu một dãy số riêng theo năm. */
export interface InvoiceSeries {
  id: string;
  org_id: string;
  org_name: string;
  kind: DocumentKind;
  symbol: string;
  year: number;
  einvoice_provider: string | null;
  status: "active" | "inactive";
  /** Số cuối đã cấp (`numbering::current`). */
  last_number: number;
}

/** Uỷ nhiệm lập hoá đơn (`invoices_mandates`): người bán uỷ nhiệm cho sàn lập thay. */
export interface Mandate {
  id: string;
  number: string;
  principal_org_id: string;
  principal_name: string;
  principal_entity: "enterprise" | "household";
  agent_org_id: string;
  agent_name: string;
  kinds: DocumentKind[];
  valid_from: string;
  valid_to: string;
  status: "active" | "revoked";
  document_attached: boolean;
  created_at: string;
}

export type MandateState = "valid" | "scheduled" | "expired" | "revoked";

export function mandateState(m: Mandate, day: string = vietnamDay()): MandateState {
  if (m.status === "revoked") return "revoked";
  if (m.valid_from > day) return "scheduled";
  if (m.valid_to < day) return "expired";
  return "valid";
}

export type ExportProfile = "generic_journal" | "generic_documents";
export type ExportFormat = "csv" | "xlsx";
export type ExportStatus = "queued" | "running" | "ready" | "failed";

/** Bản xuất kế toán (`invoices_exports`), lập bằng job `invoices.build_export`. */
export interface AccountingExport {
  id: string;
  profile: ExportProfile;
  format: ExportFormat;
  period_from: string;
  period_to: string;
  status: ExportStatus;
  row_count: number | null;
  error: string | null;
  attempts: number;
  created_by: string;
  created_at: string;
  /** Hết hạn tải (tệp xoá khỏi `Storage`, lập lại được). */
  expires_on: string | null;
  matches_trial_balance: boolean | null;
}

// ---------------------------------------------------------------- Kho

interface Store {
  documents: InvoiceDocument[];
  series: InvoiceSeries[];
  mandates: Mandate[];
  exports: AccountingExport[];
  seq: number;
}

const uid = (kind: string, n: number) =>
  `01a1e000-0000-7000-8000-${kind}${String(n).padStart(10, "0")}`;

const vnd = (amount: number): Money => ({ amount: String(amount), currency: "VND" });

export const SERIES_ID = {
  vat: uid("f0", 1),
  register: uid("f0", 2),
  batTrang: uid("f0", 3),
  nhaNa: uid("f0", 4),
  withholding: uid("f0", 5),
  vat2025: uid("f0", 6),
} as const;

const PROVIDER = "Nhà cung cấp HĐĐT A (mẫu)";
const NHA_NA = SAMPLE_UNIT_IDS.sellers[0];
const BAT_TRANG = SAMPLE_UNIT_IDS.sellers[1];
const MOC_LAN = "01a1e000-0000-7000-8000-00000000f0a2";

/** Hạn lưu: cuối năm tài chính của ngày lập + 10 năm (Luật Kế toán 88/2015, Điều 41). */
export function retentionUntil(issueDate: string, years = 10): string {
  return `${Number(issueDate.slice(0, 4)) + years}-12-31`;
}

function seed(): Store {
  const now = Date.now();
  const series: InvoiceSeries[] = [
    seriesRow(
      SERIES_ID.vat,
      SAMPLE_UNIT_IDS.root,
      "Bếp Mộc (gốc khách)",
      "vat_invoice",
      "1C26TBM",
      2026,
      PROVIDER,
      4127,
    ),
    seriesRow(
      SERIES_ID.register,
      SAMPLE_UNIT_IDS.root,
      "3 cửa hàng",
      "cash_register_invoice",
      "1C26MBM",
      2026,
      PROVIDER,
      318,
    ),
    seriesRow(
      SERIES_ID.batTrang,
      BAT_TRANG,
      "Gốm Sứ Bát Tràng Xưa",
      "vat_invoice",
      "1C26TGS",
      2026,
      PROVIDER,
      212,
    ),
    seriesRow(
      SERIES_ID.nhaNa,
      NHA_NA,
      "Gia Dụng Nhà Na",
      "sales_invoice",
      "2C26TNN",
      2026,
      PROVIDER,
      41,
    ),
    seriesRow(
      SERIES_ID.withholding,
      SAMPLE_UNIT_IDS.market,
      "Chợ Bếp Mộc",
      "withholding_certificate",
      "CT/26E",
      2026,
      null,
      19,
    ),
    {
      ...seriesRow(
        SERIES_ID.vat2025,
        SAMPLE_UNIT_IDS.root,
        "Bếp Mộc (gốc khách)",
        "vat_invoice",
        "1C25TBM",
        2025,
        PROVIDER,
        51208,
      ),
      status: "inactive",
    },
  ];
  const line = (
    n: number,
    ref: string | null,
    description: string,
    qty: number,
    price: number,
    rate: string | null,
  ): DocumentLine => ({
    line_no: n,
    item_ref: ref,
    description,
    quantity: String(qty),
    unit_price: vnd(price),
    total: vnd(price * qty),
    rate_percent: rate,
  });
  const doc = (
    k: number,
    over: Partial<InvoiceDocument> &
      Pick<InvoiceDocument, "series_id" | "number" | "status" | "buyer" | "source_id">,
    totals: [number, number, number],
  ): InvoiceDocument => {
    const s = series.find((x) => x.id === over.series_id);
    const issue = over.issue_date === undefined ? "2026-11-13" : over.issue_date;
    return {
      id: uid("f1", k),
      org_id: s?.org_id ?? SAMPLE_UNIT_IDS.root,
      org_name: s?.org_name ?? "Bếp Mộc",
      on_behalf_of: null,
      kind: s?.kind ?? "vat_invoice",
      symbol: s?.symbol ?? "",
      issue_date: issue,
      buyer_requested_company: false,
      lines: [],
      subtotal: vnd(totals[0]),
      tax: vnd(totals[1]),
      total: vnd(totals[2]),
      source_module: "orders",
      related_document_id: null,
      correction: null,
      authority_code: null,
      lookup_code: null,
      provider_error: null,
      retention_until: issue ? retentionUntil(issue) : null,
      history: [],
      accept_at: null,
      ...over,
    };
  };
  const person = (name: string): Party => ({
    name,
    tax_code: null,
    kind: "consumer",
    address: null,
  });
  const company = (name: string, tax: string): Party => ({
    name,
    tax_code: tax,
    kind: "business",
    address: "[ĐỊA CHỈ MẪU]",
  });
  const documents: InvoiceDocument[] = [
    doc(
      1,
      {
        series_id: SERIES_ID.vat,
        number: 4127,
        status: "accepted",
        buyer: person("Hồ Gia Bảo"),
        source_id: FINANCE_ORDER_REFS.card,
        authority_code: "[MÃ CQT MẪU]-4127",
        lookup_code: "TC4127MAU",
        lines: [
          line(1, VARIANT_ID.CG26, "Chảo gang 26 cm", 1, 690_000, "8"),
          line(2, VARIANT_ID.NI20, "Nồi inox 3 đáy 20 cm", 1, 540_000, "8"),
        ],
        history: [
          { at: "2026-11-13T01:50:00Z", event: "issued", note: null },
          { at: "2026-11-13T01:52:00Z", event: "accepted", note: null },
        ],
      },
      [1_138_889, 91_111, 1_230_000],
    ),
    doc(
      2,
      {
        series_id: SERIES_ID.vat,
        number: 4126,
        status: "submitting",
        buyer: person("Phan Minh Đức"),
        source_id: "BM-2611-0396",
        history: [
          { at: "2026-11-13T03:15:00Z", event: "issued", note: null },
          { at: "2026-11-13T03:15:00Z", event: "submitted", note: null },
        ],
      },
      [980_556, 78_444, 1_059_000],
    ),
    doc(
      3,
      {
        series_id: SERIES_ID.vat,
        number: 4125,
        status: "rejected",
        issue_date: "2026-11-12",
        buyer: company("Công ty TNHH Lá Chuối Xanh (mẫu)", "[MÃ SỐ THUẾ MẪU — SAI]"),
        buyer_requested_company: true,
        source_id: "BM-2611-0393",
        provider_error: {
          code: "MST_NOT_FOUND",
          message: "Mã số thuế người mua không tồn tại",
          at: "2026-11-12T09:02:00Z",
        },
        history: [
          { at: "2026-11-12T08:58:00Z", event: "issued", note: null },
          { at: "2026-11-12T09:02:00Z", event: "rejected", note: "MST_NOT_FOUND" },
        ],
      },
      [2_277_778, 182_222, 2_460_000],
    ),
    doc(
      4,
      {
        series_id: SERIES_ID.vat,
        number: 4124,
        status: "rejected",
        issue_date: "2026-11-12",
        buyer: company("Công ty CP Phố Bếp (mẫu)", "[MST MẪU 9 CHỮ SỐ]"),
        buyer_requested_company: true,
        source_id: "BM-2611-0390",
        provider_error: {
          code: "MST_FORMAT",
          message: "Mã số thuế người mua sai định dạng (9 chữ số)",
          at: "2026-11-12T08:40:00Z",
        },
        history: [
          { at: "2026-11-12T08:35:00Z", event: "issued", note: null },
          { at: "2026-11-12T08:40:00Z", event: "rejected", note: "MST_FORMAT" },
        ],
      },
      [1_518_519, 121_481, 1_640_000],
    ),
    doc(
      5,
      {
        series_id: SERIES_ID.register,
        number: 318,
        status: "accepted",
        buyer: person("Khách tại quầy"),
        source_id: FINANCE_ORDER_REFS.counter,
        org_name: "CN Thủ Đức",
        authority_code: "[MÃ PHẦN MỀM MẪU]-318",
        history: [{ at: "2026-11-13T04:20:00Z", event: "issued", note: null }],
      },
      [1_759_259, 140_741, 1_900_000],
    ),
    doc(
      6,
      {
        series_id: SERIES_ID.batTrang,
        number: 212,
        status: "accepted",
        issue_date: "2026-11-10",
        buyer: person("Võ Thị Nhàn"),
        source_module: "marketplace",
        source_id: "BM-2611-0388",
        org_id: SAMPLE_UNIT_IDS.market,
        org_name: "Chợ Bếp Mộc",
        on_behalf_of: {
          org_id: BAT_TRANG,
          name: "Gốm Sứ Bát Tràng Xưa",
          mandate_number: "UN-0003",
        },
        authority_code: "[MÃ CQT MẪU]-212",
        history: [{ at: "2026-11-10T06:00:00Z", event: "accepted", note: null }],
      },
      [409_091, 40_909, 450_000],
    ),
    doc(
      7,
      {
        series_id: SERIES_ID.vat,
        number: null,
        status: "draft",
        issue_date: null,
        buyer: company("Phạm Quốc Huy — xin hoá đơn công ty (mẫu)", "[MÃ SỐ THUẾ MẪU]"),
        buyer_requested_company: true,
        source_id: "BM-2611-0414",
        lines: [line(1, VARIANT_ID.BNI3, "Bộ nồi inox 3 chiếc", 1, 2_882_000, "8")],
        history: [{ at: "2026-11-13T04:30:00Z", event: "created", note: null }],
      },
      [2_668_519, 213_481, 2_882_000],
    ),
    doc(
      8,
      {
        series_id: SERIES_ID.vat,
        number: 3870,
        status: "replaced",
        issue_date: "2026-11-03",
        buyer: person("Lê Văn Hùng"),
        source_id: "BM-2611-0322",
        history: [
          { at: "2026-11-03T03:00:00Z", event: "accepted", note: null },
          { at: "2026-11-04T02:20:00Z", event: "replaced", note: "00003902" },
        ],
      },
      [500_000, 40_000, 540_000],
    ),
    doc(
      9,
      {
        series_id: SERIES_ID.vat,
        number: 3511,
        status: "cancelled",
        issue_date: "2026-10-28",
        buyer: person("Ngô Bảo Châu"),
        source_id: "BM-2611-0288",
        history: [
          { at: "2026-10-28T08:00:00Z", event: "accepted", note: null },
          { at: "2026-10-28T09:10:00Z", event: "cancelled", note: null },
        ],
      },
      [240_741, 19_259, 260_000],
    ),
  ];
  const mandates: Mandate[] = [
    mandate(
      1,
      "UN-0003",
      BAT_TRANG,
      "Gốm Sứ Bát Tràng Xưa",
      "enterprise",
      ["vat_invoice"],
      "2026-09-01",
      "2027-08-31",
      "active",
    ),
    mandate(
      2,
      "UN-0005",
      NHA_NA,
      "Gia Dụng Nhà Na",
      "household",
      ["sales_invoice"],
      "2026-11-12",
      "2027-11-11",
      "active",
    ),
    mandate(
      3,
      "UN-0002",
      MOC_LAN,
      "Đồ Gỗ Mộc Lan",
      "enterprise",
      ["vat_invoice"],
      "2026-02-01",
      "2026-10-01",
      "revoked",
    ),
  ];
  const exports: AccountingExport[] = [
    {
      id: uid("f3", 1),
      profile: "generic_journal",
      format: "csv",
      period_from: "2026-10-01",
      period_to: "2026-10-31",
      status: "ready",
      row_count: 11_284,
      error: null,
      attempts: 1,
      created_by: "Đào Thu Hương",
      created_at: "2026-11-13T00:40:00Z",
      expires_on: "2026-11-20",
      matches_trial_balance: true,
    },
    {
      id: uid("f3", 2),
      profile: "generic_documents",
      format: "xlsx",
      period_from: "2026-11-01",
      period_to: "2026-11-12",
      status: "running",
      row_count: null,
      error: null,
      attempts: 1,
      created_by: "Đào Thu Hương",
      // Đang lập lúc máy chủ khởi động; job xong sau vài giây.
      created_at: new Date(now - 2 * SECOND).toISOString(),
      expires_on: null,
      matches_trial_balance: null,
    },
    {
      id: uid("f3", 3),
      profile: "generic_journal",
      format: "xlsx",
      period_from: "2026-09-01",
      period_to: "2026-09-30",
      status: "failed",
      row_count: null,
      error: "timeout",
      attempts: 3,
      created_by: "Lan Phạm",
      created_at: "2026-10-05T01:00:00Z",
      expires_on: null,
      matches_trial_balance: null,
    },
  ];
  return { documents, series, mandates, exports, seq: 0 };
}

function seriesRow(
  id: string,
  org: string,
  orgName: string,
  kind: DocumentKind,
  symbol: string,
  year: number,
  provider: string | null,
  last: number,
): InvoiceSeries {
  return {
    id,
    org_id: org,
    org_name: orgName,
    kind,
    symbol,
    year,
    einvoice_provider: provider,
    status: "active",
    last_number: last,
  };
}

function mandate(
  k: number,
  number: string,
  principal: string,
  name: string,
  entity: Mandate["principal_entity"],
  kinds: DocumentKind[],
  from: string,
  to: string,
  status: Mandate["status"],
): Mandate {
  return {
    id: uid("f2", k),
    number,
    principal_org_id: principal,
    principal_name: name,
    principal_entity: entity,
    agent_org_id: SAMPLE_UNIT_IDS.market,
    agent_name: "Chợ Bếp Mộc",
    kinds,
    valid_from: from,
    valid_to: to,
    status,
    document_attached: true,
    created_at: `${from}T02:00:00Z`,
  };
}

const KEY = Symbol.for("autoxide.sample.finance-invoices.1");
type Holder = { [KEY]?: Store };

function store(): Store {
  const holder = globalThis as Holder;
  holder[KEY] ??= seed();
  sync(holder[KEY]);
  return holder[KEY];
}

/** Về dữ liệu ban đầu (test). */
export function resetSampleInvoices(): void {
  (globalThis as Holder)[KEY] = seed();
}

/** Việc của nhà cung cấp và của job, theo thời gian thật mỗi lần đọc. */
function sync(s: Store, now = Date.now()): void {
  for (const d of s.documents) {
    if (d.status === "submitting" && d.accept_at && Date.parse(d.accept_at) <= now) {
      d.status = "accepted";
      d.authority_code = `[MÃ CQT MẪU]-${d.number ?? ""}`;
      d.lookup_code = `TC${d.number ?? ""}MAU`;
      d.history.push({ at: d.accept_at, event: "accepted", note: null });
      const related = s.documents.find((x) => x.id === d.related_document_id);
      if (related && d.correction) {
        related.status = d.correction === "adjustment" ? "adjusted" : "replaced";
        related.history.push({
          at: d.accept_at,
          event: d.correction === "adjustment" ? "adjusted" : "replaced",
          note: numberText(d.number),
        });
      }
    }
  }
  for (const x of s.exports) {
    const started = Date.parse(x.created_at);
    if (x.status === "queued" && now - started >= 1500) x.status = "running";
    if (x.status === "running" && now - started >= 5000) {
      x.status = "ready";
      x.row_count = x.row_count ?? 0;
      x.expires_on = new Date(now + 7 * DAY).toISOString().slice(0, 10);
      x.matches_trial_balance = true;
    }
  }
}

function newId(s: Store, kind: string): string {
  s.seq += 1;
  return uid(kind, 900_000 + s.seq);
}

function fail(
  status: number,
  code: string,
  detail: string,
  errors?: Problem["errors"],
): SampleOutcome<never> {
  return {
    ok: false,
    problem: {
      type: "about:blank",
      title:
        status === 404
          ? "Not Found"
          : status === 409
            ? "Conflict"
            : status === 403
              ? "Forbidden"
              : "Unprocessable Entity",
      status,
      code,
      detail,
      ...(errors && errors.length > 0 ? { errors } : {}),
    },
  };
}

type FieldError = NonNullable<Problem["errors"]>[number];
const fieldError = (field: string, code: string, detail = code): FieldError => ({
  field,
  code,
  detail,
});
const invalid = (errors: FieldError[]) =>
  fail(422, "validation_failed", "The request has invalid fields.", errors);

const DAY_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (text: string) =>
  DAY_FORMAT.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`));

/** Số hoá đơn tám chữ số, như in trên hoá đơn: 4127 → "00004127". */
export function numberText(n: number | null): string {
  return n === null ? "" : String(n).padStart(8, "0");
}

// ---------------------------------------------------------------- Chứng từ

export type DocumentFilter = "rejected" | "submitting" | "accepted" | "draft" | "corrected";

// Thay bằng GET /api/v1/invoices/documents?status=&cursor= (bước 36) khi core có. Bị trả lỗi trước,
// rồi mới nhất trước.
export async function listDocuments(filter?: DocumentFilter): Promise<{ data: InvoiceDocument[] }> {
  const rank = (d: InvoiceDocument) => (d.status === "rejected" ? 0 : d.status === "draft" ? 1 : 2);
  const rows = store()
    .documents.filter((d) =>
      !filter
        ? true
        : filter === "corrected"
          ? d.status === "replaced" ||
            d.status === "adjusted" ||
            d.status === "cancelled" ||
            d.correction !== null
          : d.status === filter,
    )
    .sort(
      (x, y) =>
        rank(x) - rank(y) ||
        (y.issue_date ?? "9999").localeCompare(x.issue_date ?? "9999") ||
        (y.number ?? 0) - (x.number ?? 0),
    );
  return { data: structuredClone(rows) };
}

// Thay bằng GET /api/v1/invoices/documents/{id} (bước 36) khi core có.
export async function getDocument(id: string): Promise<InvoiceDocument | null> {
  const found = store().documents.find((d) => d.id === id);
  return found ? structuredClone(found) : null;
}

/** Số liệu đầu tab Hoá đơn điện tử. */
export async function einvoiceStats(): Promise<{
  vat: InvoiceSeries | null;
  register: InvoiceSeries | null;
  rejected: number;
  submitting: number;
  drafts: number;
}> {
  const s = store();
  return {
    vat: structuredClone(s.series.find((x) => x.id === SERIES_ID.vat) ?? null),
    register: structuredClone(s.series.find((x) => x.id === SERIES_ID.register) ?? null),
    rejected: s.documents.filter((d) => d.status === "rejected").length,
    submitting: s.documents.filter((d) => d.status === "submitting").length,
    drafts: s.documents.filter((d) => d.status === "draft").length,
  };
}

function documentState(id: string, wanted: DocumentStatus[]): SampleOutcome<InvoiceDocument> {
  const d = store().documents.find((x) => x.id === id);
  if (!d) return fail(404, "invoices.document_not_found", "This document does not exist.");
  if (!wanted.includes(d.status)) {
    return fail(
      409,
      "invoices.document_state",
      `The document is ${d.status}; this action needs ${wanted.join(" or ")}.`,
    );
  }
  return { ok: true, data: d };
}

/**
 * Thay bằng PATCH /api/v1/invoices/documents/{id} (sửa người mua của chứng từ bị trả lỗi) rồi
 * POST …/issue (gửi lại) (bước 36) khi core có. Giữ nguyên ký hiệu và số; chỉ sửa trường bị báo lỗi.
 */
export async function resubmitDocument(
  id: string,
  input: { buyer_tax_code: string; buyer_name: string; buyer_address: string },
): Promise<SampleOutcome<InvoiceDocument>> {
  const found = documentState(id, ["rejected"]);
  if (!found.ok) return found;
  const errors: FieldError[] = [];
  const taxCode = input.buyer_tax_code.trim();
  if (!taxCode) errors.push(fieldError("buyer_tax_code", "required"));
  else if (!isTaxCodeFormat(taxCode))
    errors.push(fieldError("buyer_tax_code", "invoices.buyer_tax_code_invalid"));
  if (!input.buyer_name.trim()) errors.push(fieldError("buyer_name", "required"));
  if (errors.length > 0) return invalid(errors);
  const d = found.data;
  d.buyer = {
    ...d.buyer,
    tax_code: taxCode,
    name: input.buyer_name.trim(),
    address: input.buyer_address.trim() || d.buyer.address,
  };
  d.status = "submitting";
  d.provider_error = null;
  d.accept_at = new Date(Date.now() + PROVIDER_DELAY_MS).toISOString();
  d.history.push({ at: new Date().toISOString(), event: "resubmitted", note: null });
  return { ok: true, data: structuredClone(d) };
}

/**
 * Hỏi lại nhà cung cấp (đề xuất POST /api/v1/invoices/documents/{id}/refresh; core hỏi định kỳ bằng
 * job `invoices.poll_einvoice_status` mỗi 5 phút). Trả trạng thái hiện tại.
 */
export async function refreshDocument(id: string): Promise<SampleOutcome<InvoiceDocument>> {
  const found = documentState(id, ["submitting", "accepted"]);
  if (!found.ok) return found;
  const d = found.data;
  if (d.status === "submitting" && !d.accept_at) {
    d.accept_at = new Date(Date.now() + PROVIDER_DELAY_MS).toISOString();
  }
  return { ok: true, data: structuredClone(d) };
}

export type CorrectionKind = "adjustment" | "replacement" | "cancel";
export const CORRECTION_KINDS: readonly CorrectionKind[] = ["adjustment", "replacement", "cancel"];

/**
 * Thay bằng POST /api/v1/invoices/documents/{id}/adjust, /replace, /cancel (bước 36,
 * `invoices.correct`) khi core có. Hoá đơn đã có mã của cơ quan thuế không sửa trực tiếp: điều chỉnh
 * / thay thế tạo chứng từ nháp liên kết (phát hành để cấp số); huỷ theo thông báo sai sót đổi ngay.
 */
export async function correctDocument(
  id: string,
  input: { how: string; reason: string },
): Promise<SampleOutcome<{ original: InvoiceDocument; created: InvoiceDocument | null }>> {
  const found = documentState(id, ["accepted"]);
  if (!found.ok) return found;
  const errors: FieldError[] = [];
  const how = CORRECTION_KINDS.find((k) => k === input.how);
  if (!how) errors.push(fieldError("how", "unknown"));
  if (input.reason.trim().length < 5) errors.push(fieldError("reason", "length_5_200"));
  if (errors.length > 0 || !how) return invalid(errors);
  const s = store();
  const d = found.data;
  if (s.documents.some((x) => x.related_document_id === d.id && x.status === "draft")) {
    return fail(409, "invoices.correction_pending", "A correction draft already exists.");
  }
  if (how === "cancel") {
    d.status = "cancelled";
    d.history.push({ at: new Date().toISOString(), event: "cancelled", note: input.reason.trim() });
    return { ok: true, data: { original: structuredClone(d), created: null } };
  }
  const created: InvoiceDocument = {
    ...structuredClone(d),
    id: newId(s, "f1"),
    number: null,
    status: "draft",
    issue_date: null,
    related_document_id: d.id,
    correction: how === "adjustment" ? "adjustment" : "replacement",
    authority_code: null,
    lookup_code: null,
    provider_error: null,
    retention_until: null,
    accept_at: null,
    history: [{ at: new Date().toISOString(), event: "created", note: input.reason.trim() }],
  };
  s.documents.push(created);
  return { ok: true, data: { original: structuredClone(d), created: structuredClone(created) } };
}

/**
 * Thay bằng POST /api/v1/invoices/documents/{id}/issue (bước 36, `invoices.issue`) khi core có.
 * Trong một transaction: kiểm ký hiệu đang dùng, uỷ nhiệm khi lập thay, cấp số kế tiếp của dãy
 * (không nhảy số), đặt hạn lưu; gửi nhà cung cấp ở job sau khi commit. Gọi lại trả cùng số.
 */
export async function issueDocument(id: string): Promise<SampleOutcome<InvoiceDocument>> {
  const s = store();
  const d = s.documents.find((x) => x.id === id);
  if (!d) return fail(404, "invoices.document_not_found", "This document does not exist.");
  if (d.status !== "draft") return { ok: true, data: structuredClone(d) };
  const series = s.series.find((x) => x.id === d.series_id);
  if (!series)
    return fail(404, "invoices.series_not_found", "This document series does not exist.");
  if (series.status !== "active") {
    return fail(
      409,
      "invoices.series_inactive",
      `The series ${series.symbol} is no longer in use.`,
    );
  }
  if (d.on_behalf_of) {
    const today = vietnamDay();
    const ok = s.mandates.some(
      (m) =>
        m.principal_org_id === d.on_behalf_of?.org_id &&
        m.kinds.includes(d.kind) &&
        mandateState(m, today) === "valid",
    );
    if (!ok) {
      return fail(
        403,
        "invoices.mandate_missing",
        "No mandate in effect lets you issue invoices for this seller.",
      );
    }
  }
  series.last_number += 1;
  const now = new Date();
  d.number = series.last_number;
  d.issue_date = vietnamDay(now.getTime());
  d.retention_until = retentionUntil(d.issue_date);
  d.status = series.einvoice_provider ? "submitting" : "issued";
  d.accept_at = series.einvoice_provider
    ? new Date(now.getTime() + PROVIDER_DELAY_MS).toISOString()
    : null;
  d.history.push({ at: now.toISOString(), event: "issued", note: numberText(d.number) });
  return { ok: true, data: structuredClone(d) };
}

/**
 * Thay bằng DELETE /api/v1/invoices/documents/{id} (bước 36) khi core có. Chỉ nháp xoá được; chứng
 * từ đã phát hành phải lưu tới hạn (`invoices.retention_hold`).
 */
export async function deleteDraft(id: string): Promise<SampleOutcome<undefined>> {
  const s = store();
  const d = s.documents.find((x) => x.id === id);
  if (!d) return fail(404, "invoices.document_not_found", "This document does not exist.");
  if (d.status !== "draft") {
    return fail(
      409,
      "invoices.retention_hold",
      `Accounting documents must be kept until ${d.retention_until ?? ""}.`,
    );
  }
  s.documents = s.documents.filter((x) => x.id !== id);
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------- Ký hiệu

// Thay bằng GET /api/v1/invoices/series (bước 36) khi core có. Đang dùng trước.
export async function listSeries(): Promise<{ data: InvoiceSeries[] }> {
  const rows = structuredClone(store().series).sort(
    (x, y) => (x.status === y.status ? 0 : x.status === "active" ? -1 : 1) || y.year - x.year,
  );
  return { data: rows };
}

/** Ký hiệu hoá đơn theo dạng của TT 78/2021 (cần đối chiếu): vd 1C26TBM; chứng từ khấu trừ: CT/26E. */
export function symbolYear(kind: DocumentKind, symbol: string): number | null {
  const invoice = /^[1-6][CK](\d{2})[TDLMNBGH][A-Z]{2}$/.exec(symbol);
  const certificate = /^[A-Z]{2}\/(\d{2})[A-Z]$/.exec(symbol);
  const match =
    kind === "withholding_certificate" || kind === "cash_receipt" ? certificate : invoice;
  return match?.[1] ? 2000 + Number(match[1]) : null;
}

/**
 * Thay bằng POST /api/v1/invoices/series (bước 36, `invoices.series_manage`) khi core có. Mỗi ký hiệu
 * có dãy số riêng, bắt đầu từ 1; năm trong ký hiệu phải khớp năm của dãy.
 */
export async function createSeries(input: {
  org_id: string;
  org_name: string;
  kind: string;
  symbol: string;
  year: string;
}): Promise<SampleOutcome<InvoiceSeries>> {
  const s = store();
  const errors: FieldError[] = [];
  const kind = DOCUMENT_KINDS.find((k) => k === input.kind);
  if (!kind) errors.push(fieldError("kind", "unknown"));
  const symbol = input.symbol.trim().toUpperCase();
  const year = Number(input.year);
  if (!/^\d{4}$/.test(input.year.trim()) || year < 2020 || year > 2100)
    errors.push(fieldError("year", "year"));
  if (!symbol) errors.push(fieldError("symbol", "required"));
  else if (kind && symbolYear(kind, symbol) === null)
    errors.push(fieldError("symbol", "series_symbol"));
  else if (kind && symbolYear(kind, symbol) !== year)
    errors.push(fieldError("symbol", "series_year"));
  if (!input.org_id) errors.push(fieldError("org_id", "required"));
  if (errors.length > 0 || !kind) return invalid(errors);
  if (
    s.series.some(
      (x) => x.org_id === input.org_id && x.kind === kind && x.symbol === symbol && x.year === year,
    )
  ) {
    return fail(409, "invoices.series_taken", `The series ${symbol} already exists.`, [
      fieldError("symbol", "taken"),
    ]);
  }
  const row = seriesRow(
    newId(s, "f0"),
    input.org_id,
    input.org_name,
    kind,
    symbol,
    year,
    kind === "withholding_certificate" || kind === "cash_receipt" ? null : PROVIDER,
    0,
  );
  s.series.push(row);
  return { ok: true, data: { ...row } };
}

/** Thay bằng PATCH /api/v1/invoices/series/{id} {status: inactive} (bước 36) khi core có. */
export async function deactivateSeries(id: string): Promise<SampleOutcome<InvoiceSeries>> {
  const row = store().series.find((x) => x.id === id);
  if (!row) return fail(404, "invoices.series_not_found", "This document series does not exist.");
  if (row.status === "inactive") {
    return fail(409, "invoices.series_inactive", `The series ${row.symbol} is no longer in use.`);
  }
  row.status = "inactive";
  return { ok: true, data: { ...row } };
}

// ---------------------------------------------------------------- Uỷ nhiệm

// Thay bằng GET /api/v1/invoices/mandates (bước 36) khi core có.
export async function listMandates(): Promise<{ data: Mandate[] }> {
  return { data: structuredClone(store().mandates) };
}

/**
 * Thay bằng POST /api/v1/invoices/mandates (bước 36, `invoices.mandates_manage`) khi core có. Văn bản
 * uỷ nhiệm đã ký đính kèm qua media (`document_file_id`); việc uỷ nhiệm phải thông báo với cơ quan
 * thuế (TT 78/2021 và văn bản thay thế — cần đối chiếu).
 */
export async function createMandate(input: {
  principal_org_id: string;
  principal_name: string;
  kind: string;
  valid_from: string;
  valid_to: string;
  signed: boolean;
}): Promise<SampleOutcome<Mandate>> {
  const s = store();
  const errors: FieldError[] = [];
  if (!input.principal_org_id) errors.push(fieldError("principal_org_id", "required"));
  const kind = (["vat_invoice", "sales_invoice"] as const).find((k) => k === input.kind);
  if (!kind) errors.push(fieldError("kind", "unknown"));
  if (!isDay(input.valid_from)) errors.push(fieldError("valid_from", "required"));
  if (!isDay(input.valid_to)) errors.push(fieldError("valid_to", "required"));
  else if (isDay(input.valid_from) && input.valid_to <= input.valid_from)
    errors.push(fieldError("valid_to", "after_start"));
  if (!input.signed) errors.push(fieldError("signed", "acknowledge"));
  if (errors.length > 0 || !kind) return invalid(errors);
  const overlap = s.mandates.some(
    (m) =>
      m.status === "active" &&
      m.principal_org_id === input.principal_org_id &&
      m.kinds.includes(kind) &&
      m.valid_from <= input.valid_to &&
      input.valid_from <= m.valid_to,
  );
  if (overlap) {
    return fail(
      409,
      "invoices.mandate_overlap",
      "This seller already has a mandate in effect for these dates.",
    );
  }
  const last = s.mandates.map((m) => Number(m.number.slice(3))).reduce((a, b) => Math.max(a, b), 0);
  const row: Mandate = {
    id: newId(s, "f2"),
    number: `UN-${String(last + 1).padStart(4, "0")}`,
    principal_org_id: input.principal_org_id,
    principal_name: input.principal_name,
    principal_entity: input.principal_org_id === NHA_NA ? "household" : "enterprise",
    agent_org_id: SAMPLE_UNIT_IDS.market,
    agent_name: "Chợ Bếp Mộc",
    kinds: [kind],
    valid_from: input.valid_from,
    valid_to: input.valid_to,
    status: "active",
    document_attached: true,
    created_at: new Date().toISOString(),
  };
  s.mandates.push(row);
  return { ok: true, data: { ...row } };
}

/** Thay bằng POST /api/v1/invoices/mandates/{id}/revoke (bước 36) khi core có. Có hiệu lực ngay. */
export async function revokeMandate(id: string): Promise<SampleOutcome<Mandate>> {
  const row = store().mandates.find((m) => m.id === id);
  if (!row) return fail(404, "invoices.mandate_not_found", "This mandate does not exist.");
  if (row.status === "revoked") {
    return fail(409, "invoices.mandate_revoked", "This mandate was already revoked.");
  }
  row.status = "revoked";
  return { ok: true, data: { ...row } };
}

// ---------------------------------------------------------------- Bản xuất kế toán

// Thay bằng GET /api/v1/invoices/exports (đề xuất: đặc tả có GET /exports/{id}) khi core có.
export async function listExports(): Promise<{ data: AccountingExport[] }> {
  return {
    data: structuredClone(store().exports).sort((x, y) => y.created_at.localeCompare(x.created_at)),
  };
}

/**
 * Thay bằng POST /api/v1/invoices/exports (bước 36, `invoices.export`) khi core có: xếp job
 * `invoices.build_export`; tải ở `GET /exports/{id}/download` khi xong.
 */
export async function createExport(
  input: { profile: string; format: string; period_from: string; period_to: string },
  actor: string,
): Promise<SampleOutcome<AccountingExport>> {
  const errors: FieldError[] = [];
  const profile = (["generic_journal", "generic_documents"] as const).find(
    (p) => p === input.profile,
  );
  const format = (["csv", "xlsx"] as const).find((f) => f === input.format);
  if (!profile) errors.push(fieldError("profile", "unknown"));
  if (!format) errors.push(fieldError("format", "unknown"));
  if (!isDay(input.period_from)) errors.push(fieldError("period_from", "required"));
  if (!isDay(input.period_to)) errors.push(fieldError("period_to", "required"));
  else if (isDay(input.period_from) && input.period_to < input.period_from)
    errors.push(fieldError("period_to", "after_start"));
  if (errors.length > 0 || !profile || !format) return invalid(errors);
  const s = store();
  const rows =
    profile === "generic_journal"
      ? (await journalLines("main", input.period_from, input.period_to)).length
      : s.documents.filter(
          (d) =>
            d.issue_date !== null &&
            d.issue_date >= input.period_from &&
            d.issue_date <= input.period_to,
        ).length;
  const row: AccountingExport = {
    id: newId(s, "f3"),
    profile,
    format,
    period_from: input.period_from,
    period_to: input.period_to,
    status: "queued",
    row_count: rows,
    error: null,
    attempts: 1,
    created_by: actor,
    created_at: new Date().toISOString(),
    expires_on: null,
    matches_trial_balance: null,
  };
  s.exports.push(row);
  return { ok: true, data: { ...row } };
}

/** Thay bằng POST /api/v1/invoices/exports/{id}/retry (đề xuất) khi core có. Chỉ bản lỗi. */
export async function retryExport(id: string): Promise<SampleOutcome<AccountingExport>> {
  const s = store();
  const row = s.exports.find((x) => x.id === id);
  if (!row) return fail(404, "invoices.export_not_found", "This export does not exist.");
  if (row.status !== "failed") {
    return fail(409, "invoices.export_not_ready", `The export is ${row.status}.`);
  }
  // Lập lại là một việc mới (id mới), bản lỗi giữ lại làm dấu vết.
  const again: AccountingExport = {
    ...row,
    id: newId(s, "f3"),
    status: "queued",
    error: null,
    attempts: row.attempts + 1,
    created_at: new Date().toISOString(),
  };
  s.exports.push(again);
  return { ok: true, data: { ...again } };
}

/**
 * Thay bằng GET /api/v1/invoices/exports/{id}/download (bước 36) khi core có. CSV UTF-8 có BOM,
 * CRLF, ô bắt đầu bằng = + - @ thêm dấu nháy. Bản mẫu chỉ dựng CSV; XLSX chờ API.
 */
export async function exportFile(
  id: string,
): Promise<SampleOutcome<{ file_name: string; csv: string }>> {
  const s = store();
  const row = s.exports.find((x) => x.id === id);
  if (!row) return fail(404, "invoices.export_not_found", "This export does not exist.");
  if (row.status !== "ready" || row.format !== "csv") {
    return fail(409, "invoices.export_not_ready", `The export is ${row.status}.`);
  }
  const lines: string[][] = [];
  if (row.profile === "generic_journal") {
    lines.push([
      "date",
      "entry",
      "reference",
      "description",
      "account",
      "purpose",
      "debit",
      "credit",
      "currency",
      "counterparty",
    ]);
    for (const l of await journalLines("main", row.period_from, row.period_to)) {
      lines.push([
        l.effective_date,
        l.entry_id,
        l.reference,
        l.description,
        l.external_code,
        l.purpose,
        l.side === "debit" ? l.amount.amount : "",
        l.side === "credit" ? l.amount.amount : "",
        l.amount.currency,
        l.counterparty,
      ]);
    }
  } else {
    lines.push([
      "issue_date",
      "symbol",
      "number",
      "kind",
      "status",
      "buyer",
      "buyer_tax_code",
      "subtotal",
      "tax",
      "total",
      "currency",
      "source",
    ]);
    for (const d of s.documents.filter(
      (x) =>
        x.issue_date !== null && x.issue_date >= row.period_from && x.issue_date <= row.period_to,
    )) {
      lines.push([
        d.issue_date ?? "",
        d.symbol,
        numberText(d.number),
        d.kind,
        d.status,
        d.buyer.name,
        d.buyer.tax_code ?? "",
        d.subtotal.amount,
        d.tax.amount,
        d.total.amount,
        d.total.currency,
        d.source_id,
      ]);
    }
  }
  const csv = `﻿${lines.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
  const name = row.profile === "generic_journal" ? "so-nhat-ky-chung" : "danh-sach-chung-tu";
  return { ok: true, data: { file_name: `${name}-${row.period_from}-${row.period_to}.csv`, csv } };
}

/** Số mục cần xử lý (nhãn số trên tab Hoá đơn điện tử). */
export async function invoiceCounts(): Promise<{ rejected: number }> {
  return { rejected: store().documents.filter((d) => d.status === "rejected").length };
}
