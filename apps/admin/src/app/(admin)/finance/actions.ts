"use server";

// Server Action của màn "Kế toán" (module `tax`, `ledger`, `invoices` của core chưa có, bước 36): gọi
// hàm mẫu của `src/sample/finance.ts`, `finance-invoices.ts`, `tax.ts` thay cho API (W-006, W-016),
// cùng cách trả lỗi như khi gọi core thật — lỗi theo ô, gom mọi lỗi một lần, mã lỗi `ledger.*`,
// `invoices.*`, `tax.*`. Hàm mẫu không biết ai đang gọi, nên action kiểm permission dự kiến thay cho
// core. Khi có API chỉ thay lời gọi hàm mẫu bằng lời gọi core.
import type { Problem } from "@autoxide/sdk";
import { refresh } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import type { DialogState } from "@/components/ui/form-dialog";
import {
  commerceGuard,
  finishChange,
  finishCommerce,
  translateCommerce,
} from "@/lib/commerce-action";
import type { ChangeState } from "@/lib/engage";
import {
  INVOICES_CORRECT,
  INVOICES_EXPORT,
  INVOICES_ISSUE,
  INVOICES_MANDATES_MANAGE,
  INVOICES_SERIES_MANAGE,
  LEDGER_PERIODS_CLOSE,
  LEDGER_POST,
  LEDGER_RECONCILE,
  LEDGER_REVERSE,
  LEDGER_SETTINGS_MANAGE,
  parseDong,
  TAX_PROFILES_MANAGE,
  TAX_READ,
} from "@/lib/finance";
import { type FormState, nextDone, problemState } from "@/lib/form";
import { formatMoney } from "@/lib/format";
import { type QrPath, qrPath } from "@/lib/qr";
import { type BulkInput, type BulkResult, bulkBlocked, cleanIds, eachId } from "@/lib/table";
import { can, getMe } from "@/lib/viewer";
import {
  type BookKey,
  closePeriod,
  createBankAccount,
  listPeriods,
  type NewEntryLine,
  postEntry,
  previewVietQr,
  resolveException,
  reverseEntry,
  runReconciliation,
  type SampleOutcome,
  setBankFeed,
} from "@/sample/finance";
import {
  correctDocument,
  createExport,
  createMandate,
  createSeries,
  deactivateSeries,
  deleteDraft,
  issueDocument,
  refreshDocument,
  resubmitDocument,
  retryExport,
  revokeMandate,
} from "@/sample/finance-invoices";
import { listUnits } from "@/sample/org";
import { putTaxProfile, quoteInclusive, type TaxQuote } from "@/sample/tax";

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

function sent(formData: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, text(formData, name)]));
}

/** Tắt dữ liệu mẫu, hay thiếu permission dự kiến của bước 36, thì không ghi gì. */
async function guard(permission: string): Promise<FormState | null> {
  const off = await commerceGuard();
  if (off) return off;
  if (await can(permission)) return null;
  const t = await getTranslations("errors");
  return { error: t("forbidden", { permission }), code: "forbidden" };
}

async function actor(): Promise<string> {
  const me = await getMe();
  return me.name || me.email;
}

const finish = <T>(
  state: FormState,
  outcome: SampleOutcome<T>,
  fields: readonly string[],
  values?: Record<string, string>,
) => finishCommerce("finance", state, outcome, fields, values);

/**
 * Chạy một hàm mẫu cho từng id đã chọn (thanh hàng loạt; hàm mẫu chỉ có lệnh từng cái), gom lỗi theo
 * dòng bằng câu đã dịch (lỗi theo ô thì lấy câu của ô đầu tiên).
 */
async function bulkSample<T>(
  input: BulkInput,
  permission: string,
  run: (id: string) => Promise<SampleOutcome<T>>,
): Promise<BulkResult> {
  const ids = cleanIds(input.ids);
  const off = await guard(permission);
  if (off) return bulkBlocked(ids, off.error ?? "");
  const result = await eachId(ids, async (id) => {
    const outcome = await run(id);
    if (outcome.ok) return null;
    const problem = await translateCommerce(outcome.problem, "finance");
    return problem.errors?.[0]?.detail ?? problem.detail;
  });
  refresh();
  return result;
}

