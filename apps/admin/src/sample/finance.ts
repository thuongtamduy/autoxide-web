// Dữ liệu mẫu của module `ledger` (bước 36 của core, chưa có): sổ cái kép chỉ thêm, chuỗi băm niêm
// phong, kỳ kế toán và khoá sổ, cân đối thử, thanh toán chờ khớp, hàng chờ sai lệch, lần đối soát,
// tài khoản ngân hàng nhận chuyển khoản và mã VietQR. Màn "Kế toán" (W-016) dựng bằng file này cùng
// `finance-invoices.ts` (module `invoices`) và phần thêm của `tax.ts` (module `tax`). Hình dạng theo
// đặc tả `docs/steps/36-money-ledger-tax.md` của core (mục "Bảng dữ liệu", "Sổ cái: luật ghi", "API
// REST", "Mã lỗi"); chỗ đặc tả chưa có ghi "đề xuất" và nằm trong bảng chỗ thiếu API.
//
// Luật của core giữ nguyên ở đây: tiền là số nguyên đồng + mã tiền tệ (`Money`, `amount` là chuỗi);
// bút toán chỉ thêm, sai thì ghi bút toán đảo; tổng Nợ bằng tổng Có; kỳ đã khoá không nhận bút toán
// và không mở lại; core không bao giờ giữ tiền của người mua (D-187) — tiền vào thẳng tài khoản của
// cửa hàng hay tài khoản thu hộ của đối tác có giấy phép, sổ chỉ ghi nghĩa vụ và đối chiếu sao kê.
//
// Mỗi sổ có hai phần: bút toán chi tiết (bản ghi đầy đủ, hiện trên màn) và phát sinh gộp của các
// bút toán khác trong kỳ (`AGGREGATES`, để số liệu trông như một chuỗi đang chạy thật). Cân đối thử,
// thuế theo kỳ cộng cả hai. Lệnh ghi đổi một kho trong bộ nhớ của tiến trình máy chủ.
import { createHash } from "node:crypto";
import type { Problem } from "@autoxide/sdk";
import type { Money } from "./catalog";
import { type SamplePage, samplePage } from "./index";
import { SAMPLE_UNIT_IDS } from "./org";
import { vietnamDay } from "./tax";

export type SampleOutcome<T> = { ok: true; data: T } | { ok: false; problem: Problem };

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** Job `ledger.seal_entries` chạy mười giây một lần: bút toán ghi trước đó được niêm phong. */
export const SEAL_INTERVAL_MS = 10 * SECOND;
/** `AUTOXIDE_LEDGER_PAYMENT_EXPIRY_MINUTES` (mặc định 30): hạn của thanh toán chuyển khoản. */
export const PAYMENT_EXPIRY_MINUTES = 30;

/**
 * Mã đơn mẫu mà sổ cái, hàng chờ và hoá đơn trỏ tới, theo bản thiết kế (`BM-2611-04xx`). Phân hệ
 * Bán hàng dựng `sample/order-refs.ts`; khi gộp thì trỏ các mã này về đó.
 */
export const FINANCE_ORDER_REFS = {
  counter: "BM-2611-0416",
  vietqr: "BM-2611-0412",
  web: "BM-2611-0398",
  market: "BM-2611-0417",
  marketSettled: "BM-2611-0350",
  mismatch: "BM-2611-0411",
  late: "BM-2611-0405",
  card: "BM-2611-0409",
  pendingTransfer: "BM-2611-0419",
} as const;

// ---------------------------------------------------------------- Kiểu theo đặc tả bước 36

export type BookKey = "main" | "market";
export type Side = "debit" | "credit";

/** Sổ (`ledger_books`): mỗi đơn vị kế toán một sổ — gốc khách và sàn của khách. */
export interface LedgerBook {
  id: string;
  key: BookKey;
  org_id: string;
  org_name: string;
  base_currency: string;
  fiscal_year_start_month: number;
}

export interface Counterparty {
  kind: "org" | "customer" | "carrier" | "partner";
  id: string;
  name: string;
}

/** Tài khoản sổ cái (`ledger_accounts`): mục đích ổn định + đối tượng, không phải số hiệu kế toán. */
export interface LedgerAccount {
  id: string;
  book_id: string;
  /** Chuỗi ổn định, hợp đồng với module khác (`cash.bank`, `revenue.sales`…). */
  purpose: string;
  counterparty: Counterparty | null;
  currency: string;
  normal_side: Side;
  /** Số hiệu theo chế độ kế toán khi xuất; `null` = theo ánh xạ mặc định (`VN_ACCOUNT_MAP`). */
  external_code: string | null;
  status: "active" | "closed";
}

/** Ảnh chụp thuế trên dòng thuế (thuế suất lúc tính, giá chưa thuế) để báo cáo thuế theo kỳ. */
export interface LineTax {
  category: string;
  rate_percent: string;
  base: Money;
}

export interface EntryLine {
  line_no: number;
  account_id: string;
  side: Side;
  amount: Money;
  tax: LineTax | null;
}

/** Niêm phong vào chuỗi băm (`ledger_entry_seals`). */
export interface EntrySeal {
  sequence: number;
  entry_hash: string;
  chain_hash: string;
  sealed_at: string;
}

/** Bút toán (`ledger_entries` + `ledger_lines`). Chỉ thêm: không sửa, không xoá. */
export interface LedgerEntry {
  id: string;
  book_id: string;
  period_id: string;
  /** Ngày hiệu lực `YYYY-MM-DD` theo giờ của nút. */
  effective_date: string;
  posted_at: string;
  /** Chữ cố định của module (bút toán tay: diễn giải người ghi gõ); không dữ liệu cá nhân. */
  description: string;
  source_module: "orders" | "marketplace" | "ledger";
  /** `capture` · `deliver` · `settle` · `gateway_fee` · `manual` · `reversal`. */
  source_kind: string;
  /** Mã chứng từ nguồn: mã đơn, ngày sao kê… */
  source_id: string | null;
  /** Kênh của chứng từ nguồn (đề xuất, để kế toán biết bút toán sinh từ đâu). */
  channel: "pos" | "web" | "vietqr" | "marketplace" | "statement" | "manual";
  reference: string;
  reverses_entry_id: string | null;
  /** Bút toán đảo bút toán này (API trả kèm, đề xuất). */
  reversed_by_entry_id: string | null;
  /** Lý do đảo (bút toán đảo). */
  reason: string | null;
  /** Chứng từ đính kèm (phiếu chi…), mã của module `invoices`. */
  attachment: string | null;
  actor: { kind: "user" | "system"; name: string };
  lines: EntryLine[];
  seal: EntrySeal | null;
}

/** Trạng thái hiện trên màn, suy từ bút toán. */
export type EntryState = "pending_seal" | "sealed" | "reversed" | "reversal";

export function entryState(entry: LedgerEntry): EntryState {
  if (entry.reversed_by_entry_id) return "reversed";
  if (entry.reverses_entry_id) return "reversal";
  return entry.seal ? "sealed" : "pending_seal";
}

export type PeriodStatus = "open" | "closed";

/** Kỳ kế toán (`ledger_periods`), kèm số bút toán và số đã niêm phong (API trả kèm, đề xuất). */
export interface LedgerPeriod {
  id: string;
  book_id: string;
  starts_on: string;
  ends_on: string;
  status: PeriodStatus;
  closed_at: string | null;
  closed_by: string | null;
  entry_count: number;
  sealed_count: number;
}

export type PaymentStatus = "pending" | "succeeded" | "failed" | "expired" | "needs_review";

/** Thanh toán (`ledger_payments`); chuyển khoản VietQR có `transfer_code` ngắn trong nội dung. */
export interface Payment {
  id: string;
  org_id: string;
  org_name: string;
  method: "vietqr" | "card";
  transfer_code: string | null;
  amount: Money;
  status: PaymentStatus;
  source_module: "orders";
  source_id: string;
  expires_at: string;
}

export type ExceptionKind =
  | "amount_mismatch"
  | "unmatched_credit"
  | "duplicate_payment"
  | "missing_in_statement"
  | "unknown_in_statement"
  | "late_payment";
export type ExceptionStatus = "open" | "resolved" | "ignored";
export type ResolveAction = "match" | "refunded_outside" | "ignore";
export const RESOLVE_ACTIONS: readonly ResolveAction[] = ["match", "refunded_outside", "ignore"];

