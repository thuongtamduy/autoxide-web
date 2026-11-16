"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { keepUnits } from "@/lib/format";
import { text } from "@/sample";
import { type ReturnState, requestReturn } from "@/sample/account-actions";
import type { OrderLine } from "@/sample/orders";
import { ErrorSummary, ErrorText, errorFor } from "./form-errors";

const REASONS = ["damaged", "wrong_item", "not_as_described", "changed_mind"] as const;

/**
 * Yêu cầu đổi trả trong hạn: chọn món, lý do, mô tả, cách gửi trả. Mở bằng một nút; gửi xong hiện câu
 * xác nhận. Mẫu; thay bằng `POST /api/v1/orders/me/orders/{id}/returns/preview` (xem trước tiền hoàn)
 * và `POST …/returns` (bước 45; ảnh qua module `media`).
 */
export function ReturnForm({
  number,
  lines,
  locale,
  daysLeft,
}: {
  number: string;
  lines: OrderLine[];
  locale: string;
  daysLeft: number;
}) {
  const t = useTranslations("account.returns");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ReturnState, FormData>(requestReturn, {
    status: "idle",
    errors: [],
  });
  const id = number.toLowerCase();
  if (state.status === "ok") {
    return (
      <p className="by-ok acx-retl" role="status">
        {t("sent", { number })}
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" className="btn sm" onClick={() => setOpen(true)} aria-expanded={false}>
        {t("open", { days: daysLeft })}
      </button>
    );
  }
  const error = (field: string) => errorFor(state.errors, field);
  return (
    <form action={action} className="acx-return pop" noValidate aria-label={t("title", { number })}>
      <input type="hidden" name="number" value={number} />
      <b>{t("title", { number })}</b>
      <ErrorSummary errors={state.errors} />
      <ErrorText id={`${id}-number-err`} error={error("number")} />
      <fieldset aria-describedby={`${id}-sku-err`}>
        <legend className="lab">{t("items")}</legend>
        {lines.map((line) => (
          <label className="co-check" key={line.sku}>
            <input type="checkbox" className="chk" name="sku" value={line.sku} />
            <span>
              {keepUnits(text(line.names, locale))}
              {line.option ? ` · ${text(line.option, locale)}` : ""} × {line.quantity}
            </span>
          </label>
        ))}
        <ErrorText id={`${id}-sku-err`} error={error("sku")} />
      </fieldset>
      <div className="co-field">
        <label className="lab" htmlFor={`${id}-reason`}>
          {t("reason")}
        </label>
        <select
          id={`${id}-reason`}
          name="reason"
          className={`sel${error("reason") ? " err" : ""}`}
          defaultValue=""
          aria-invalid={error("reason") ? true : undefined}
          aria-describedby={`${id}-reason-err`}
        >
          <option value="">{t("reasonChoose")}</option>
          {REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {t(`reasons.${reason}`)}
            </option>
          ))}
        </select>
        <ErrorText id={`${id}-reason-err`} error={error("reason")} />
      </div>
      <div className="co-field">
        <label className="lab" htmlFor={`${id}-note`}>
          {t("note")}
        </label>
        <textarea
          id={`${id}-note`}
          name="note"
          rows={3}
          maxLength={1000}
          className={`inp${error("note") ? " err" : ""}`}
          aria-invalid={error("note") ? true : undefined}
          aria-describedby={error("note") ? `${id}-note-err` : `${id}-note-help`}
        />
        <ErrorText id={`${id}-note-err`} error={error("note")} />
        <span className="help" id={`${id}-note-help`}>
          {t("noteHelp")}
        </span>
      </div>
      <fieldset aria-describedby={`${id}-method-err`}>
        <legend className="lab">{t("method")}</legend>
        <label className="co-check">
          <input type="radio" name="method" value="pickup" className="chk acx-radio" />
          <span>{t("methods.pickup")}</span>
        </label>
        <label className="co-check">
          <input type="radio" name="method" value="store" className="chk acx-radio" />
          <span>{t("methods.store")}</span>
        </label>
        <ErrorText id={`${id}-method-err`} error={error("method")} />
      </fieldset>
      <span className="help">{t("refund")}</span>
      <span className="acx-ret-btns">
        <button type="submit" className="btn pri sm" disabled={pending}>
          {t("submit")}
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>
          {t("cancel")}
        </button>
      </span>
    </form>
  );
}
