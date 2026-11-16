"use client";

// Ba form của màn "Kế toán" có phần chạy ở trình duyệt: ghi bút toán tay (thêm / bớt dòng, cộng Nợ
// và Có ngay khi gõ), thử tạo mã VietQR (hiện ảnh QR và chuỗi mã) và tính thử thuế (hiện kết quả
// dưới form). Mọi hộp thoại khác dùng `FormDialog` dùng chung. Server Action vẫn kiểm lại mọi thứ —
// phần cộng ở đây chỉ để người gõ thấy lệch trước khi gửi.
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useRef, useState } from "react";
import {
  postEntryAction,
  type QuoteState,
  quoteTaxAction,
  type VietQrState,
  vietQrAction,
} from "@/app/(admin)/finance/actions";
import { Dialog } from "@/components/ui/dialog";
import {
  DialogButtons,
  Field,
  FormAlert,
  SelectField,
  useFocusInvalid,
  useSubmit,
} from "@/components/ui/form";
import { CopyButton } from "@/components/ui/secret-once";
import { Time } from "@/components/ui/time";
import { useToast } from "@/components/ui/toast";
import { formatDay } from "@/lib/catalog";
import { entryTotals, formatPercent } from "@/lib/finance";
import type { FormState } from "@/lib/form";
import { formatMoney } from "@/lib/format";

export interface Option {
  value: string;
  label: string;
}

interface Row {
  key: number;
  account: string;
  debit: string;
  credit: string;
}

const MAX_LINES = 12;

/**
 * "Ghi bút toán tay": diễn giải, ngày hiệu lực, mã tham chiếu và các dòng Nợ / Có. Mỗi dòng một
 * bên; tổng hai bên và chênh lệch cộng lại ngay khi gõ. Bút toán ghi rồi không sửa được, chỉ đảo.
 */
export function JournalEntryDialog({
  books,
  accounts,
  today,
  reference,
  triggerClass = "btn pri",
}: {
  books: Option[];
  accounts: Record<string, Option[]>;
  today: string;
  reference: string;
  triggerClass?: string;
}) {
  const t = useTranslations("finance.entry");
  return (
    <Dialog
      label={t("button")}
      title={t("title")}
      triggerClass={triggerClass}
      intro={<p>{t("intro")}</p>}
    >
      {(close) => (
        <EntryForm
          books={books}
          accounts={accounts}
          today={today}
          reference={reference}
          close={close}
        />
      )}
    </Dialog>
  );
}