// ---------------------------------------------------------------- Sổ cái

/** Số dòng tối đa của một bút toán tay (form thêm dòng tới chừng này). */
const MAX_LINES = 12;

/**
 * Ghi bút toán tay. Form gửi các dòng `account.<i>`, `debit.<i>`, `credit.<i>`; mỗi dòng một bên.
 * Dòng trống bỏ qua. Lỗi của ô trỏ về đúng dòng; bút toán không cân báo kèm tổng hai bên.
 */
export async function postEntryAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await guard(LEDGER_POST);
  if (off) return off;
  const t = await getTranslations("finance.fields");
  const fields = ["book", "description", "effective_date", "reference", "attachment", "lines"];
  const rows = Math.min(Number(text(formData, "rows")) || 0, MAX_LINES);
  const lineFields: string[] = [];
  const errors: Record<string, string> = {};
  const lines: NewEntryLine[] = [];
  const rowOf: number[] = [];
  for (let i = 0; i < rows; i += 1) {
    lineFields.push(`account.${i}`, `debit.${i}`, `credit.${i}`);
    const account = text(formData, `account.${i}`);
    const debitText = text(formData, `debit.${i}`).trim();
    const creditText = text(formData, `credit.${i}`).trim();
    if (!account && !debitText && !creditText) continue;
    if (!account) errors[`account.${i}`] = t("line_account");
    if (debitText && creditText) {
      errors[`debit.${i}`] = t("one_side");
      continue;
    }
    if (!debitText && !creditText) {
      errors[`debit.${i}`] = t("line_amount");
      continue;
    }
    const amount = parseDong(debitText || creditText);
    if (amount === null) {
      errors[debitText ? `debit.${i}` : `credit.${i}`] = t("money_vnd");
      continue;
    }
    lines.push({
      account_id: account,
      side: debitText ? "debit" : "credit",
      amount: { amount: String(amount), currency: "VND" },
    });
    rowOf.push(i);
  }
  const values = sent(formData, fields);
  if (Object.keys(errors).length > 0) {
    return { fields: errors, code: "validation_failed" };
  }
  const outcome = await postEntry(
    {
      book: (values.book === "market" ? "market" : "main") as BookKey,
      description: values.description ?? "",
      effective_date: values.effective_date ?? "",
      reference: values.reference ?? "",
      attachment: values.attachment ?? null,
      lines,
    },
    await actor(),
  );
  if (outcome.ok) {
    refresh();
    return { done: nextDone(state) };
  }
  if (outcome.problem.code === "ledger.unbalanced") {
    const [codes, locale] = await Promise.all([getTranslations("finance.codes"), getLocale()]);
    const sum = (side: "debit" | "credit") =>
      lines.filter((l) => l.side === side).reduce((n, l) => n + Number(l.amount.amount), 0);
    return {
      code: outcome.problem.code,
      error: codes("ledger_unbalanced_amounts", {
        debit: formatMoney(sum("debit"), "VND", locale),
        credit: formatMoney(sum("credit"), "VND", locale),
      }),
    };
  }
  // `lines[k].account_id` / `lines[k].amount` của API trỏ về ô của dòng `rowOf[k]` trên form.
  const problem: Problem = {
    ...outcome.problem,
    ...(outcome.problem.errors
      ? {
          errors: outcome.problem.errors.map((entry) => {
            const match = /^lines\[(\d+)\]\.(account_id|amount)$/.exec(entry.field);
            if (!match) return entry;
            const k = Number(match[1]);
            const row = rowOf[k] ?? 0;
            const field =
              match[2] === "account_id"
                ? `account.${row}`
                : lines[k]?.side === "credit"
                  ? `credit.${row}`
                  : `debit.${row}`;
            return { ...entry, field };
          }),
        }
      : {}),
  };
  const translated = await translateCommerce(problem, "finance");
  return problemState(translated, [...fields, ...lineFields]);
}

