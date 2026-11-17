"use client";

import { useLocale } from "next-intl";
import { useActionState, useRef } from "react";
import { Field, FormAlert, SelectField, useFocusInvalid } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { formatMoney } from "@/lib/format";
import type { FeePreview } from "@/sample/market";

interface PreviewState extends FormState {
  result?: FeePreview;
}

type Option = { value: string; label: string };

/**
 * Tính thử phí sàn và tiền người bán nhận cho một đơn: chỉ tính, không ghi. Chữ đã dịch do trang
 * (Server Component) truyền xuống; kết quả là số của hàm tính phí ở máy chủ, trình duyệt chỉ hiện.
 */
export function FeePreviewForm({
  action,
  categories,
  types,
  defaults,
  labels,
}: {
  action: (state: PreviewState, formData: FormData) => Promise<PreviewState>;
  categories: readonly Option[];
  types: readonly Option[];
  defaults: { category_id: string; price: string; seller_type: string; date: string };
  labels: {
    category: string;
    price: string;
    priceHint: string;
    type: string;
    typeHint: string;
    date: string;
    submit: string;
    commission: string;
    feeVat: string;
    vat: string;
    pit: string;
    net: string;
    gross: string;
    none: string;
  };
}) {
  const locale = useLocale();
  const form = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useActionState(action, {});
  useFocusInvalid(form, state);
  const value = (name: keyof typeof defaults) => state.values?.[name] ?? defaults[name];
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  const r = state.result;
  const pct = (p: string | null) =>
    p ? new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(p)) : "0";
  return (
    <div className="mk-preview-form">
      <form ref={form} action={run} noValidate className="dlg-form cp-form">
        <SelectField
          label={labels.category}
          name="category_id"
          options={categories}
          defaultValue={value("category_id")}
          error={state.fields?.category_id}
        />
        <Field
          money
          label={labels.price}
          name="price"
          mono
          inputMode="numeric"
          hint={labels.priceHint}
          defaultValue={value("price")}
          error={state.fields?.price}
        />
        <SelectField
          label={labels.type}
          name="seller_type"
          options={types}
          hint={labels.typeHint}
          defaultValue={value("seller_type")}
          error={state.fields?.seller_type}
        />
        <Field
          label={labels.date}
          name="date"
          type="date"
          defaultValue={value("date")}
          error={state.fields?.date}
        />
        <FormAlert state={state} />
        <div className="dlg-acts">
          <button type="submit" className="btn pri" disabled={pending}>
            {labels.submit}
          </button>
        </div>
      </form>
      {r ? (
        <output className="mk-preview-result" aria-live="polite">
          <dl className="mk-lines">
            <div>
              <dt>{labels.gross}</dt>
              <dd className="num">{money(r.gross.amount)}</dd>
            </div>
            <div>
              <dt>
                {labels.commission} (
                {new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
                  r.commission_bp / 100,
                )}
                %)
              </dt>
              <dd className="num">−{money(r.fees.amount)}</dd>
            </div>
            <div>
              <dt>{labels.feeVat}</dt>
              <dd className="num">{money(r.fee_vat.amount)}</dd>
            </div>
            <div>
              <dt>
                {labels.vat} ({pct(r.vat_percent)}%)
              </dt>
              <dd className="num">−{money(r.withholding_vat.amount)}</dd>
            </div>
            <div>
              <dt>
                {labels.pit} ({pct(r.pit_percent)}%)
              </dt>
              <dd className="num">−{money(r.withholding_pit.amount)}</dd>
            </div>
            <div className="mk-total">
              <dt>{labels.net}</dt>
              <dd className="num">
                <b>{money(r.net.amount)}</b>
              </dd>
            </div>
          </dl>
          {r.rule_id === null ? <p className="fhint">{labels.none}</p> : null}
        </output>
      ) : null}
    </div>
  );
}