function EntryForm({
  books,
  accounts,
  today,
  reference,
  close,
}: {
  books: Option[];
  accounts: Record<string, Option[]>;
  today: string;
  reference: string;
  close: () => void;
}) {
  const t = useTranslations("finance.entry");
  const locale = useLocale();
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [book, setBook] = useState(books[0]?.value ?? "main");
  const [head, setHead] = useState({
    description: "",
    effective_date: today,
    reference,
    attachment: "",
  });
  const [rows, setRows] = useState<Row[]>([
    { key: 1, account: "", debit: "", credit: "" },
    { key: 2, account: "", debit: "", credit: "" },
  ]);
  const [state, run, pending] = useSubmit<FormState>(postEntryAction, () => {
    close();
    toast(t("done"));
  });
  useFocusInvalid(form, state);
  const totals = entryTotals(rows);
  const options = [{ value: "", label: t("chooseAccount") }, ...(accounts[book] ?? [])];
  const money = (n: number) => formatMoney(n, "VND", locale);
  const setRow = (key: number, patch: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const error = (name: string) => state.fields?.[name];
  return (
    <form ref={form} action={run} noValidate className="dlg-form">
      <input type="hidden" name="rows" value={rows.length} />
      <SelectField
        label={t("book")}
        name="book"
        options={books}
        value={book}
        onChange={(e) => {
          setBook(e.target.value);
          setRows((list) => list.map((r) => ({ ...r, account: "" })));
        }}
        error={error("book")}
      />
      <Field
        label={t("description")}
        name="description"
        value={head.description}
        onChange={(e) => setHead({ ...head, description: e.target.value })}
        placeholder={t("descriptionPlaceholder")}
        hint={t("descriptionHint")}
        error={error("description")}
        autoComplete="off"
      />
      <div className="fld-row">
        <Field
          label={t("date")}
          name="effective_date"
          type="date"
          value={head.effective_date}
          onChange={(e) => setHead({ ...head, effective_date: e.target.value })}
          hint={t("dateHint")}
          error={error("effective_date")}
        />
        <Field
          label={t("reference")}
          name="reference"
          mono
          value={head.reference}
          onChange={(e) => setHead({ ...head, reference: e.target.value })}
          hint={t("referenceHint")}
          error={error("reference")}
          autoComplete="off"
        />
      </div>
      <Field
        label={t("attachment")}
        name="attachment"
        mono
        value={head.attachment}
        onChange={(e) => setHead({ ...head, attachment: e.target.value })}
        placeholder="PC-2611-0013"
        hint={t("attachmentHint")}
        error={error("attachment")}
        autoComplete="off"
      />
      <div className="fin-lines">
        {rows.map((row, index) => (
          <fieldset key={row.key} className="fin-line">
            <legend className="lab">{t("line", { n: index + 1 })}</legend>
            <SelectField
              label={t("account")}
              name={`account.${index}`}
              options={options}
              value={row.account}
              onChange={(e) => setRow(row.key, { account: e.target.value })}
              error={error(`account.${index}`)}
            />
            <Field
              label={t("debit")}
              name={`debit.${index}`}
              mono
              inputMode="numeric"
              value={row.debit}
              onChange={(e) => setRow(row.key, { debit: e.target.value })}
              error={error(`debit.${index}`)}
              autoComplete="off"
            />
            <Field
              label={t("credit")}
              name={`credit.${index}`}
              mono
              inputMode="numeric"
              value={row.credit}
              onChange={(e) => setRow(row.key, { credit: e.target.value })}
              error={error(`credit.${index}`)}
              autoComplete="off"
            />
            {rows.length > 2 ? (
              <button
                type="button"
                className="btn ghost sm fin-line-x"
                onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
              >
                {t("removeLine", { n: index + 1 })}
              </button>
            ) : null}
          </fieldset>
        ))}
      </div>
      {rows.length < MAX_LINES ? (
        <button
          type="button"
          className="btn sm fin-add"
          onClick={() =>
            setRows((list) => [
              ...list,
              {
                key: Math.max(0, ...list.map((r) => r.key)) + 1,
                account: "",
                debit: "",
                credit: "",
              },
            ])
          }
        >
          {t("addLine")}
        </button>
      ) : null}
      <output
        className={totals.difference === 0 && totals.debit > 0 ? "fin-totals ok" : "fin-totals"}
        aria-live="polite"
      >
        <span>
          {t("totalDebit")} <b className="mono">{money(totals.debit)}</b>
        </span>
        <span>
          {t("totalCredit")} <b className="mono">{money(totals.credit)}</b>
        </span>
        <span>
          {totals.difference === 0
            ? totals.debit > 0
              ? t("balanced")
              : t("empty")
            : t("difference", { amount: money(Math.abs(totals.difference)) })}
        </span>
      </output>
      {error("lines") ? <p className="ferr">{error("lines")}</p> : null}
      <FormAlert state={state} />
      <DialogButtons submit={t("submit")} pending={pending} close={close} />
    </form>
  );
}

/** "Thử tạo mã VietQR": chuỗi mã theo chuẩn NAPAS cho một tài khoản, số tiền và nội dung. */
export function VietQrForm({
  accounts,
  defaults,
}: {
  accounts: Option[];
  defaults: { bank_account_id: string; amount: string; memo: string };
}) {
  const t = useTranslations("finance.bank.qr");
  const [state, run, pending] = useActionState<VietQrState, FormData>(vietQrAction, {});
  const form = useRef<HTMLFormElement>(null);
  useFocusInvalid(form, state);
  const value = (name: keyof typeof defaults) => state.values?.[name] ?? defaults[name];
  const result = state.result;
  return (
    <form ref={form} action={run} noValidate className="card padded dlg-form">
      <SelectField
        label={t("account")}
        name="bank_account_id"
        options={accounts}
        defaultValue={value("bank_account_id")}
        error={state.fields?.bank_account_id}
      />
      <Field
        label={t("amount")}
        name="amount"
        mono
        inputMode="numeric"
        defaultValue={value("amount")}
        error={state.fields?.amount}
        autoComplete="off"
      />
      <Field
        label={t("memo")}
        name="memo"
        mono
        defaultValue={value("memo")}
        hint={t("memoHint")}
        error={state.fields?.memo}
        autoComplete="off"
      />
      <div className="role-foot">
        <FormAlert state={state} />
        <button type="submit" className="btn pri" disabled={pending}>
          {t("submit")}
        </button>
      </div>
      {result ? (
        <output className="fin-qr" aria-live="polite">
          <svg
            className="qr"
            viewBox={`0 0 ${result.qr.size} ${result.qr.size}`}
            role="img"
            aria-label={t("image", { amount: result.amount, memo: result.transfer_code })}
          >
            <rect width={result.qr.size} height={result.qr.size} fill="#fff" />
            <path d={result.qr.d} fill="#000" />
          </svg>
          <span className="fin-qr-text">
            <b>{t("made", { amount: result.amount, memo: result.transfer_code })}</b>
            <span className="fhint">
              {t("expires")} <Time value={result.expires_at} />
            </span>
            <code className="secret mono">{result.payload}</code>
            <CopyButton text={result.payload} label={t("copy")} />
          </span>
        </output>
      ) : null}
    </form>
  );
}

/** "Tính thử thuế": tách ngược thuế từ giá đã gồm thuế, theo thuế suất có hiệu lực vào ngày tính thuế. */
export function TaxQuoteForm({
  categories,
  defaults,
}: {
  categories: Option[];
  defaults: { category: string; gross: string; tax_point: string };
}) {
  const t = useTranslations("finance.tax.quote");
  const locale = useLocale();
  const [state, run, pending] = useActionState<QuoteState, FormData>(quoteTaxAction, {});
  const form = useRef<HTMLFormElement>(null);
  useFocusInvalid(form, state);
  const value = (name: keyof typeof defaults) => state.values?.[name] ?? defaults[name];
  const money = (n: number) => formatMoney(n, "VND", locale);
  const result = state.result;
  return (
    <form ref={form} action={run} noValidate className="card padded dlg-form">
      <SelectField
        label={t("category")}
        name="category"
        options={categories}
        defaultValue={value("category")}
        error={state.fields?.category}
      />
      <div className="fld-row">
        <Field
          label={t("gross")}
          name="gross"
          mono
          inputMode="numeric"
          defaultValue={value("gross")}
          error={state.fields?.gross}
          autoComplete="off"
        />
        <Field
          label={t("taxPoint")}
          name="tax_point"
          type="date"
          defaultValue={value("tax_point")}
          error={state.fields?.tax_point}
        />
      </div>
      <p className="fhint">{t("hint")}</p>
      <div className="role-foot">
        <FormAlert state={state} />
        <button type="submit" className="btn pri" disabled={pending}>
          {t("submit")}
        </button>
      </div>
      {result ? (
        <output className="fin-quote" aria-live="polite">
          <b>
            {t("result", {
              gross: money(result.quote.gross),
              rate: formatPercent(result.quote.rate.rate_percent, locale),
              net: money(result.quote.net),
              tax: money(result.quote.tax),
            })}
          </b>
          {result.later ? (
            <span>
              {t("later", {
                date: formatDay(result.later.tax_point, locale),
                rate: formatPercent(result.later.rate.rate_percent, locale),
                net: money(result.later.net),
                tax: money(result.later.tax),
              })}
            </span>
          ) : null}
          <span className="fhint">
            {t("snapshot", { pack: result.quote.snapshot.pack_version })}
          </span>
        </output>
      ) : null}
    </form>
  );
}
