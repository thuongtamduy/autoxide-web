"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import { type LookupState, lookupOrder } from "@/sample/lookup-actions";
import { LOOKUP_ATTEMPTS, SAMPLE_OTP, SAMPLE_PHONE } from "@/sample/orders";
import { Icon } from "../icon";
import { ErrorText, errorFor } from "./form-errors";
import { OrderView } from "./order-view";

/**
 * Tra cứu đơn không cần tài khoản: mã đơn + số điện thoại → mã xác nhận (OTP) → xem đơn. Ba bước trong
 * một form, mỗi bước một Server Action; lỗi hiện dưới từng ô.
 */
export function LookupForm({ locale, siteName }: { locale: string; siteName: string }) {
  const t = useTranslations("lookup");
  const [state, action, pending] = useActionState<LookupState, FormData>(lookupOrder, {
    step: "form",
    masked: "",
    errors: [],
    attempts: LOOKUP_ATTEMPTS,
    order: null,
  });
  const otpRef = useRef<HTMLInputElement>(null);
  // Giữ mã đơn và số điện thoại đã nhập qua các bước (form bước 2 gửi lại cùng giá trị).
  const kept = useRef({ number: "", phone: "" });

  // Sau mỗi lần gửi: ô lỗi đầu tiên, hay ô nhập mã khi vừa sang bước mã, nhận con trỏ.
  useEffect(() => {
    const invalid = state.errors.length > 0;
    if (!invalid && state.step === "otp") otpRef.current?.focus();
    if (invalid) document.querySelector<HTMLElement>('.lk-form [aria-invalid="true"]')?.focus();
  }, [state]);

  if (state.step === "order" && state.order) {
    return (
      <div className="lk-result rise">
        <div className="card lk-card">
          <OrderView order={state.order} locale={locale} siteName={siteName} />
        </div>
        <div className="card lk-save">
          <Icon name="key" />
          <span>
            <b>{t("save.title")}</b>
            <span className="muted">{t("save.text")}</span>
          </span>
          <Link className="btn pri" href={routes.account()}>
            {t("save.cta")}
          </Link>
        </div>
        <p className="muted lk-privacy">{t("privacy")}</p>
      </div>
    );
  }

  const errorNumber = errorFor(state.errors, "number");
  const errorPhone = errorFor(state.errors, "phone");
  const errorOtp = errorFor(state.errors, "otp");
  return (
    <form
      className="card lk-form rise"
      action={(form) => {
        if (state.step === "form") {
          kept.current = {
            number: String(form.get("number") ?? ""),
            phone: String(form.get("phone") ?? ""),
          };
        }
        return action(form);
      }}
      noValidate
    >
      <input type="hidden" name="locale" value={locale} />
      {state.step === "form" ? (
        <>
          <div className="co-field">
            <label className="lab" htmlFor="lk-number">
              {t("number")}
            </label>
            <input
              id="lk-number"
              name="number"
              className={`inp num${errorNumber ? " err" : ""}`}
              placeholder="BM-2611-0424"
              autoComplete="off"
              autoCapitalize="characters"
              defaultValue={kept.current.number}
              aria-invalid={errorNumber ? true : undefined}
              aria-describedby={errorNumber ? "lk-number-err" : "lk-number-help"}
            />
            <ErrorText id="lk-number-err" error={errorNumber} />
            <span className="help" id="lk-number-help">
              {t("numberHelp")}
            </span>
          </div>
          <div className="co-field">
            <label className="lab" htmlFor="lk-phone">
              {t("phone")}
            </label>
            <input
              id="lk-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className={`inp${errorPhone ? " err" : ""}`}
              placeholder="09xx xxx xxx"
              defaultValue={kept.current.phone}
              aria-invalid={errorPhone ? true : undefined}
              aria-describedby={errorPhone ? "lk-phone-err" : undefined}
            />
            <ErrorText id="lk-phone-err" error={errorPhone} />
          </div>
          <button type="submit" className="btn pri" disabled={pending}>
            {t("send")}
          </button>
          <span className="muted lk-try">
            {t("try", { number: "BM-2611-0424", phone: SAMPLE_PHONE })}
          </span>
        </>
      ) : (
        <>
          <input type="hidden" name="step" value="otp" />
          <input type="hidden" name="number" value={kept.current.number} />
          <input type="hidden" name="phone" value={kept.current.phone} />
          <p role="status">{t("sent", { phone: state.masked })}</p>
          <div className="co-field">
            <label className="lab" htmlFor="lk-otp">
              {t("otp")}
            </label>
            <input
              ref={otpRef}
              id="lk-otp"
              name="otp"
              className={`inp num lk-otp${errorOtp ? " err" : ""}`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              aria-invalid={errorOtp ? true : undefined}
              aria-describedby={errorOtp ? "lk-otp-err" : "lk-otp-help"}
            />
            <ErrorText id="lk-otp-err" error={errorOtp} />
            <span className="help" id="lk-otp-help">
              {t("otpHelp", { code: SAMPLE_OTP })}
            </span>
          </div>
          <div className="lk-btns">
            <button type="submit" className="btn pri" disabled={pending || state.attempts === 0}>
              {t("view")}
            </button>
            <button type="button" className="btn ghost" onClick={() => window.location.reload()}>
              {t("again")}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