export async function reverseEntryAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const off = await guard(LEDGER_REVERSE);
  if (off) return off;
  const fields = ["reason", "effective_date"];
  const values = sent(formData, fields);
  const outcome = await reverseEntry(
    text(formData, "id"),
    { reason: values.reason ?? "", effective_date: values.effective_date ?? "" },
    await actor(),
  );
  return finish(state, outcome, fields, values);
}

/** Khoá sổ: phải gõ đúng tên kỳ (vd 10/2026) để xác nhận — khoá rồi không mở lại. */
export async function closePeriodAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const off = await guard(LEDGER_PERIODS_CLOSE);
  if (off) return off;
  const id = text(formData, "id");
  const { data: periods } = await listPeriods(
    text(formData, "book") === "market" ? "market" : "main",
  );
  const period = periods.find((p) => p.id === id);
  const expected = period ? `${period.starts_on.slice(5, 7)}/${period.starts_on.slice(0, 4)}` : "";
  if (text(formData, "confirm").trim() !== expected) {
    const t = await getTranslations("finance.fields");
    return {
      fields: { confirm: t("confirm_text", { value: expected }) },
      code: "validation_failed",
    };
  }
  return finish(state, await closePeriod(id, await actor()), ["confirm"]);
}

// ---------------------------------------------------------------- Hàng chờ sai lệch, đối soát

export async function resolveExceptionAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const off = await guard(LEDGER_RECONCILE);
  if (off) return off;
  const fields = ["action", "payment_code", "note"];
  const values = sent(formData, fields);
  const outcome = await resolveException(
    text(formData, "id"),
    {
      action: values.action ?? "",
      payment_code: values.payment_code ?? "",
      note: values.note ?? "",
    },
    await actor(),
  );
  return finish(state, outcome, fields, values);
}

/** Bỏ qua nhiều mục sai lệch (thanh hàng loạt) với cùng một lý do (`value`); mục đã xử lý thì báo lỗi. */
export async function bulkIgnoreExceptionsAction(input: BulkInput): Promise<BulkResult> {
  const who = await actor();
  const note = input.value ?? "";
  return bulkSample(input, LEDGER_RECONCILE, (id) =>
    resolveException(id, { action: "ignore", payment_code: "", note }, who),
  );
}

/** "Đối soát ngay": xếp việc kéo sao kê của một ngày rồi khớp. */
export async function reconcileAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await guard(LEDGER_RECONCILE);
  if (off) return off;
  const outcome = await runReconciliation(text(formData, "id"), await actor());
  return finish(state, outcome, []);
}

// ---------------------------------------------------------------- Tài khoản ngân hàng, VietQR

export async function createBankAccountAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const off = await guard(LEDGER_SETTINGS_MANAGE);
  if (off) return off;
  const fields = ["bank_bin", "account_number", "account_name", "org_id"];
  const values = sent(formData, fields);
  const { data: units } = await listUnits();
  const unit = units.find((u) => u.id === values.org_id);
  const outcome = await createBankAccount({
    bank_bin: values.bank_bin ?? "",
    account_number: values.account_number ?? "",
    account_name: values.account_name ?? "",
    org_id: unit?.id ?? "",
    org_name: unit?.name ?? "",
  });
  return finish(state, outcome, fields, values);
}

/** Tạm dừng / bật lại đọc biến động số dư; trả trạng thái cũ cho Hoàn tác. */
export async function bankFeedAction(
  _state: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const off = await guard(LEDGER_SETTINGS_MANAGE);
  if (off) return off;
  const outcome = await setBankFeed(text(formData, "id"), text(formData, "status"));
  return finishChange("finance", outcome, (data) => data.previous);
}

export interface VietQrState extends FormState {
  result?: {
    payload: string;
    qr: QrPath;
    amount: string;
    transfer_code: string;
    expires_at: string;
  };
}