/** Mục của hàng chờ sai lệch (`ledger_exceptions`); `details` là JSON theo loại. */
export interface LedgerException {
  id: string;
  kind: ExceptionKind;
  /** `ledger.payment:<id>` · `ledger.bank_transaction:<id>` · `ledger.statement_line:<id>`. */
  subject: string;
  details: {
    order_ref: string | null;
    payment_code: string | null;
    bank_account_id: string | null;
    memo: string | null;
    expected: Money | null;
    received: Money;
    booked_at: string;
    provider: string | null;
    payment_succeeded_at?: string;
    order_cancelled_at?: string;
    statement_date?: string;
  };
  status: ExceptionStatus;
  resolution: { action: ResolveAction; note: string; payment_id: string | null } | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Một lần đối soát với sao kê của đối tác (`POST /reconciliations`, `GET /reconciliations`). */
export interface Reconciliation {
  id: string;
  provider: string;
  statement_date: string;
  status: "queued" | "running" | "done";
  requested_by: string;
  created_at: string;
  finished_at: string | null;
  /** Số mục sai lệch mới đưa vào hàng chờ. */
  exceptions_opened: number | null;
}

export type FeedStatus = "active" | "paused" | "not_connected";

/** Tài khoản nhận chuyển khoản (`ledger_bank_accounts`): đứng tên cửa hàng, không phải nền tảng. */
export interface BankAccount {
  id: string;
  org_id: string;
  org_name: string;
  bank_bin: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  feed_provider: string | null;
  /** `push`: đối tác đẩy về (webhook có chữ ký); `poll`: hệ thống hỏi định kỳ. */
  feed_mode: "push" | "poll";
  poll_seconds: number | null;
  status: FeedStatus;
  last_read_at: string | null;
  pause_reason: string | null;
  paused_at: string | null;
  matched_this_month: number;
  /** Giao dịch của tài khoản đang nằm trong hàng chờ. */
  queued: number;
}

/** Ngân hàng nhận VietQR (`modules/ledger/data/vn-banks.json`): dữ liệu có nguồn và ngày. */
export interface Bank {
  bin: string;
  name: string;
}

/** Danh sách mẫu, không phải BIN thật; danh sách thật lấy từ NAPAS, ghi nguồn và ngày. */
export const SAMPLE_BANKS: readonly Bank[] = [
  { bin: "970999", name: "Ngân hàng A (mẫu)" },
  { bin: "970998", name: "Ngân hàng B (mẫu)" },
  { bin: "970997", name: "Ngân hàng C (mẫu)" },
];

/**
 * Ánh xạ mục đích → số hiệu tài khoản theo chế độ kế toán Việt Nam, chỉ dùng khi xuất
 * (`modules/ledger/data/vn-accounts.json`). Cần đối chiếu TT 99/2025/TT-BTC và TT 133/2016/TT-BTC;
 * khách sửa được ánh xạ của sổ mình.
 */
export const VN_ACCOUNT_MAP: Readonly<Record<string, string>> = {
  "cash.on_hand": "1111",
  "cash.bank": "1121",
  "clearing.gateway": "1388",
  "clearing.carrier_cod": "1388",
  "orders.buyer_prepayments": "131",
  "inventory.stock": "1561",
  "tax.vat_input": "1331",
  "payable.supplier": "331",
  "payable.seller_available": "3388",
  "tax.vat_output": "33311",
  "tax.withheld_vat": "3388",
  "tax.withheld_pit": "3335",
  "revenue.sales": "5111",
  "revenue.shipping": "5113",
  "revenue.platform_fee": "5113",
  "expense.gateway_fee": "6427",
  "shipping.carrier_fee": "6417",
};

// ---------------------------------------------------------------- ID và dữ liệu ban đầu

const uid = (kind: string, n: number) =>
  `01a1e000-0000-7000-8000-${kind}${String(n).padStart(10, "0")}`;

export const BOOK_ID: Record<BookKey, string> = { main: uid("e0", 1), market: uid("e0", 2) };

const DEBIT_NORMAL = new Set([
  "cash.on_hand",
  "cash.bank",
  "clearing.gateway",
  "clearing.carrier_cod",
  "inventory.stock",
  "tax.vat_input",
  "expense.gateway_fee",
  "shipping.carrier_fee",
]);

/** Mục đích dùng ở mỗi sổ (mỗi mục một tài khoản tiền VND, không đối tượng). */
const PURPOSES: Record<BookKey, string[]> = {
  main: [
    "cash.on_hand",
    "cash.bank",
    "clearing.gateway",
    "clearing.carrier_cod",
    "inventory.stock",
    "tax.vat_input",
    "expense.gateway_fee",
    "shipping.carrier_fee",
    "orders.buyer_prepayments",
    "payable.supplier",
    "revenue.sales",
    "revenue.shipping",
    "tax.vat_output",
  ],
  market: [
    "clearing.gateway",
    "expense.gateway_fee",
    "orders.buyer_prepayments",
    "payable.seller_available",
    "revenue.platform_fee",
    "tax.vat_output",
    "tax.withheld_vat",
    "tax.withheld_pit",
  ],
};

const vnd = (amount: number): Money => ({ amount: String(amount), currency: "VND" });

/** Phát sinh gộp của các bút toán khác trong một kỳ: [mục đích, Nợ, Có]. */
type AggregateLine = [purpose: string, debit: number, credit: number];

interface Aggregate {
  book: BookKey;
  /** `YYYY-MM`. */
  month: string;
  entries: number;
  lines: AggregateLine[];
  /** Thuế GTGT theo thuế suất: [nhóm thuế, thuế suất, giá chưa thuế, thuế]. */
  vat_output: [string, string, number, number][];
  vat_input: [string, string, number, number][];
}

/** Tháng 10 của sổ Bếp Mộc; tháng 8, 9 là bản nhân tỉ lệ (vẫn cân, vẫn đúng thuế suất). */
const MAIN_OCT: Omit<Aggregate, "month" | "entries"> = {
  book: "main",
  lines: [
    ["cash.bank", 1_180_250_000, 0],
    ["clearing.gateway", 36_410_000, 0],
    ["clearing.carrier_cod", 9_870_000, 0],
    ["cash.on_hand", 6_120_000, 0],
    ["expense.gateway_fee", 4_512_000, 0],
    ["shipping.carrier_fee", 15_880_000, 0],
    ["inventory.stock", 512_300_000, 0],
    ["tax.vat_input", 40_984_000, 0],
    ["payable.supplier", 0, 553_284_000],
    ["orders.buyer_prepayments", 0, 21_050_000],
    ["revenue.sales", 0, 1_128_700_000],
    ["tax.vat_output", 0, 90_296_000],
    ["revenue.shipping", 0, 12_996_000],
  ],
  vat_output: [
    ["vat.standard_reducible", "8", 1_050_000_000, 84_000_000],
    ["vat.standard", "10", 62_960_000, 6_296_000],
    ["vat.exempt", "0", 15_740_000, 0],
  ],
  vat_input: [["vat.standard_reducible", "8", 512_300_000, 40_984_000]],
};

const MAIN_NOV: Aggregate = {
  book: "main",
  month: "2026-11",
  entries: 3_902,
  lines: [
    ["clearing.gateway", 41_380_000, 0],
    ["clearing.carrier_cod", 12_640_000, 0],
    ["cash.on_hand", 8_214_000, 0],
    ["cash.bank", 477_811_000, 0],
    ["expense.gateway_fee", 1_862_000, 0],
    ["shipping.carrier_fee", 6_430_000, 0],
    ["inventory.stock", 214_500_000, 0],
    ["tax.vat_input", 17_160_000, 0],
    ["payable.supplier", 0, 231_660_000],
    ["orders.buyer_prepayments", 0, 18_465_000],
    ["revenue.sales", 0, 486_400_000],
    ["tax.vat_output", 0, 38_912_000],
    ["revenue.shipping", 0, 4_560_000],
  ],
  vat_output: [
    ["vat.standard_reducible", "8", 452_000_000, 36_160_000],
    ["vat.standard", "10", 27_520_000, 2_752_000],
    ["vat.exempt", "0", 6_880_000, 0],
  ],
  vat_input: [["vat.standard_reducible", "8", 214_500_000, 17_160_000]],
};

/** Sàn Chợ Bếp Mộc, tháng 11: thu hộ qua đối tác, hoàn tất đơn (phí sàn, khấu trừ thay). */
const MARKET_NOV: Omit<Aggregate, "month" | "entries"> = {
  book: "market",
  lines: [
    ["clearing.gateway", 96_450_000, 0],
    ["orders.buyer_prepayments", 71_280_000, 96_450_000],
    ["payable.seller_available", 0, 66_909_600],
    ["revenue.platform_fee", 0, 3_564_000],
    ["tax.vat_output", 0, 356_400],
    ["tax.withheld_vat", 0, 300_000],
    ["tax.withheld_pit", 0, 150_000],
  ],
  vat_output: [["vat.standard", "10", 3_564_000, 356_400]],
  vat_input: [],
};

/** Nhân mọi số với `num / den` (chia hết với dữ liệu ở trên): cân vẫn cân, thuế vẫn đúng thuế suất. */
function scaled(
  base: Omit<Aggregate, "month" | "entries">,
  month: string,
  entries: number,
  num: number,
  den: number,
): Aggregate {
  const s = (n: number) => (n * num) / den;
  return {
    ...base,
    month,
    entries,
    lines: base.lines.map(([p, d, c]) => [p, s(d), s(c)]),
    vat_output: base.vat_output.map(([c, r, b, t]) => [c, r, s(b), s(t)]),
    vat_input: base.vat_input.map(([c, r, b, t]) => [c, r, s(b), s(t)]),
  };
}

const AGGREGATES: Aggregate[] = [
  scaled(MAIN_OCT, "2026-08", 10_117, 17, 20),
  scaled(MAIN_OCT, "2026-09", 10_902, 9, 10),
  { ...MAIN_OCT, month: "2026-10", entries: 11_284 },
  MAIN_NOV,
  scaled(MARKET_NOV, "2026-09", 1_240, 3, 5),
  scaled(MARKET_NOV, "2026-10", 2_016, 4, 5),
  { ...MARKET_NOV, month: "2026-11", entries: 820 },
];

/** Số thứ tự niêm phong trước các bút toán chi tiết (chuỗi đã chạy từ trước). */
const CHAIN_BASE: Record<BookKey, number> = { main: 40_301, market: 4_076 };

interface PeriodState {
  id: string;
  book: BookKey;
  month: string;
  status: PeriodStatus;
  closed_at: string | null;
  closed_by: string | null;
}

interface Store {
  accounts: LedgerAccount[];
  entries: LedgerEntry[];
  periods: PeriodState[];
  chain: Record<BookKey, { sequence: number; hash: string }>;
  payments: Payment[];
  exceptions: LedgerException[];
  reconciliations: Reconciliation[];
  bankAccounts: BankAccount[];
  seq: number;
}

const BOOKS: LedgerBook[] = [
  {
    id: BOOK_ID.main,
    key: "main",
    org_id: SAMPLE_UNIT_IDS.root,
    org_name: "Bếp Mộc",
    base_currency: "VND",
    fiscal_year_start_month: 1,
  },
  {
    id: BOOK_ID.market,
    key: "market",
    org_id: SAMPLE_UNIT_IDS.market,
    org_name: "Chợ Bếp Mộc",
    base_currency: "VND",
    fiscal_year_start_month: 1,
  },
];

const NHA_NA: Counterparty = {
  kind: "org",
  id: SAMPLE_UNIT_IDS.sellers[0],
  name: "Gia Dụng Nhà Na",
};

function seedAccounts(): LedgerAccount[] {
  const accounts: LedgerAccount[] = [];
  let n = 0;
  for (const book of BOOKS) {
    for (const purpose of PURPOSES[book.key]) {
      n += 1;
      accounts.push({
        id: uid("e1", n),
        book_id: book.id,
        purpose,
        counterparty: null,
        currency: "VND",
        normal_side: DEBIT_NORMAL.has(purpose) ? "debit" : "credit",
        external_code: null,
        status: "active",
      });
    }
  }
  accounts.push({
    id: uid("e1", 99),
    book_id: BOOK_ID.market,
    purpose: "payable.seller_available",
    counterparty: NHA_NA,
    currency: "VND",
    normal_side: "credit",
    external_code: null,
    status: "active",
  });
  return accounts;
}

function accountOf(
  accounts: readonly LedgerAccount[],
  book: BookKey,
  purpose: string,
  counterparty: string | null = null,
): LedgerAccount {
  const found = accounts.find(
    (a) =>
      a.book_id === BOOK_ID[book] &&
      a.purpose === purpose &&
      (a.counterparty?.id ?? null) === counterparty,
  );
  if (!found) throw new Error(`thiếu tài khoản mẫu ${book}/${purpose}`);
  return found;
}

const periodId = (book: BookKey, month: string) =>
  `01a1e000-0000-7000-8000-e2${book === "main" ? "1" : "2"}${month.replace("-", "")}000`;

/** `YYYY-MM` của một ngày `YYYY-MM-DD`. */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** Ngày đầu, ngày cuối của tháng `YYYY-MM`. */
export function monthBounds(month: string): { starts_on: string; ends_on: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { starts_on: `${month}-01`, ends_on: `${month}-${String(last).padStart(2, "0")}` };
}

function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

/** Băm theo định dạng `ledger-v1` (không gồm `tenant_id`, để tách / gộp khách không gãy chuỗi). */
export function entryHash(entry: LedgerEntry): string {
  const lines = entry.lines
    .map((l) => `${l.line_no}:${l.account_id}:${l.side}:${l.amount.amount}:${l.amount.currency}`)
    .join(";");
  const text = [
    "ledger-v1",
    entry.id,
    entry.book_id,
    entry.effective_date,
    entry.posted_at,
    entry.reference,
    entry.reverses_entry_id ?? "",
    lines,
  ].join("|");
  return createHash("sha256").update(text).digest("hex");
}

function chainHash(previous: string, entryHashValue: string): string {
  return createHash("sha256").update(`${previous}${entryHashValue}`).digest("hex");
}

const GENESIS: Record<BookKey, string> = {
  main: createHash("sha256").update("ledger-v1 genesis main").digest("hex"),
  market: createHash("sha256").update("ledger-v1 genesis market").digest("hex"),
};

const bookKeyOf = (bookId: string): BookKey => (bookId === BOOK_ID.market ? "market" : "main");

function seed(): Store {
  const accounts = seedAccounts();
  const a = (book: BookKey, purpose: string, counterparty: string | null = null) =>
    accountOf(accounts, book, purpose, counterparty).id;
  const now = Date.now();
  let n = 0;
  type LineSpec = [string, Side, number, LineTax?];
  const entry = (
    book: BookKey,
    spec: Omit<
      LedgerEntry,
      "id" | "book_id" | "period_id" | "lines" | "seal" | "reversed_by_entry_id" | "reason"
    > & { reason?: string | null },
    lines: LineSpec[],
  ): LedgerEntry => {
    n += 1;
    return {
      ...spec,
      reason: spec.reason ?? null,
      id: uid("e3", n),
      book_id: BOOK_ID[book],
      period_id: periodId(book, monthOf(spec.effective_date)),
      reversed_by_entry_id: null,
      seal: null,
      lines: lines.map(([account_id, side, amount, tax], index) => ({
        line_no: index + 1,
        account_id,
        side,
        amount: vnd(amount),
        tax: tax ?? null,
      })),
    };
  };
  const vat8 = (base: number): LineTax => ({
    category: "vat.standard_reducible",
    rate_percent: "8",
    base: vnd(base),
  });
  const system = { kind: "system" as const, name: "Hệ thống" };
  const huong = { kind: "user" as const, name: "Đào Thu Hương" };
  const R = FINANCE_ORDER_REFS;
  const entries: LedgerEntry[] = [
    entry(
      "main",
      {
        effective_date: "2026-11-06",
        posted_at: "2026-11-06T07:40:00Z",
        description: "orders.deliver",
        source_module: "orders",
        source_kind: "deliver",
        source_id: R.web,
        channel: "web",
        reference: `orders.deliver:${R.web}`,
        reverses_entry_id: null,
        attachment: null,
        actor: system,
      },
      [
        [a("main", "orders.buyer_prepayments"), "debit", 389_000],
        [a("main", "revenue.sales"), "credit", 332_407],
        [a("main", "tax.vat_output"), "credit", 26_593, vat8(332_407)],
        [a("main", "revenue.shipping"), "credit", 30_000],
      ],
    ),
    entry(
      "market",
      {
        effective_date: "2026-11-11",
        posted_at: "2026-11-11T01:00:00Z",
        description: "marketplace.settle",
        source_module: "marketplace",
        source_kind: "settle",
        source_id: R.marketSettled,
        channel: "marketplace",
        reference: `marketplace.settle:${R.marketSettled}`,
        reverses_entry_id: null,
        attachment: null,
        actor: system,
      },
      [
        [a("market", "orders.buyer_prepayments"), "debit", 690_000],
        [a("market", "payable.seller_available", NHA_NA.id), "credit", 638_250],
        [a("market", "revenue.platform_fee"), "credit", 37_636],
        [
          a("market", "tax.vat_output"),
          "credit",
          3_764,
          { category: "vat.standard", rate_percent: "10", base: vnd(37_636) },
        ],
        [a("market", "tax.withheld_vat"), "credit", 6_900],
        [a("market", "tax.withheld_pit"), "credit", 3_450],
      ],
    ),
    entry(
      "main",
      {
        effective_date: "2026-11-11",
        posted_at: "2026-11-11T09:12:00Z",
        description: "Phân loại lại phí ngân hàng",
        source_module: "ledger",
        source_kind: "manual",
        source_id: null,
        channel: "manual",
        reference: "BT-2611-0007",
        reverses_entry_id: null,
        attachment: null,
        actor: huong,
      },
      [
        [a("main", "shipping.carrier_fee"), "debit", 250_000],
        [a("main", "cash.bank"), "credit", 250_000],
      ],
    ),
    entry(
      "main",
      {
        effective_date: "2026-11-12",
        posted_at: "2026-11-12T02:30:00Z",
        description: "Đảo BT-2611-0007",
        source_module: "ledger",
        source_kind: "reversal",
        source_id: null,
        channel: "manual",
        reference: "BT-2611-0008",
        reverses_entry_id: uid("e3", 3),
        reason: "Ghi nhầm tài khoản Nợ",
        attachment: null,
        actor: huong,
      },
      [
        [a("main", "cash.bank"), "debit", 250_000],
        [a("main", "shipping.carrier_fee"), "credit", 250_000],
      ],
    ),
    entry(
      "main",
      {
        effective_date: "2026-11-12",
        posted_at: "2026-11-12T03:05:00Z",
        description: "Phí chuyển tiền tháng 11",
        source_module: "ledger",
        source_kind: "manual",
        source_id: null,
        channel: "manual",
        reference: "BT-2611-0009",
        reverses_entry_id: null,
        attachment: "PC-2611-0012",
        actor: huong,
      },
      [
        [a("main", "expense.gateway_fee"), "debit", 44_000],
        [a("main", "cash.bank"), "credit", 44_000],
      ],
    ),
    entry(
      "main",
      {
        effective_date: "2026-11-12",
        posted_at: "2026-11-13T00:10:00Z",
        description: "ledger.gateway_fee",
        source_module: "ledger",
        source_kind: "gateway_fee",
        source_id: "2026-11-12",
        channel: "statement",
        reference: "gw-fee:2026-11-12",
        reverses_entry_id: null,
        attachment: null,
        actor: system,
      },
      [
        [a("main", "expense.gateway_fee"), "debit", 186_340],
        [a("main", "clearing.gateway"), "credit", 186_340],
      ],
    ),
    entry(
      "market",
      {
        effective_date: "2026-11-13",
        posted_at: "2026-11-13T02:41:00Z",
        description: "orders.capture",
        source_module: "orders",
        source_kind: "capture",
        source_id: R.market,
        channel: "marketplace",
        reference: `orders.capture:${R.market}`,
        reverses_entry_id: null,
        attachment: null,
        actor: system,
      },
      [
        [a("market", "clearing.gateway"), "debit", 439_000],
        [a("market", "orders.buyer_prepayments"), "credit", 439_000],
      ],
    ),
    entry(
      "main",
      {
        effective_date: "2026-11-13",
        posted_at: "2026-11-13T03:18:00Z",
        description: "orders.capture",
        source_module: "orders",
        source_kind: "capture",
        source_id: R.vietqr,
        channel: "vietqr",
        reference: `orders.capture:${R.vietqr}`,
        reverses_entry_id: null,
        attachment: null,
        actor: system,
      },
      [
        [a("main", "cash.bank"), "debit", 1_240_000],
        [a("main", "orders.buyer_prepayments"), "credit", 1_240_000],
      ],
    ),
    // Hai bút toán vừa ghi: chờ job niêm phong (mười giây sau khi máy chủ khởi động).
    entry(
      "main",
      {
        effective_date: "2026-11-13",
        posted_at: new Date(now - 2 * SECOND).toISOString(),
        description: "orders.capture",
        source_module: "orders",
        source_kind: "capture",
        source_id: R.counter,
        channel: "pos",
        reference: `orders.capture:${R.counter}`,
        reverses_entry_id: null,
        attachment: null,
        actor: system,
      },
      [
        [a("main", "cash.on_hand"), "debit", 1_900_000],
        [a("main", "orders.buyer_prepayments"), "credit", 1_900_000],
      ],
    ),
    entry(
      "main",
      {
        effective_date: "2026-11-13",
        posted_at: new Date(now - SECOND).toISOString(),
        description: "orders.deliver",
        source_module: "orders",
        source_kind: "deliver",
        source_id: R.counter,
        channel: "pos",
        reference: `orders.deliver:${R.counter}`,
        reverses_entry_id: null,
        attachment: null,
        actor: system,
      },
      [
        [a("main", "orders.buyer_prepayments"), "debit", 1_900_000],
        [a("main", "revenue.sales"), "credit", 1_759_259],
        [a("main", "tax.vat_output"), "credit", 140_741, vat8(1_759_259)],
      ],
    ),
  ];
  const original = entries.find((e) => e.reference === "BT-2611-0007");
  const reversal = entries.find((e) => e.reference === "BT-2611-0008");
  if (original && reversal) original.reversed_by_entry_id = reversal.id;

  const periods: PeriodState[] = [
    period("main", "2026-08", "2026-09-04T09:05:00Z"),
    period("main", "2026-09", "2026-10-05T10:20:00Z"),
    period("main", "2026-10", null),
    period("main", "2026-11", null),
    period("market", "2026-09", "2026-10-03T08:00:00Z"),
    period("market", "2026-10", "2026-11-04T08:30:00Z"),
    period("market", "2026-11", null),
  ];

  const tdAccount = uid("e5", 2);
  const cgAccount = uid("e5", 3);
  const payments: Payment[] = [
    payment(
      1,
      SAMPLE_UNIT_IDS.thuDuc,
      "CN Thủ Đức",
      "AXK7Q2M9TP",
      660_000,
      "needs_review",
      R.mismatch,
      "2026-11-13T02:25:00Z",
    ),
    payment(
      2,
      SAMPLE_UNIT_IDS.cauGiay,
      "CN Cầu Giấy",
      "AXR2N7F4KD",
      575_000,
      "expired",
      R.late,
      "2026-11-12T03:00:00Z",
    ),
    payment(
      3,
      SAMPLE_UNIT_IDS.q3,
      "CN Quận 3",
      "AXH5C9M2WE",
      315_000,
      "pending",
      R.pendingTransfer,
      new Date(now + 25 * MINUTE).toISOString(),
    ),
    {
      ...payment(
        4,
        SAMPLE_UNIT_IDS.thuDuc,
        "CN Thủ Đức",
        null,
        1_230_000,
        "succeeded",
        R.card,
        "2026-11-12T10:11:00Z",
      ),
      method: "card",
    },
  ];
  const exception = (
    k: number,
    kind: ExceptionKind,
    subject: string,
    details: LedgerException["details"],
    status: ExceptionStatus = "open",
    resolution: LedgerException["resolution"] = null,
  ): LedgerException => ({
    id: uid("e4", k),
    kind,
    subject,
    details,
    status,
    resolution,
    resolved_by: status === "open" ? null : "Đào Thu Hương",
    created_at: details.booked_at,
    updated_at: details.booked_at,
  });
  const base = {
    order_ref: null,
    payment_code: null,
    bank_account_id: null,
    memo: null,
    expected: null,
    provider: null,
  };
  const exceptions: LedgerException[] = [
    exception(1, "amount_mismatch", `ledger.payment:${uid("e6", 1)}`, {
      ...base,
      order_ref: R.mismatch,
      payment_code: "AXK7Q2M9TP",
      bank_account_id: tdAccount,
      memo: "AXK7Q2M9TP CHUYEN TIEN",
      expected: vnd(660_000),
      received: vnd(600_000),
      booked_at: "2026-11-13T02:02:00Z",
    }),
    exception(2, "unmatched_credit", `ledger.bank_transaction:${uid("e7", 2)}`, {
      ...base,
      bank_account_id: tdAccount,
      memo: "CK MUA HOP THUY TINH",
      received: vnd(315_000),
      booked_at: "2026-11-13T03:40:00Z",
    }),
    exception(3, "late_payment", `ledger.payment:${uid("e6", 2)}`, {
      ...base,
      order_ref: R.late,
      payment_code: "AXR2N7F4KD",
      bank_account_id: cgAccount,
      memo: "AXR2N7F4KD",
      expected: vnd(575_000),
      received: vnd(575_000),
      booked_at: "2026-11-13T01:15:00Z",
      order_cancelled_at: "2026-11-12T03:00:00Z",
    }),
    exception(4, "missing_in_statement", `ledger.payment:${uid("e6", 4)}`, {
      ...base,
      order_ref: R.card,
      provider: "Cổng thanh toán (mẫu)",
      expected: vnd(1_230_000),
      received: vnd(1_230_000),
      booked_at: "2026-11-12T23:00:00Z",
      payment_succeeded_at: "2026-11-12T09:41:00Z",
      statement_date: "2026-11-12",
    }),
    exception(
      5,
      "duplicate_payment",
      `ledger.bank_transaction:${uid("e7", 5)}`,
      {
        ...base,
        order_ref: R.web,
        bank_account_id: uid("e5", 1),
        received: vnd(389_000),
        booked_at: "2026-11-06T07:31:00Z",
      },
      "resolved",
      {
        action: "refunded_outside",
        note: "Đã chuyển trả người mua khoản nhận lần hai",
        payment_id: null,
      },
    ),
    exception(
      6,
      "unknown_in_statement",
      `ledger.statement_line:${uid("e8", 6)}`,
      {
        ...base,
        provider: "Cổng thanh toán (mẫu)",
        memo: "TEST TRANSACTION",
        received: vnd(10_000),
        booked_at: "2026-11-02T23:00:00Z",
        statement_date: "2026-11-02",
      },
      "ignored",
      { action: "ignore", note: "Giao dịch thử của cổng", payment_id: null },
    ),
  ];
  const resolvedAt = "2026-11-07T02:10:00Z";
  for (const x of exceptions) if (x.status !== "open") x.updated_at = resolvedAt;

  const bankAccounts: BankAccount[] = [
    {
      id: uid("e5", 1),
      org_id: SAMPLE_UNIT_IDS.q3,
      org_name: "CN Quận 3",
      bank_bin: "970999",
      bank_name: "Ngân hàng A (mẫu)",
      account_number: "0000004821",
      account_name: "BẾP MỘC CN QUẬN 3",
      feed_provider: "Đối tác đọc sao kê (mẫu)",
      feed_mode: "push",
      poll_seconds: null,
      status: "active",
      last_read_at: "2026-11-13T03:52:00Z",
      pause_reason: null,
      paused_at: null,
      matched_this_month: 412,
      queued: 0,
    },
    {
      id: tdAccount,
      org_id: SAMPLE_UNIT_IDS.thuDuc,
      org_name: "CN Thủ Đức",
      bank_bin: "970999",
      bank_name: "Ngân hàng A (mẫu)",
      account_number: "0000007312",
      account_name: "BẾP MỘC CN THỦ ĐỨC",
      feed_provider: "Đối tác đọc sao kê (mẫu)",
      feed_mode: "poll",
      poll_seconds: 60,
      status: "active",
      last_read_at: "2026-11-13T04:04:00Z",
      pause_reason: null,
      paused_at: null,
      matched_this_month: 287,
      queued: 2,
    },
    {
      id: cgAccount,
      org_id: SAMPLE_UNIT_IDS.cauGiay,
      org_name: "CN Cầu Giấy",
      bank_bin: "970998",
      bank_name: "Ngân hàng B (mẫu)",
      account_number: "0000005520",
      account_name: "BẾP MỘC CN CẦU GIẤY",
      feed_provider: "Đối tác đọc sao kê (mẫu)",
      feed_mode: "poll",
      poll_seconds: 60,
      status: "paused",
      last_read_at: "2026-11-12T15:10:00Z",
      pause_reason: "authorization_expired",
      paused_at: "2026-11-12T15:10:00Z",
      matched_this_month: 164,
      queued: 1,
    },
  ];

  const store: Store = {
    accounts,
    entries,
    periods,
    chain: {
      main: { sequence: CHAIN_BASE.main, hash: GENESIS.main },
      market: { sequence: CHAIN_BASE.market, hash: GENESIS.market },
    },
    payments,
    exceptions,
    reconciliations: [
      {
        id: uid("e9", 1),
        provider: "Cổng thanh toán (mẫu)",
        statement_date: "2026-11-12",
        status: "done",
        requested_by: "Job hằng ngày",
        created_at: "2026-11-12T23:00:00Z",
        finished_at: "2026-11-12T23:01:10Z",
        exceptions_opened: 1,
      },
    ],
    bankAccounts,
    seq: 0,
  };
  // Bút toán cũ đã niêm phong từ trước khi máy chủ khởi động; hai bút toán mới chờ job.
  sealDue(store, now - SEAL_INTERVAL_MS);
  return store;
}

function period(book: BookKey, month: string, closedAt: string | null): PeriodState {
  return {
    id: periodId(book, month),
    book,
    month,
    status: closedAt ? "closed" : "open",
    closed_at: closedAt,
    closed_by: closedAt ? "Đào Thu Hương" : null,
  };
}

function payment(
  k: number,
  org: string,
  orgName: string,
  code: string | null,
  amount: number,
  status: PaymentStatus,
  order: string,
  expires: string,
): Payment {
  return {
    id: uid("e6", k),
    org_id: org,
    org_name: orgName,
    method: "vietqr",
    transfer_code: code,
    amount: vnd(amount),
    status,
    source_module: "orders",
    source_id: order,
    expires_at: expires,
  };
}

const KEY = Symbol.for("autoxide.sample.finance.1");
type Holder = { [KEY]?: Store };

function store(): Store {
  const holder = globalThis as Holder;
  holder[KEY] ??= seed();
  sync(holder[KEY]);
  return holder[KEY];
}

/** Về dữ liệu ban đầu (test). */
export function resetSampleFinance(): void {
  (globalThis as Holder)[KEY] = seed();
}

/** Niêm phong bút toán ghi trước `cutoff` (job `ledger.seal_entries`), theo `id` của từng sổ. */
function sealDue(s: Store, cutoff: number): void {
  for (const book of ["main", "market"] as const) {
    const due = s.entries
      .filter((e) => e.book_id === BOOK_ID[book] && !e.seal && Date.parse(e.posted_at) <= cutoff)
      .sort((x, y) => x.id.localeCompare(y.id));
    for (const e of due) {
      const head = s.chain[book];
      const hash = entryHash(e);
      const chained = chainHash(head.hash, hash);
      head.sequence += 1;
      head.hash = chained;
      e.seal = {
        sequence: head.sequence,
        entry_hash: hash,
        chain_hash: chained,
        sealed_at: new Date(Math.max(Date.parse(e.posted_at) + SEAL_INTERVAL_MS, 0)).toISOString(),
      };
    }
  }
}

/** Việc core làm bằng job, chạy theo thời gian thật mỗi lần đọc: niêm phong, hết hạn, đối soát. */
function sync(s: Store, now = Date.now()): void {
  sealDue(s, now - SEAL_INTERVAL_MS);
  for (const p of s.payments) {
    if (p.status === "pending" && Date.parse(p.expires_at) <= now) p.status = "expired";
  }
  for (const r of s.reconciliations) {
    const started = Date.parse(r.created_at);
    if (r.status === "queued" && now - started >= 1500) r.status = "running";
    if (r.status === "running" && now - started >= 4000) {
      r.status = "done";
      r.finished_at = new Date(started + 4000).toISOString();
      r.exceptions_opened = 0;
    }
  }
}

function newId(kind: string): string {
  const s = store();
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
      title: status === 404 ? "Not Found" : status === 409 ? "Conflict" : "Unprocessable Entity",
      status,
      code,
      detail,
      ...(errors && errors.length > 0 ? { errors } : {}),
    },
  };
}

