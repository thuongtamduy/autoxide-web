"use client";

// Hai công cụ của màn "Sản phẩm và giá" có kết quả hiện ngay dưới form: "Giá giải ra vì sao" (giá
// đang áp cho một biến thể ở một cửa hàng, bảng nào thắng và vì sao) và nhập CSV có chạy thử.
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useRef } from "react";
import {
  type ImportState,
  importAction,
  type ResolveState,
  resolvePriceAction,
} from "@/app/(admin)/catalog/actions";
import {
  Field,
  FormAlert,
  SelectField,
  TextareaField,
  useFocusInvalid,
  useOnDone,
} from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import type { Option } from "./forms";

export function ResolveForm({
  variants,
  stores,
  defaults,
}: {
  variants: Option[];
  stores: Option[];
  defaults: { variant_id: string; org_id: string; at: string };
}) {
  const t = useTranslations("catalog.prices.resolve");
  const locale = useLocale();
  const [state, run, pending] = useActionState<ResolveState, FormData>(resolvePriceAction, {});
  const result = state.result;
  const winner = result?.candidates.find((c) => c.outcome === "winner");
  return (
    <form action={run} noValidate className="card padded dlg-form">
      <SelectField
        label={t("variant")}
        name="variant_id"
        defaultValue={defaults.variant_id}
        options={variants}
      />
      <div className="fld-row">
        <SelectField
          label={t("store")}
          name="org_id"
          defaultValue={defaults.org_id}
          options={stores}
        />
        <Field label={t("group")} name="customer_group" mono hint={t("groupHint")} />
      </div>
      <Field
        label={t("at")}
        name="at"
        type="datetime-local"
        defaultValue={defaults.at}
        hint={t("atHint")}
      />
      <div className="role-foot">
        <FormAlert state={state} />
        <button type="submit" className="btn pri" disabled={pending}>
          {t("submit")}
        </button>
      </div>
      {result ? (
        <output className="cat-resolve" aria-live="polite">
          {result.price && winner ? (
            <p>
              <b className="cat-price">
                {formatMoney(result.price.amount.amount, result.price.amount.currency, locale)}
              </b>{" "}
              {t("from", { list: winner.name, node: winner.org_name })}{" "}
              {result.price.tax_inclusive ? t("taxIncluded") : t("taxExcluded")}
            </p>
          ) : (
            <p>
              <b>{t("noPrice")}</b>
            </p>
          )}
          <ol className="cat-steps">
            {result.candidates.map((c) => (
              <li key={c.price_list_id} data-outcome={c.outcome}>
                <b>{c.name}</b> <span className="muted">· {c.org_name}</span>
                {c.amount ? ` · ${formatMoney(c.amount.amount, c.amount.currency, locale)}` : ""}
                <span className="sub">
                  {t(`outcomes.${c.outcome}`, {
                    priority: c.priority,
                    group: c.customer_group ?? "",
                  })}
                </span>
              </li>
            ))}
          </ol>
        </output>
      ) : null}
    </form>
  );
}

/**
 * Nhập CSV hai bước: "Chạy thử" kiểm mọi dòng như lần nhập thật mà không ghi gì, hiện số dòng sẽ
 * tạo / cập nhật và lỗi theo dòng; rồi "Nhập" chạy thật với đúng nội dung vừa kiểm (giữ trong trạng
 * thái của form, không phải chọn lại tệp). Dòng lỗi không chặn dòng đúng.
 */
export function ImportPanel() {
  const t = useTranslations("catalog.imports");
  const errors = useTranslations("catalog.rowErrors");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useActionState<ImportState, FormData>(importAction, {});
  useFocusInvalid(form, state);
  useOnDone(state.done, () =>
    toast(t("ran", { ok: state.transfer?.ok_rows ?? 0, total: state.transfer?.total_rows ?? 0 })),
  );
  const preview = state.preview;
  const errorText = (code: string, params: Record<string, string>) =>
    errors.has(code.replaceAll(".", "_")) ? errors(code.replaceAll(".", "_"), params) : code;
  return (
    <form ref={form} action={run} noValidate className="card padded dlg-form" id="import">
      {preview && state.text !== undefined ? (
        <>
          <input type="hidden" name="kept" value={state.text} />
          <input type="hidden" name="file_name" value={state.fileName ?? ""} />
          <input type="hidden" name="mode" value={state.mode ?? "upsert"} />
          <div className="cat-preview" role="status">
            <h3 className="h2">{t("previewTitle", { file: state.fileName ?? "" })}</h3>
            <p>
              {t("previewSummary", {
                total: preview.total_rows,
                create: preview.create,
                update: preview.update,
                errors: preview.errors.length,
              })}
            </p>
            {preview.errors.length > 0 ? (
              <ul className="cat-rowerrs">
                {preview.errors.slice(0, 50).map((e) => (
                  <li key={`${e.row}-${e.column}-${e.code}`}>
                    <span className="mono">{t("rowAt", { row: e.row, column: e.column })}</span>{" "}
                    {errorText(e.code, e.params)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="fhint">{t("previewClean")}</p>
            )}
            <div className="role-foot">
              <button
                type="submit"
                name="run"
                value="1"
                className="btn pri"
                disabled={pending || preview.create + preview.update === 0}
              >
                {t("run", { count: preview.create + preview.update })}
              </button>
              <button type="submit" name="again" value="1" className="btn" disabled={pending}>
                {t("again")}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <Field
            label={t("file")}
            name="file"
            type="file"
            accept=".csv,text/csv"
            hint={t("fileHint")}
            error={state.fields?.file}
          />
          <TextareaField
            label={t("paste")}
            name="pasted"
            rows={4}
            className="inp area mono"
            hint={t("pasteHint")}
          />
          <SelectField
            label={t("mode")}
            name="mode"
            defaultValue="upsert"
            options={[
              { value: "upsert", label: t("modes.upsert") },
              { value: "update_only", label: t("modes.update_only") },
            ]}
          />
          <p className="fhint">{t("columns")}</p>
          <div className="role-foot">
            <FormAlert state={state} />
            <button type="submit" className="btn pri" disabled={pending}>
              {t("preview")}
            </button>
          </div>
        </>
      )}
      {state.transfer ? (
        <p className="fhint" role="status">
          {t("ranDetail", {
            file: state.transfer.file_name,
            created: state.transfer.created_rows,
            updated: state.transfer.updated_rows,
            errors: state.transfer.errors.length,
          })}
        </p>
      ) : null}
    </form>
  );
}