/** "Thử tạo mã VietQR": chuỗi mã theo chuẩn NAPAS, ảnh QR vẽ ở máy chủ (trình duyệt chỉ nhận path). */
export async function vietQrAction(state: VietQrState, formData: FormData): Promise<VietQrState> {
  const off = await guard(LEDGER_SETTINGS_MANAGE);
  if (off) return off;
  const fields = ["bank_account_id", "amount", "memo"];
  const values = sent(formData, fields);
  const amount = parseDong(values.amount ?? "");
  const outcome = await previewVietQr({
    bank_account_id: values.bank_account_id ?? "",
    amount: amount === null ? (values.amount ?? "") : String(amount),
    memo: (values.memo ?? "").trim().toUpperCase(),
  });
  if (!outcome.ok) {
    const problem = await translateCommerce(outcome.problem, "finance");
    return { ...problemState(problem, fields), values };
  }
  const locale = await getLocale();
  return {
    done: nextDone(state),
    values,
    result: {
      payload: outcome.data.payload,
      qr: qrPath(outcome.data.payload),
      amount: formatMoney(outcome.data.amount.amount, outcome.data.amount.currency, locale),
      transfer_code: outcome.data.transfer_code,
      expires_at: outcome.data.expires_at,
    },
  };
}

// ---------------------------------------------------------------- Hoá đơn điện tử

export async function resubmitDocumentAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const off = await guard(INVOICES_ISSUE);
  if (off) return off;
  const fields = ["buyer_tax_code", "buyer_name", "buyer_address"];
  const values = sent(formData, fields);
  const outcome = await resubmitDocument(text(formData, "id"), {
    buyer_tax_code: values.buyer_tax_code ?? "",
    buyer_name: values.buyer_name ?? "",
    buyer_address: values.buyer_address ?? "",
  });
  return finish(state, outcome, fields, values);
}

export async function refreshDocumentAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await guard(INVOICES_ISSUE);
  if (off) return off;
  return finish(state, await refreshDocument(text(formData, "id")), []);
}

export async function correctDocumentAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const off = await guard(INVOICES_CORRECT);
  if (off) return off;
  const fields = ["how", "reason"];
  const values = sent(formData, fields);
  const outcome = await correctDocument(text(formData, "id"), {
    how: values.how ?? "",
    reason: values.reason ?? "",
  });
  if (outcome.ok && outcome.data.created) {
    const result = await finish(state, outcome, fields, values);
    return { ...result, go: `/finance/einvoices?open=${outcome.data.created.id}` };
  }
  return finish(state, outcome, fields, values);
}

export async function issueDocumentAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await guard(INVOICES_ISSUE);
  if (off) return off;
  return finish(state, await issueDocument(text(formData, "id")), []);
}

/** Phát hành nhiều hoá đơn nháp (thanh hàng loạt): mỗi hoá đơn nhận số kế tiếp của ký hiệu. */
export async function bulkIssueDocumentsAction(input: BulkInput): Promise<BulkResult> {
  return bulkSample(input, INVOICES_ISSUE, issueDocument);
}

/** Hỏi lại nhà cung cấp cho nhiều hoá đơn đang gửi (thanh hàng loạt). */
export async function bulkRefreshDocumentsAction(input: BulkInput): Promise<BulkResult> {
  return bulkSample(input, INVOICES_ISSUE, refreshDocument);
}

export async function deleteDraftAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await guard(INVOICES_ISSUE);
  if (off) return off;
  return finish(state, await deleteDraft(text(formData, "id")), []);
}

// ---------------------------------------------------------------- Ký hiệu, uỷ nhiệm

export async function createSeriesAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const off = await guard(INVOICES_SERIES_MANAGE);
  if (off) return off;
  const fields = ["org_id", "kind", "symbol", "year"];
  const values = sent(formData, fields);
  const { data: units } = await listUnits();
  const unit = units.find((u) => u.id === values.org_id);
  const outcome = await createSeries({
    org_id: unit?.id ?? "",
    org_name: unit?.name ?? "",
    kind: values.kind ?? "",
    symbol: values.symbol ?? "",
    year: values.year ?? "",
  });
  return finish(state, outcome, fields, values);
}

export async function deactivateSeriesAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await guard(INVOICES_SERIES_MANAGE);
  if (off) return off;
  return finish(state, await deactivateSeries(text(formData, "id")), []);
}

