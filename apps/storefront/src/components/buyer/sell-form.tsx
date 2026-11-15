"use client";

import type { components } from "@autoxide/sdk";
import { useTranslations } from "next-intl";
import { useActionState, useRef, useState } from "react";
import { formToken } from "@/lib/antispam-actions";
import { type PublicFormState, submitPublicForm } from "@/lib/forms-actions";
import { applyToSell, type SellState } from "@/sample/sell-actions";
import { SampleMark } from "../sample-mark";
import { ErrorText, errorFor } from "./form-errors";

type PublicForm = components["schemas"]["PublicFormResponse"];

/**
 * Form "Đăng ký bán hàng". Khách có biểu mẫu `ban-tren-cho` trong core → dựng đúng các trường của biểu
 * mẫu và gửi tới module `forms` thật (token chống spam xin khi người đọc bắt đầu điền). Chưa có → form
 * mẫu bốn ô, chỉ kiểm, không lưu.
 */
export function SellForm({ locale, form }: { locale: string; form: PublicForm | null }) {
  return form ? <CoreForm locale={locale} form={form} /> : <SampleForm locale={locale} />;
}

function CoreForm({ locale, form }: { locale: string; form: PublicForm }) {
  const t = useTranslations("sellOn.form");
  const [state, action, pending] = useActionState<PublicFormState, FormData>(submitPublicForm, {
    status: "idle",
    message: "",
    fields: [],
  });
  const [token, setToken] = useState("");
  const asked = useRef(false);
  const askToken = () => {
    if (asked.current) return;
    asked.current = true;
    void formToken(form.token_scope, locale).then((value) => setToken(value ?? ""));
  };
  if (state.status === "ok") {
    return (
      <div className="card so-form pop" role="status">
        <b className="dsp">{t("sentTitle")}</b>
        <span>{state.message || form.success_message}</span>
      </div>
    );
  }
  const fieldError = (key: string) => state.fields.find((f) => f.field === key);
  return (
    <form className="card so-form" action={action} onFocus={askToken} noValidate>
      <b className="dsp so-form-h">{form.name}</b>
      <input type="hidden" name="form_key" value={form.key} />
      <input type="hidden" name="token_scope" value={form.token_scope} />
      <input type="hidden" name="form_token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      <input
        type="hidden"
        name="form_fields"
        value={JSON.stringify(form.fields.map((f) => ({ key: f.key, type: f.type })))}
      />
      <input
        className="trap"
        type="text"
        name="trap"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
      {form.status === "closed" ? <p className="errtxt">{t("closed")}</p> : null}
      {form.fields.map((field) => {
        const id = `so-${field.key}`;
        const name = `f_${field.key}`;
        const error = fieldError(field.key);
        const describe = error ? `${id}-err` : field.help ? `${id}-help` : undefined;
        if (field.type === "hidden") return null;
        const label = (
          <>
            {field.label}
            {field.required ? <span className="co-req">{t("required")}</span> : null}
          </>
        );
        let control: React.ReactNode;
        if (field.type === "textarea") {
          control = (
            <textarea
              id={id}
              name={name}
              rows={3}
              className="inp"
              placeholder={field.placeholder ?? undefined}
              maxLength={field.max_length ?? undefined}
              aria-invalid={error ? true : undefined}
              aria-describedby={describe}
            />
          );
        } else if (field.type === "select") {
          control = (
            <select
              id={id}
              name={name}
              className="sel"
              defaultValue=""
              aria-invalid={error ? true : undefined}
              aria-describedby={describe}
            >
              <option value="">{t("choose")}</option>
              {(field.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          );
        } else if (field.type === "radio" || field.type === "checkbox") {
          return (
            <fieldset className="so-set" key={field.key} aria-describedby={describe}>
              <legend className="lab">{label}</legend>
              {(field.options ?? []).map((o) => (
                <label className="co-check" key={o.value}>
                  <input type={field.type} name={name} value={o.value} className="chk" />
                  <span>{o.label}</span>
                </label>
              ))}
              {error ? (
                <span className="errtxt" id={`${id}-err`}>
                  {error.detail}
                </span>
              ) : null}
            </fieldset>
          );
        } else if (field.type === "consent") {
          return (
            <div className="co-field" key={field.key}>
              <label className="co-check">
                <input
                  type="checkbox"
                  name={name}
                  className="chk"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={describe}
                />
                <span>{label}</span>
              </label>
              {error ? (
                <span className="errtxt" id={`${id}-err`}>
                  {error.detail}
                </span>
              ) : null}
            </div>
          );
        } else {
          const type = field.type === "phone" ? "tel" : field.type === "text" ? "text" : field.type;
          control = (
            <input
              id={id}
              name={name}
              type={type}
              className="inp"
              placeholder={field.placeholder ?? undefined}
              maxLength={field.max_length ?? undefined}
              aria-invalid={error ? true : undefined}
              aria-describedby={describe}
            />
          );
        }
        return (
          <div className="co-field" key={field.key}>
            <label className="lab" htmlFor={id}>
              {label}
            </label>
            {control}
            {error ? (
              <span className="errtxt" id={`${id}-err`}>
                {error.detail}
              </span>
            ) : field.help ? (
              <span className="help" id={`${id}-help`}>
                {field.help}
              </span>
            ) : null}
          </div>
        );
      })}
      {state.status === "error" && state.message ? (
        <p className="errtxt" role="alert">
          {state.message}
        </p>
      ) : null}
      <button type="submit" className="btn pri" disabled={pending || form.status === "closed"}>
        {t("submit")}
      </button>
    </form>
  );
}

function SampleForm({ locale }: { locale: string }) {
  const t = useTranslations("sellOn.form");
  const [state, action, pending] = useActionState<SellState, FormData>(applyToSell, {
    status: "idle",
    errors: [],
    email: "",
  });
  const [kind, setKind] = useState("");
  if (state.status === "ok") {
    return (
      <div className="card so-form pop" role="status">
        <b className="dsp">{t("sentTitle")}</b>
        <span>{t("sampleSent", { email: state.email })}</span>
      </div>
    );
  }
  const error = (field: string) => errorFor(state.errors, field);
  return (
    <form className="card so-form" action={action} noValidate>
      <b className="dsp so-form-h">
        {t("title")}
        <SampleMark endpoint="POST /api/v1/forms/public/ban-tren-cho/submissions" step="46" />
      </b>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="kind" value={kind} />
      <div className="co-field">
        <label className="lab" htmlFor="so-email">
          {t("email")}
          <span className="co-req">{t("required")}</span>
        </label>
        <input
          id="so-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="ban@example.com"
          className={`inp${error("email") ? " err" : ""}`}
          defaultValue={state.email}
          aria-invalid={error("email") ? true : undefined}
          aria-describedby="so-email-err"
        />
        <ErrorText id="so-email-err" error={error("email")} />
      </div>
      <fieldset className="so-set" aria-describedby="so-kind-err">
        <legend className="lab">
          {t("kind")}
          <span className="co-req">{t("required")}</span>
        </legend>
        <div className="chiprow">
          {(["enterprise", "household", "individual"] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={`chip${kind === k ? " on" : ""}`}
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              {t(`kinds.${k}`)}
            </button>
          ))}
        </div>
        <ErrorText id="so-kind-err" error={error("kind")} />
      </fieldset>
      <div className="co-field">
        <label className="lab" htmlFor="so-category">
          {t("category")}
          <span className="co-req">{t("required")}</span>
        </label>
        <input
          id="so-category"
          name="category"
          className={`inp${error("category") ? " err" : ""}`}
          placeholder={t("categoryHint")}
          aria-invalid={error("category") ? true : undefined}
          aria-describedby="so-category-err"
        />
        <ErrorText id="so-category-err" error={error("category")} />
      </div>
      <label className="co-check">
        <input
          type="checkbox"
          name="consent"
          className="chk"
          aria-invalid={error("consent") ? true : undefined}
          aria-describedby="so-consent-err"
        />
        <span>{t("consent")}</span>
      </label>
      <ErrorText id="so-consent-err" error={error("consent")} />
      <button type="submit" className="btn pri" disabled={pending}>
        {t("submit")}
      </button>
      <span className="muted">{t("after")}</span>
    </form>
  );
}
