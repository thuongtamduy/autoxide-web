"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import { type SignInState, signIn } from "@/sample/account-actions";
import { SAMPLE_OTP, SAMPLE_PHONE } from "@/sample/orders";
import { Icon } from "../icon";
import { ErrorText, errorFor } from "./form-errors";

/**
 * Đăng nhập / tạo tài khoản người mua bằng số điện thoại và mã OTP — không có mật khẩu. Mẫu: mã cố định,
 * không gửi SMS, "đăng nhập" chỉ đặt cookie trên trình duyệt này (W-030).
 */
export function AccountGate({ locale, siteName }: { locale: string; siteName: string }) {
  const t = useTranslations("account.gate");
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {
    step: "phone",
    mode: "sign_in",
    masked: "",
    errors: [],
  });
  const kept = useRef({ phone: "", name: "", terms: false });
  const formRef = useRef<HTMLFormElement>(null);
  const step = state.mode === mode ? state.step : "phone";
  const errors = state.mode === mode ? state.errors : [];

  // Sau mỗi lần gửi: đặt con trỏ vào ô lỗi đầu tiên, hay ô nhập mã khi vừa sang bước mã.
  useEffect(() => {
    if (state.errors.length === 0 && state.step !== "otp") return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], #ac-otp')?.focus();
  }, [state]);

  const error = (field: string) => errorFor(errors, field);
  return (
    <div className="ac-gate">
      <div className="card ac-gate-card rise">
        <fieldset className="ac-tabs">
          <legend className="sr-only">{t("tabs")}</legend>
          {(["sign_in", "sign_up"] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={mode === key}
              className={`chip ac-tab${mode === key ? " on" : ""}`}
              onClick={() => setMode(key)}
            >
              {t(key)}
            </button>
          ))}
        </fieldset>
        <form
          ref={formRef}
          className="ac-form"
          noValidate
          action={(form) => {
            if (step === "phone") {
              kept.current = {
                phone: String(form.get("phone") ?? ""),
                name: String(form.get("name") ?? ""),
                terms: form.get("terms") === "on",
              };
            }
            return action(form);
          }}
        >
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="locale" value={locale} />
          <h1 className="dsp ac-title">
            {mode === "sign_in" ? t("signInTitle") : t("signUpTitle", { name: siteName })}
          </h1>
          {step === "phone" ? (
            <>
              {mode === "sign_up" ? (
                <div className="co-field">
                  <label className="lab" htmlFor="ac-name">
                    {t("name")}
                  </label>
                  <input
                    id="ac-name"
                    name="name"
                    className={`inp${error("name") ? " err" : ""}`}
                    autoComplete="name"
                    defaultValue={kept.current.name}
                    aria-invalid={error("name") ? true : undefined}
                    aria-describedby={error("name") ? "ac-name-err" : undefined}
                  />
                  <ErrorText id="ac-name-err" error={error("name")} />
                </div>
              ) : null}
              <div className="co-field">
                <label className="lab" htmlFor="ac-phone">
                  {t("phone")}
                </label>
                <input
                  id="ac-phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="09xx xxx xxx"
                  className={`inp${error("phone") ? " err" : ""}`}
                  defaultValue={kept.current.phone}
                  aria-invalid={error("phone") ? true : undefined}
                  aria-describedby={error("phone") ? "ac-phone-err" : "ac-phone-help"}
                />
                <ErrorText id="ac-phone-err" error={error("phone")} />
                <span className="help" id="ac-phone-help">
                  {t("phoneHelp")}
                </span>
              </div>
              {mode === "sign_up" ? (
                <>
                  <label className="co-check">
                    <input
                      type="checkbox"
                      className="chk"
                      name="terms"
                      defaultChecked={kept.current.terms}
                      aria-invalid={error("terms") ? true : undefined}
                      aria-describedby="ac-terms-err"
                    />
                    <span>{t("terms", { name: siteName })}</span>
                  </label>
                  <ErrorText id="ac-terms-err" error={error("terms")} />
                </>
              ) : null}
              <button type="submit" className="btn pri" disabled={pending}>
                {t("send")}
              </button>
            </>
          ) : (
            <>
              <input type="hidden" name="step" value="otp" />
              <input type="hidden" name="phone" value={kept.current.phone} />
              <input type="hidden" name="name" value={kept.current.name} />
              <p role="status">{t("sent", { phone: state.masked })}</p>
              <div className="co-field">
                <label className="lab" htmlFor="ac-otp">
                  {t("otp")}
                </label>
                <input
                  id="ac-otp"
                  name="otp"
                  className={`inp num lk-otp${error("otp") ? " err" : ""}`}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  aria-invalid={error("otp") ? true : undefined}
                  aria-describedby={error("otp") ? "ac-otp-err" : "ac-otp-help"}
                />
                <ErrorText id="ac-otp-err" error={error("otp")} />
                <span className="help" id="ac-otp-help">
                  {t("otpHelp", { code: SAMPLE_OTP })}
                </span>
              </div>
              <button type="submit" className="btn pri" disabled={pending}>
                {mode === "sign_in" ? t("signIn") : t("create")}
              </button>
            </>
          )}
          <span className="muted ac-try">
            {mode === "sign_in" ? t("trySignIn", { phone: SAMPLE_PHONE }) : t("trySignUp")}
          </span>
        </form>
      </div>
      <aside className="ac-why">
        <h2 className="dsp">{t("why.title")}</h2>
        <ul>
          <li>
            <Icon name="key" small />
            <span>{t("why.noPassword")}</span>
          </li>
          <li>
            <Icon name="shield" small />
            <span>{t("why.data", { name: siteName })}</span>
          </li>
          <li>
            <Icon name="search" small />
            <span>
              {t("why.guest")}{" "}
              <Link className="lnk" href={routes.orderLookup()}>
                {t("why.lookup")}
              </Link>
            </span>
          </li>
        </ul>
        <p className="muted ac-sample">{t("sample")}</p>
      </aside>
    </div>
  );
}