export async function createMandateAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const off = await guard(INVOICES_MANDATES_MANAGE);
  if (off) return off;
  const fields = ["principal_org_id", "kind", "valid_from", "valid_to", "signed"];
  const values = sent(formData, fields);
  const { data: units } = await listUnits();
  const unit = units.find((u) => u.id === values.principal_org_id && u.unit_type === "seller");
  const outcome = await createMandate({
    principal_org_id: unit?.id ?? "",
    principal_name: unit?.name ?? "",
    kind: values.kind ?? "",
    valid_from: values.valid_from ?? "",
    valid_to: values.valid_to ?? "",
    signed: values.signed === "on",
  });
  return finish(state, outcome, fields, values);
}

export async function revokeMandateAction(
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const off = await guard(INVOICES_MANDATES_MANAGE);
  if (off) return off;
  return finish(state, await revokeMandate(text(formData, "id")), []);
}

// ---------------------------------------------------------------- Thuế

export interface QuoteState extends FormState {
  result?: { quote: TaxQuote; later: TaxQuote | null };
}

/**
 * "Tính thử thuế": tách ngược từ giá đã gồm thuế, làm tròn một lần. Kèm kết quả nếu ngày tính thuế
 * sau lần đổi thuế suất kế tiếp (để thấy 8% → 10% từ 01/01/2027).
 */
export async function quoteTaxAction(state: QuoteState, formData: FormData): Promise<QuoteState> {
  const off = await guard(TAX_READ);
  if (off) return off;
  const fields = ["category", "gross", "tax_point"];
  const values = sent(formData, fields);
  const t = await getTranslations("finance.fields");
  const errors: Record<string, string> = {};
  const gross = parseDong(values.gross ?? "");
  if (gross === null) errors.gross = t("money_vnd");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.tax_point ?? "")) errors.tax_point = t("required");
  if (gross === null || Object.keys(errors).length > 0) {
    return { fields: errors, code: "validation_failed", values };
  }
  const quote = await quoteInclusive({
    category: values.category ?? "",
    gross,
    tax_point: values.tax_point ?? "",
  });
  if (!quote.ok) {
    const codes = await getTranslations("finance.codes");
    const key = quote.code.replaceAll(".", "_");
    return {
      code: quote.code,
      error: codes.has(key) ? codes(key) : quote.code,
      values,
    };
  }
  const later = await quoteInclusive({
    category: values.category ?? "",
    gross,
    tax_point: quote.data.rate.effective_to ?? "",
  });
  return {
    done: nextDone(state),
    values,
    result: {
      quote: quote.data,
      later: quote.data.rate.effective_to && later.ok ? later.data : null,
    },
  };
}

export async function saveTaxProfileAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const off = await guard(TAX_PROFILES_MANAGE);
  if (off) return off;
  const fields = ["tax_code", "legal_name", "regime"];
  const values = sent(formData, fields);
  const outcome = await putTaxProfile(
    text(formData, "org_id"),
    {
      tax_code: values.tax_code ?? "",
      legal_name: values.legal_name ?? "",
      regime: values.regime ?? "",
    },
    await actor(),
  );
  return finish(state, outcome, fields, values);
}

// ---------------------------------------------------------------- Xuất kế toán

export async function createExportAction(
  state: DialogState,
  formData: FormData,
): Promise<DialogState> {
  const off = await guard(INVOICES_EXPORT);
  if (off) return off;
  const fields = ["profile", "format", "period_from", "period_to"];
  const values = sent(formData, fields);
  const outcome = await createExport(
    {
      profile: values.profile ?? "",
      format: values.format ?? "csv",
      period_from: values.period_from ?? "",
      period_to: values.period_to ?? "",
    },
    await actor(),
  );
  const result = await finish(state, outcome, fields, values);
  return outcome.ok ? { ...result, go: "/finance/export" } : result;
}

export async function retryExportAction(state: FormState, formData: FormData): Promise<FormState> {
  const off = await guard(INVOICES_EXPORT);
  if (off) return off;
  return finish(state, await retryExport(text(formData, "id")), []);
}