type FieldError = NonNullable<Problem["errors"]>[number];

function invalid(errors: FieldError[]): SampleOutcome<never> {
  return fail(422, "validation_failed", "The request has invalid fields.", errors);
}

const fieldError = (field: string, code: string, detail = code): FieldError => ({
  field,
  code,
  detail,
});

const DAY_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

function isDay(text: string): boolean {
  return DAY_FORMAT.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`));
}

/** Mã tham chiếu theo D-184 của core: 1–100 ký tự ASCII nhìn thấy được. */
export function isReference(text: string): boolean {
  return /^[\x21-\x7e]{1,100}$/.test(text);
}

/** Diễn giải có vẻ chứa dữ liệu cá nhân (số điện thoại, email): bút toán không xoá được. */
export function looksPersonal(text: string): boolean {
  return /\d[\d .-]{7,}\d/.test(text) || /\S+@\S+\.\S+/.test(text);
}

// ---------------------------------------------------------------- Đọc: sổ, tài khoản, bút toán

// Thay bằng GET /api/v1/ledger/books (bước 36) khi core có.
export async function listBooks(): Promise<{ data: LedgerBook[] }> {
  return { data: BOOKS.map((b) => ({ ...b })) };
}

// Thay bằng GET /api/v1/ledger/accounts?book_id= (bước 36) khi core có.
export async function listAccounts(book?: BookKey): Promise<{ data: LedgerAccount[] }> {
  return {
    data: structuredClone(store().accounts.filter((a) => !book || a.book_id === BOOK_ID[book])),
  };
}

export type EntryFilter = "manual" | "reversed";

export interface EntryQuery {
  book?: BookKey | undefined;
  filter?: EntryFilter | undefined;
  limit?: number;
  cursor?: string | null;
}

// Thay bằng GET /api/v1/ledger/entries?book_id=&source_module=&cursor= (bước 36) khi core có. Mới
// nhất trước (ngày hiệu lực, rồi lúc ghi).
export async function listEntries(query: EntryQuery = {}): Promise<SamplePage<LedgerEntry>> {
  const rows = store()
    .entries.filter((e) => !query.book || e.book_id === BOOK_ID[query.book])
    .filter(
      (e) =>
        !query.filter ||
        (query.filter === "manual"
          ? e.source_module === "ledger" && e.channel === "manual"
          : entryState(e) === "reversed"),
    )
    .sort(
      (x, y) =>
        y.effective_date.localeCompare(x.effective_date) || y.posted_at.localeCompare(x.posted_at),
    );
  return samplePage(structuredClone(rows), {
    limit: query.limit ?? 25,
    cursor: query.cursor ?? null,
  });
}

// Thay bằng GET /api/v1/ledger/entries/{id} (bước 36) khi core có.
export async function getEntry(id: string): Promise<LedgerEntry | null> {
  const found = store().entries.find((e) => e.id === id);
  return found ? structuredClone(found) : null;
}

// ---------------------------------------------------------------- Kỳ, cân đối thử, thuế theo kỳ

function periodRow(s: Store, p: PeriodState): LedgerPeriod {
  const bounds = monthBounds(p.month);
  const agg = AGGREGATES.find((x) => x.book === p.book && x.month === p.month);
  const detail = s.entries.filter((e) => e.period_id === p.id);
  const count = (agg?.entries ?? 0) + detail.length;
  return {
    id: p.id,
    book_id: BOOK_ID[p.book],
    ...bounds,
    status: p.status,
    closed_at: p.closed_at,
    closed_by: p.closed_by,
    entry_count: count,
    sealed_count: count - detail.filter((e) => !e.seal).length,
  };
}

// Thay bằng GET /api/v1/ledger/periods?book_id= (bước 36) khi core có. Mới nhất trước.
export async function listPeriods(book: BookKey = "main"): Promise<{ data: LedgerPeriod[] }> {
  const s = store();
  return {
    data: s.periods
      .filter((p) => p.book === book)
      .sort((x, y) => y.month.localeCompare(x.month))
      .map((p) => periodRow(s, p)),
  };
}

export interface TrialBalanceRow {
  account_id: string;
  purpose: string;
  counterparty: Counterparty | null;
  debit: Money;
  credit: Money;
}

export interface TrialBalance {
  book_id: string;
  from: string;
  to: string;
  rows: TrialBalanceRow[];
  totals: { debit: Money; credit: Money };
}

function movements(s: Store, book: BookKey, month: string): Map<string, [number, number]> {
  const sums = new Map<string, [number, number]>();
  const add = (accountId: string, debit: number, credit: number) => {
    const current = sums.get(accountId) ?? [0, 0];
    sums.set(accountId, [current[0] + debit, current[1] + credit]);
  };
  const agg = AGGREGATES.find((x) => x.book === book && x.month === month);
  for (const [purpose, debit, credit] of agg?.lines ?? []) {
    add(accountOf(s.accounts, book, purpose).id, debit, credit);
  }
  for (const e of s.entries) {
    if (e.book_id !== BOOK_ID[book] || monthOf(e.effective_date) !== month) continue;
    for (const l of e.lines) {
      const amount = Number(l.amount.amount);
      add(l.account_id, l.side === "debit" ? amount : 0, l.side === "credit" ? amount : 0);
    }
  }
  return sums;
}

// Thay bằng GET /api/v1/ledger/trial-balance?book_id=&from=&to= (bước 36) khi core có. Một tháng.
export async function trialBalance(book: BookKey, month: string): Promise<{ data: TrialBalance }> {
  const s = store();
  const sums = movements(s, book, month);
  const order = (purpose: string) => {
    const list = PURPOSES[book];
    const i = list.indexOf(purpose);
    return i < 0 ? list.length : i;
  };
  const rows = [...sums.entries()]
    .map(([accountId, [debit, credit]]) => {
      const account = s.accounts.find((a) => a.id === accountId);
      return {
        account_id: accountId,
        purpose: account?.purpose ?? "",
        counterparty: account?.counterparty ?? null,
        debit: vnd(debit),
        credit: vnd(credit),
      };
    })
    .sort(
      (x, y) =>
        order(x.purpose) - order(y.purpose) ||
        (x.counterparty?.name ?? "").localeCompare(y.counterparty?.name ?? ""),
    );
  const total = (side: "debit" | "credit") =>
    vnd(rows.reduce((n, r) => n + Number(r[side].amount), 0));
  const bounds = monthBounds(month);
  return {
    data: {
      book_id: BOOK_ID[book],
      from: bounds.starts_on,
      to: bounds.ends_on,
      rows,
      totals: { debit: total("debit"), credit: total("credit") },
    },
  };
}

/** Số dư phát sinh trong tháng của một mục đích, theo bên thường của tài khoản. */
export async function monthBalance(book: BookKey, purpose: string, month: string): Promise<Money> {
  const s = store();
  const sums = movements(s, book, month);
  let total = 0;
  for (const account of s.accounts.filter(
    (a) => a.book_id === BOOK_ID[book] && a.purpose === purpose,
  )) {
    const [debit, credit] = sums.get(account.id) ?? [0, 0];
    total += account.normal_side === "debit" ? debit - credit : credit - debit;
  }
  return vnd(total);
}

export interface VatRateLine {
  category: string;
  rate_percent: string;
  base: Money;
  tax: Money;
}

/** Thuế GTGT của một kỳ từ sổ cái: đầu ra (có của `tax.vat_output`), đầu vào (nợ của `tax.vat_input`). */
export interface VatPeriod {
  period_id: string;
  month: string;
  status: PeriodStatus;
  output: VatRateLine[];
  input: VatRateLine[];
  output_total: Money;
  input_total: Money;
  /** Đầu ra − đầu vào; âm là còn được khấu trừ chuyển kỳ sau. */
  net: Money;
}

// Thay bằng GET /api/v1/tax/vat-summary?book_id=&from=&to= (đề xuất: bước 36 có số liệu ở sổ cái,
// kê khai nộp cơ quan thuế là bước 46) khi core có. Mới nhất trước.
export async function vatSummary(book: BookKey = "main"): Promise<{ data: VatPeriod[] }> {
  const s = store();
  const vatOut = new Set(
    s.accounts
      .filter((a) => a.book_id === BOOK_ID[book] && a.purpose === "tax.vat_output")
      .map((a) => a.id),
  );
  const vatIn = new Set(
    s.accounts
      .filter((a) => a.book_id === BOOK_ID[book] && a.purpose === "tax.vat_input")
      .map((a) => a.id),
  );
  const rows = s.periods
    .filter((p) => p.book === book)
    .sort((x, y) => y.month.localeCompare(x.month))
    .map((p): VatPeriod => {
      const agg = AGGREGATES.find((x) => x.book === book && x.month === p.month);
      const out = new Map<string, VatRateLine>();
      const inp = new Map<string, VatRateLine>();
      const add = (
        map: Map<string, VatRateLine>,
        category: string,
        rate: string,
        base: number,
        tax: number,
      ) => {
        const key = `${category}|${rate}`;
        const cur = map.get(key) ?? { category, rate_percent: rate, base: vnd(0), tax: vnd(0) };
        map.set(key, {
          ...cur,
          base: vnd(Number(cur.base.amount) + base),
          tax: vnd(Number(cur.tax.amount) + tax),
        });
      };
      for (const [c, r, b, t] of agg?.vat_output ?? []) add(out, c, r, b, t);
      for (const [c, r, b, t] of agg?.vat_input ?? []) add(inp, c, r, b, t);
      for (const e of s.entries.filter((x) => x.period_id === p.id)) {
        for (const l of e.lines) {
          if (!l.tax) continue;
          const sign = (side: Side) => (l.side === side ? 1 : -1);
          if (vatOut.has(l.account_id)) {
            add(
              out,
              l.tax.category,
              l.tax.rate_percent,
              sign("credit") * Number(l.tax.base.amount),
              sign("credit") * Number(l.amount.amount),
            );
          } else if (vatIn.has(l.account_id)) {
            add(
              inp,
              l.tax.category,
              l.tax.rate_percent,
              sign("debit") * Number(l.tax.base.amount),
              sign("debit") * Number(l.amount.amount),
            );
          }
        }
      }
      const sum = (lines: VatRateLine[]) => lines.reduce((n, l) => n + Number(l.tax.amount), 0);
      const output = [...out.values()].sort((x, y) => y.rate_percent.localeCompare(x.rate_percent));
      const input = [...inp.values()].sort((x, y) => y.rate_percent.localeCompare(x.rate_percent));
      return {
        period_id: p.id,
        month: p.month,
        status: p.status,
        output,
        input,
        output_total: vnd(sum(output)),
        input_total: vnd(sum(input)),
        net: vnd(sum(output) - sum(input)),
      };
    });
  return { data: rows };
}

// ---------------------------------------------------------------- Ghi bút toán, đảo

/** Một dòng gửi lên `POST /api/v1/ledger/entries`. */
export interface NewEntryLine {
  account_id: string;
  side: Side;
  amount: Money;
}

export interface NewEntry {
  book: BookKey;
  description: string;
  effective_date: string;
  reference: string;
  attachment?: string | null;
  lines: NewEntryLine[];
}

/** Kỳ chứa ngày `day` của sổ; chưa có thì tạo kỳ mở (`ensure_period`). */
function ensurePeriod(s: Store, book: BookKey, day: string): PeriodState {
  const month = monthOf(day);
  let found = s.periods.find((p) => p.book === book && p.month === month);
  if (!found) {
    found = period(book, month, null);
    s.periods.push(found);
  }
  return found;
}

function fingerprint(entry: NewEntry): string {
  return JSON.stringify({
    book: entry.book,
    description: entry.description,
    effective_date: entry.effective_date,
    lines: entry.lines.map((l) => [l.account_id, l.side, l.amount.amount, l.amount.currency]),
  });
}

function fingerprintOf(e: LedgerEntry): string {
  return JSON.stringify({
    book: bookKeyOf(e.book_id),
    description: e.description,
    effective_date: e.effective_date,
    lines: e.lines.map((l) => [l.account_id, l.side, l.amount.amount, l.amount.currency]),
  });
}

/**
 * Thay bằng POST /api/v1/ledger/entries (bước 36, `ledger.post`) khi core có. Luật ghi: ít nhất hai
 * dòng, mỗi dòng > 0, một loại tiền, tổng Nợ = tổng Có (`ledger.unbalanced`), kỳ đang mở
 * (`ledger.period_closed`), `reference` gửi lại cùng nội dung trả bút toán cũ (`replayed`), khác nội
 * dung thì `reference_reused`. Lỗi của ô gom một lần; `lines[i].…` trỏ đúng dòng.
 */
export async function postEntry(
  input: NewEntry,
  actor: string,
): Promise<SampleOutcome<{ entry: LedgerEntry; replayed: boolean }>> {
  const s = store();
  const errors: FieldError[] = [];
  const description = input.description.trim();
  if (!description) errors.push(fieldError("description", "required"));
  else if (description.length > 200) errors.push(fieldError("description", "length_1_200"));
  else if (looksPersonal(description)) errors.push(fieldError("description", "personal_data"));
  if (!isDay(input.effective_date)) errors.push(fieldError("effective_date", "required"));
  const reference = input.reference.trim();
  if (!reference) errors.push(fieldError("reference", "required"));
  else if (!isReference(reference)) errors.push(fieldError("reference", "reference_format"));
  if (input.lines.length < 2) errors.push(fieldError("lines", "min_two_lines"));
  const currencies = new Set(input.lines.map((l) => l.amount.currency));
  input.lines.forEach((line, index) => {
    const account = s.accounts.find((a) => a.id === line.account_id);
    if (!account || account.book_id !== BOOK_ID[input.book]) {
      errors.push(fieldError(`lines[${index}].account_id`, "unknown"));
    }
    if (!/^\d+$/.test(line.amount.amount) || Number(line.amount.amount) <= 0) {
      errors.push(fieldError(`lines[${index}].amount`, "money_vnd"));
    }
  });
  if (errors.length > 0) return invalid(errors);
  if (currencies.size > 1)
    return fail(422, "ledger.currency_mixed", "Every line of an entry must use one currency.");
  const debit = input.lines
    .filter((l) => l.side === "debit")
    .reduce((n, l) => n + Number(l.amount.amount), 0);
  const credit = input.lines
    .filter((l) => l.side === "credit")
    .reduce((n, l) => n + Number(l.amount.amount), 0);
  if (debit !== credit) {
    return fail(
      422,
      "ledger.unbalanced",
      `The entry is not balanced: debit ${debit} differs from credit ${credit}.`,
    );
  }
  const existing = s.entries.find((e) => e.source_module === "ledger" && e.reference === reference);
  if (existing) {
    if (fingerprintOf(existing) === fingerprint({ ...input, description })) {
      return { ok: true, data: { entry: structuredClone(existing), replayed: true } };
    }
    return fail(
      422,
      "reference_reused",
      `The reference ${reference} was already used for a different request.`,
    );
  }
  const target = ensurePeriod(s, input.book, input.effective_date);
  if (target.status === "closed") {
    return fail(
      409,
      "ledger.period_closed",
      `The accounting period containing ${input.effective_date} is closed.`,
    );
  }
  const entry: LedgerEntry = {
    id: newId("e3"),
    book_id: BOOK_ID[input.book],
    period_id: target.id,
    effective_date: input.effective_date,
    posted_at: new Date().toISOString(),
    description,
    source_module: "ledger",
    source_kind: "manual",
    source_id: null,
    channel: "manual",
    reference,
    reverses_entry_id: null,
    reversed_by_entry_id: null,
    reason: null,
    attachment: input.attachment?.trim() || null,
    actor: { kind: "user", name: actor },
    lines: input.lines.map((l, index) => ({
      line_no: index + 1,
      account_id: l.account_id,
      side: l.side,
      amount: { ...l.amount },
      tax: null,
    })),
    seal: null,
  };
  s.entries.push(entry);
  return { ok: true, data: { entry: structuredClone(entry), replayed: false } };
}

/**
 * Thay bằng POST /api/v1/ledger/entries/{id}/reverse (bước 36, `ledger.reverse`) khi core có. Bút
 * toán mới đổi Nợ thành Có, ngày hiệu lực ở kỳ đang mở; một bút toán chỉ đảo được một lần.
 */
export async function reverseEntry(
  id: string,
  input: { reason: string; effective_date: string },
  actor: string,
): Promise<SampleOutcome<LedgerEntry>> {
  const s = store();
  const original = s.entries.find((e) => e.id === id);
  if (!original) return fail(404, "ledger.entry_not_found", "This entry does not exist.");
  const errors: FieldError[] = [];
  const reason = input.reason.trim();
  if (reason.length < 5) errors.push(fieldError("reason", "length_5_200"));
  else if (looksPersonal(reason)) errors.push(fieldError("reason", "personal_data"));
  if (!isDay(input.effective_date)) errors.push(fieldError("effective_date", "required"));
  if (errors.length > 0) return invalid(errors);
  if (original.reversed_by_entry_id) {
    return fail(409, "ledger.already_reversed", "This entry has already been reversed.");
  }
  const book = bookKeyOf(original.book_id);
  const target = ensurePeriod(s, book, input.effective_date);
  if (target.status === "closed") {
    return fail(
      409,
      "ledger.period_closed",
      `The accounting period containing ${input.effective_date} is closed.`,
    );
  }
  const reversal: LedgerEntry = {
    id: newId("e3"),
    book_id: original.book_id,
    period_id: target.id,
    effective_date: input.effective_date,
    posted_at: new Date().toISOString(),
    description: `Đảo ${original.reference}`,
    source_module: "ledger",
    source_kind: "reversal",
    source_id: null,
    channel: "manual",
    reference: `reverse:${original.reference}`,
    reverses_entry_id: original.id,
    reversed_by_entry_id: null,
    reason,
    attachment: null,
    actor: { kind: "user", name: actor },
    lines: original.lines.map((l) => ({
      ...l,
      side: l.side === "debit" ? "credit" : "debit",
      amount: { ...l.amount },
      tax: l.tax ? structuredClone(l.tax) : null,
    })),
    seal: null,
  };
  original.reversed_by_entry_id = reversal.id;
  s.entries.push(reversal);
  return { ok: true, data: structuredClone(reversal) };
}

// ---------------------------------------------------------------- Khoá sổ

export interface PeriodCheck {
  previous_closed: boolean;
  previous_month: string | null;
  ended: boolean;
  unsealed: number;
  balanced: boolean;
  open_exceptions: number;
}

/** Kiểm trước khi khoá: kỳ trước đã khoá, kỳ đã hết, bút toán đã niêm phong, cân đối thử khớp. */
export async function checkPeriod(id: string): Promise<PeriodCheck | null> {
  const s = store();
  const p = s.periods.find((x) => x.id === id);
  if (!p) return null;
  const prevMonth = previousMonth(p.month);
  const prev = s.periods.find((x) => x.book === p.book && x.month === prevMonth);
  const row = periodRow(s, p);
  const { data: tb } = await trialBalance(p.book, p.month);
  return {
    previous_closed: !prev || prev.status === "closed",
    previous_month: prev && prev.status !== "closed" ? prevMonth : null,
    ended: vietnamDay() > monthBounds(p.month).ends_on,
    unsealed: row.entry_count - row.sealed_count,
    balanced: tb.totals.debit.amount === tb.totals.credit.amount,
    open_exceptions: s.exceptions.filter(
      (x) => x.status === "open" && monthOf(x.details.booked_at.slice(0, 10)) === p.month,
    ).length,
  };
}

/**
 * Thay bằng POST /api/v1/ledger/periods/{id}/close (bước 36, `ledger.periods_close`) khi core có.
 * Khoá theo thứ tự tháng (`ledger.period_order`); không có mở lại. Kỳ chưa hết thì từ chối
 * (`ledger.period_not_ended`, đề xuất: khoá sớm làm bút toán của những ngày còn lại bị từ chối).
 */
export async function closePeriod(id: string, actor: string): Promise<SampleOutcome<LedgerPeriod>> {
  const s = store();
  const p = s.periods.find((x) => x.id === id);
  if (!p) return fail(404, "ledger.period_not_found", "This accounting period does not exist.");
  if (p.status === "closed") {
    return fail(409, "ledger.period_closed", `The accounting period ${p.month} is already closed.`);
  }
  const prevMonth = previousMonth(p.month);
  const prev = s.periods.find((x) => x.book === p.book && x.month === prevMonth);
  if (prev && prev.status !== "closed") {
    return fail(409, "ledger.period_order", `Close the previous period (${prevMonth}) first.`);
  }
  if (vietnamDay() <= monthBounds(p.month).ends_on) {
    return fail(409, "ledger.period_not_ended", `The period ${p.month} has not ended yet.`);
  }
  // Job niêm phong chạy xong phần còn lại trước khi chốt (core chờ bút toán đang giữ khoá kỳ).
  sealDue(s, Date.now());
  p.status = "closed";
  p.closed_at = new Date().toISOString();
  p.closed_by = actor;
  return { ok: true, data: periodRow(s, p) };
}

// ---------------------------------------------------------------- Kiểm toàn vẹn

export interface ChainCheck {
  book_id: string;
  checked: number;
  /** Bút toán đầu tiên có băm không khớp (bị sửa / xoá); `null` = toàn vẹn. */
  first_broken: string | null;
  /** Phút chờ niêm phong lâu nhất của bút toán chưa niêm phong. */
  oldest_pending_minutes: number;
  checked_at: string;
}

// Thay bằng kết quả bước doctor `ledger.chain` (bước 36; đề xuất GET /api/v1/ledger/integrity) khi
// core có: tính lại băm từng bút toán đã niêm phong theo thứ tự và so với chuỗi.
export async function verifyChain(book: BookKey = "main"): Promise<{ data: ChainCheck }> {
  const s = store();
  const sealed = s.entries
    .filter((e) => e.book_id === BOOK_ID[book] && e.seal)
    .sort((x, y) => (x.seal?.sequence ?? 0) - (y.seal?.sequence ?? 0));
  let previous = GENESIS[book];
  let broken: string | null = null;
  for (const e of sealed) {
    const hash = entryHash(e);
    const chained = chainHash(previous, hash);
    if (hash !== e.seal?.entry_hash || chained !== e.seal.chain_hash) {
      broken = e.id;
      break;
    }
    previous = chained;
  }
  const now = Date.now();
  const pending = s.entries.filter((e) => e.book_id === BOOK_ID[book] && !e.seal);
  const oldest = pending.reduce((m, e) => Math.max(m, now - Date.parse(e.posted_at)), 0);
  return {
    data: {
      book_id: BOOK_ID[book],
      checked: sealed.length,
      first_broken: broken,
      oldest_pending_minutes: Math.floor(oldest / MINUTE),
      checked_at: new Date(now).toISOString(),
    },
  };
}

/** Chỉ cho test: sửa lén một bút toán đã niêm phong để thấy chuỗi băm phát hiện. */
export function tamperForTest(id: string, amount: string): void {
  const e = store().entries.find((x) => x.id === id);
  const line = e?.lines[0];
  if (line) line.amount = { ...line.amount, amount };
}

// ---------------------------------------------------------------- Thanh toán, hàng chờ sai lệch

// Thay bằng GET /api/v1/ledger/payments?status= (bước 36) khi core có.
export async function listPayments(): Promise<{ data: Payment[] }> {
  return { data: structuredClone(store().payments) };
}

/** Thanh toán đang chờ cùng số tiền ở cùng nút (tìm đơn cho tiền vào không mã). */
export async function paymentsWithAmount(amount: Money, orgId: string): Promise<Payment[]> {
  return structuredClone(
    store().payments.filter(
      (p) =>
        p.org_id === orgId &&
        p.amount.amount === amount.amount &&
        (p.status === "pending" || p.status === "needs_review"),
    ),
  );
}

export type ExceptionFilter = "open" | "resolved" | ExceptionKind;

// Thay bằng GET /api/v1/ledger/exceptions?status=&kind= (bước 36) khi core có. Mục mở trước.
export async function listExceptions(
  filter?: ExceptionFilter,
): Promise<{ data: LedgerException[] }> {
  const rank = (x: LedgerException) => (x.status === "open" ? 0 : 1);
  const rows = store()
    .exceptions.filter((x) =>
      !filter
        ? true
        : filter === "open"
          ? x.status === "open"
          : filter === "resolved"
            ? x.status !== "open"
            : x.kind === filter,
    )
    .sort((x, y) => rank(x) - rank(y) || y.created_at.localeCompare(x.created_at));
  return { data: structuredClone(rows) };
}

/**
 * Thay bằng POST /api/v1/ledger/exceptions/{id}/resolve (bước 36, `ledger.reconcile`) khi core có.
 * `match` chạy cùng đường ghi sổ như thanh toán tự khớp (`settle`); `refunded_outside` và `ignore`
 * chỉ đóng mục. Lý do bắt buộc, lưu cùng người xử lý.
 */
export async function resolveException(
  id: string,
  input: { action: string; payment_code: string; note: string },
  actor: string,
): Promise<SampleOutcome<{ exception: LedgerException; entry: LedgerEntry | null }>> {
  const s = store();
  const x = s.exceptions.find((e) => e.id === id);
  if (!x) return fail(404, "ledger.exception_not_found", "This exception does not exist.");
  const errors: FieldError[] = [];
  const action = RESOLVE_ACTIONS.find((a) => a === input.action);
  if (!action) errors.push(fieldError("action", "unknown"));
  const code = input.payment_code.trim().toUpperCase().replaceAll(" ", "");
  if (action === "match" && !code) errors.push(fieldError("payment_code", "required"));
  const note = input.note.trim();
  if (note.length < 5) errors.push(fieldError("note", "length_5_200"));
  if (errors.length > 0 || !action) return invalid(errors);
  if (x.status !== "open") {
    return fail(409, "ledger.exception_not_open", "This exception was already handled.");
  }
  let entry: LedgerEntry | null = null;
  let paymentId: string | null = null;
  if (action === "match") {
    const p = s.payments.find((y) => y.transfer_code === code);
    if (!p) return fail(404, "ledger.payment_not_found", "This payment does not exist.");
    if (p.status !== "pending" && p.status !== "needs_review") {
      return fail(409, "ledger.payment_state", `The payment is ${p.status}; it cannot be matched.`);
    }
    const target = ensurePeriod(s, "main", vietnamDay());
    entry = {
      id: newId("e3"),
      book_id: BOOK_ID.main,
      period_id: target.id,
      effective_date: vietnamDay(),
      posted_at: new Date().toISOString(),
      description: "orders.capture",
      source_module: "orders",
      source_kind: "capture",
      source_id: p.source_id,
      channel: "vietqr",
      reference: `exception:${x.id}`,
      reverses_entry_id: null,
      reversed_by_entry_id: null,
      reason: null,
      attachment: null,
      actor: { kind: "user", name: actor },
      lines: [
        {
          line_no: 1,
          account_id: accountOf(s.accounts, "main", "cash.bank").id,
          side: "debit",
          amount: { ...x.details.received },
          tax: null,
        },
        {
          line_no: 2,
          account_id: accountOf(s.accounts, "main", "orders.buyer_prepayments").id,
          side: "credit",
          amount: { ...x.details.received },
          tax: null,
        },
      ],
      seal: null,
    };
    s.entries.push(entry);
    p.status = "succeeded";
    paymentId = p.id;
  }
  x.status = action === "ignore" ? "ignored" : "resolved";
  x.resolution = { action, note, payment_id: paymentId };
  x.resolved_by = actor;
  x.updated_at = new Date().toISOString();
  const account = s.bankAccounts.find((b) => b.id === x.details.bank_account_id);
  if (account && account.queued > 0) account.queued -= 1;
  return {
    ok: true,
    data: { exception: structuredClone(x), entry: entry ? structuredClone(entry) : null },
  };
}

// Thay bằng GET /api/v1/ledger/reconciliations (bước 36) khi core có. Mới nhất trước.
export async function listReconciliations(): Promise<{ data: Reconciliation[] }> {
  return {
    data: structuredClone(store().reconciliations).sort((x, y) =>
      y.created_at.localeCompare(x.created_at),
    ),
  };
}

/**
 * Thay bằng POST /api/v1/ledger/reconciliations (bước 36, "chạy ngay", `ledger.reconcile`) khi core
 * có: xếp việc kéo sao kê của ngày `statement_date` rồi khớp; mục lệch mới vào hàng chờ.
 */
export async function runReconciliation(
  statementDate: string,
  actor: string,
): Promise<SampleOutcome<Reconciliation>> {
  if (!isDay(statementDate)) return invalid([fieldError("statement_date", "required")]);
  const s = store();
  const run: Reconciliation = {
    id: newId("e9"),
    provider: "Cổng thanh toán (mẫu)",
    statement_date: statementDate,
    status: "queued",
    requested_by: actor,
    created_at: new Date().toISOString(),
    finished_at: null,
    exceptions_opened: null,
  };
  s.reconciliations.push(run);
  return { ok: true, data: { ...run } };
}

// ---------------------------------------------------------------- Tài khoản ngân hàng, VietQR

// Thay bằng GET /api/v1/ledger/bank-accounts (bước 36) khi core có.
export async function listBankAccounts(): Promise<{ data: BankAccount[] }> {
  return { data: structuredClone(store().bankAccounts) };
}

/** Bốn số cuối của số tài khoản (màn chỉ hiện chừng này). */
export function lastFour(accountNumber: string): string {
  return accountNumber.slice(-4);
}

/**
 * Thay bằng POST /api/v1/ledger/bank-accounts (bước 36) khi core có. Tài khoản đứng tên cửa hàng hay
 * công ty, không phải của nền tảng (D-187). Thông tin kết nối với đối tác đọc sao kê nhập ở bước sau,
 * lưu ở kho secret theo khách (bước 33).
 */
export async function createBankAccount(input: {
  bank_bin: string;
  account_number: string;
  account_name: string;
  org_id: string;
  org_name: string;
}): Promise<SampleOutcome<BankAccount>> {
  const s = store();
  const errors: FieldError[] = [];
  const bin = input.bank_bin.trim();
  const number = input.account_number.replace(/\s/g, "");
  const name = input.account_name.trim();
  if (!/^\d{6}$/.test(bin)) errors.push(fieldError("bank_bin", "bank_bin"));
  if (!/^\d{6,19}$/.test(number)) errors.push(fieldError("account_number", "account_number"));
  if (!name) errors.push(fieldError("account_name", "required"));
  else if (name.length > 100) errors.push(fieldError("account_name", "length_1_100"));
  if (!input.org_id) errors.push(fieldError("org_id", "required"));
  if (errors.length > 0) return invalid(errors);
  const bank = SAMPLE_BANKS.find((b) => b.bin === bin);
  if (!bank) {
    return fail(422, "ledger.bank_unknown", `No bank has the BIN ${bin}.`, [
      fieldError("bank_bin", "ledger.bank_unknown"),
    ]);
  }
  if (s.bankAccounts.some((b) => b.bank_bin === bin && b.account_number === number)) {
    return fail(409, "ledger.bank_account_taken", "This bank account is already added.", [
      fieldError("account_number", "taken"),
    ]);
  }
  const account: BankAccount = {
    id: newId("e5"),
    org_id: input.org_id,
    org_name: input.org_name,
    bank_bin: bin,
    bank_name: bank.name,
    account_number: number,
    account_name: name.toUpperCase(),
    feed_provider: null,
    feed_mode: "poll",
    poll_seconds: 60,
    status: "not_connected",
    last_read_at: null,
    pause_reason: null,
    paused_at: null,
    matched_this_month: 0,
    queued: 0,
  };
  s.bankAccounts.push(account);
  return { ok: true, data: { ...account } };
}

/**
 * Thay bằng PATCH /api/v1/ledger/bank-accounts/{id} {status} (bước 36) khi core có. Tạm dừng / bật
 * lại đọc biến động số dư; trả trạng thái cũ cho Hoàn tác. Bật lại đọc bù từ con trỏ cuối.
 */
export async function setBankFeed(
  id: string,
  status: string,
): Promise<SampleOutcome<{ account: BankAccount; previous: FeedStatus }>> {
  const account = store().bankAccounts.find((b) => b.id === id);
  if (!account)
    return fail(404, "ledger.bank_account_not_found", "This bank account does not exist.");
  if (status !== "active" && status !== "paused") return invalid([fieldError("status", "unknown")]);
  if (account.status === "not_connected") {
    return fail(409, "ledger.feed_not_connected", "Connect the statement provider first.");
  }
  const previous = account.status;
  account.status = status;
  if (status === "paused") {
    account.paused_at = new Date().toISOString();
    account.pause_reason = "manual";
  } else {
    account.paused_at = null;
    account.pause_reason = null;
    account.last_read_at = new Date().toISOString();
  }
  return { ok: true, data: { account: { ...account }, previous } };
}

/** CRC-16/CCITT-FALSE (đa thức 0x1021, khởi đầu 0xFFFF), như trường `63` của mã EMVCo. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const tlv = (tag: string, value: string) =>
  `${tag}${String(value.length).padStart(2, "0")}${value}`;

/**
 * Chuỗi mã VietQR động theo EMVCo MPM của NAPAS: `00`="01", `01`="12", `38` (GUID `A000000727`, BIN
 * + số tài khoản, dịch vụ `QRIBFTTA`), `53`="704", `54` số tiền, `58`="VN", `62`/`08` nội dung, `63`
 * CRC. Cần đối chiếu đặc tả NAPAS và TCCS 03:2018/NHNN bản mới nhất trước khi dùng thật.
 */
export function vietQrPayload(input: {
  bin: string;
  account: string;
  amount: number;
  memo: string;
}): string {
  const beneficiary = tlv("00", input.bin) + tlv("01", input.account);
  const merchant = tlv("00", "A000000727") + tlv("01", beneficiary) + tlv("02", "QRIBFTTA");
  const body =
    tlv("00", "01") +
    tlv("01", "12") +
    tlv("38", merchant) +
    tlv("53", "704") +
    tlv("54", String(input.amount)) +
    tlv("58", "VN") +
    tlv("62", tlv("08", input.memo));
  const withCrcTag = `${body}6304`;
  return withCrcTag + crc16(withCrcTag);
}

export interface VietQrPreview {
  payload: string;
  bank_account_id: string;
  amount: Money;
  transfer_code: string;
  expires_at: string;
}

/**
 * Thay bằng POST /api/v1/ledger/payments {method: vietqr} (bước 36: trả `qr_payload`) khi core có;
 * bản "thử" không tạo thanh toán là đề xuất (`POST /api/v1/ledger/vietqr/preview`). Nội dung chuyển
 * khoản chỉ chữ hoa và số, vì ngân hàng bỏ dấu, cắt ngắn.
 */
export async function previewVietQr(input: {
  bank_account_id: string;
  amount: string;
  memo: string;
}): Promise<SampleOutcome<VietQrPreview>> {
  const account = store().bankAccounts.find((b) => b.id === input.bank_account_id);
  const errors: FieldError[] = [];
  if (!account) errors.push(fieldError("bank_account_id", "unknown"));
  const amount = input.amount.trim();
  if (!/^\d+$/.test(amount) || Number(amount) <= 0 || amount.length > 13) {
    errors.push(fieldError("amount", "money_vnd"));
  }
  const memo = input.memo.trim();
  if (!/^[A-Z0-9]{1,25}$/.test(memo)) errors.push(fieldError("memo", "transfer_code"));
  if (errors.length > 0 || !account) return invalid(errors);
  return {
    ok: true,
    data: {
      payload: vietQrPayload({
        bin: account.bank_bin,
        account: account.account_number,
        amount: Number(amount),
        memo,
      }),
      bank_account_id: account.id,
      amount: vnd(Number(amount)),
      transfer_code: memo,
      expires_at: new Date(Date.now() + PAYMENT_EXPIRY_MINUTES * MINUTE).toISOString(),
    },
  };
}

// ---------------------------------------------------------------- Sổ nhật ký chung (cho xuất)

export interface JournalLine {
  effective_date: string;
  entry_id: string;
  reference: string;
  description: string;
  purpose: string;
  external_code: string;
  side: Side;
  amount: Money;
  counterparty: string;
}

/**
 * Thay bằng `dyn Ledger::journal` (bước 36; đọc qua `GET /api/v1/ledger/accounts/{id}/lines`) khi
 * core có. Dòng bút toán chi tiết trong `[from, to]`, theo ngày rồi bút toán.
 */
export async function journalLines(
  book: BookKey,
  from: string,
  to: string,
): Promise<JournalLine[]> {
  const s = store();
  const lines: JournalLine[] = [];
  const entries = s.entries
    .filter(
      (e) => e.book_id === BOOK_ID[book] && e.effective_date >= from && e.effective_date <= to,
    )
    .sort((x, y) => x.effective_date.localeCompare(y.effective_date) || x.id.localeCompare(y.id));
  for (const e of entries) {
    for (const l of e.lines) {
      const account = s.accounts.find((a) => a.id === l.account_id);
      const purpose = account?.purpose ?? "";
      lines.push({
        effective_date: e.effective_date,
        entry_id: e.id,
        reference: e.reference,
        description: e.description,
        purpose,
        external_code: account?.external_code ?? VN_ACCOUNT_MAP[purpose] ?? "",
        side: l.side,
        amount: { ...l.amount },
        counterparty: account?.counterparty?.name ?? "",
      });
    }
  }
  return lines;
}

/** Số mục cần xử lý của mỗi tab (nhãn số trên tab). */
export async function financeCounts(): Promise<{ exceptions: number; closable: number }> {
  const s = store();
  const today = vietnamDay();
  return {
    exceptions: s.exceptions.filter((x) => x.status === "open").length,
    closable: s.periods.filter(
      (p) => p.book === "main" && p.status === "open" && monthBounds(p.month).ends_on < today,
    ).length,
  };
}
