"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import type { CodeStatus } from "@/sample/checkout";
import { applyCode, type CodeState, removeCode } from "@/sample/checkout-actions";

/**
 * Thẻ "Mã của bạn" ở giỏ: mã công khai đang chạy (áp bằng một nút, hay lý do chưa áp được) và ô nhập mã
 * khác. Lý do bị từ chối do máy chủ trả (`CodeState.reason`, như `rejected_codes[].reason` của báo giá
 * bước 45); giao diện chỉ dịch.
 */
export function CodeCard({
  locale,
  offer,
  current,
}: {
  locale: string;
  /** Mã công khai gợi ý (BEPMOC10) và tình trạng của nó với giỏ hiện tại. */
  offer: { code: string; title: string; terms: string; eligible: boolean };
  /** Mã đang dùng (cookie) và tình trạng với giỏ hiện tại. */
  current: { code: string; status: CodeStatus } | null;
}) {
  const t = useTranslations("cart.code");
  const [state, action, pending] = useActionState<CodeState, FormData>(applyCode, {
    status: "idle",
    reason: null,
    code: "",
  });
  const applied = current?.status === "applied" ? current.code : null;
  const reasonText = (reason: CodeState["reason"], code: string) =>
    reason === "empty"
      ? t("empty")
      : reason === "not_eligible"
        ? t("notEligible", { code })
        : t("unknown", { code });
  return (
    <section className="card co-codes" aria-labelledby="co-codes-h">
      <span className="co-codes-head">
        <b id="co-codes-h">{t("title")}</b>
        {applied ? (
          <form action={removeCode}>
            <button type="submit" className="lnk">
              {t("remove")}
            </button>
          </form>
        ) : null}
      </span>
      <div className={`co-offer${applied === offer.code ? " on" : ""}`}>
        <span className="co-offer-text">
          <span>
            <b className="num">{offer.code}</b> {offer.title}
          </span>
          <span className={offer.eligible ? "muted" : "co-offer-why"}>
            {offer.eligible ? offer.terms : t("needItems")}
          </span>
        </span>
        {applied === offer.code ? (
          <span className="badge b-ok">{t("inUse")}</span>
        ) : offer.eligible ? (
          <form action={action}>
            <input type="hidden" name="code" value={offer.code} />
            <button type="submit" className="btn sm pri" disabled={pending}>
              {t("apply")}
            </button>
          </form>
        ) : null}
      </div>
      {current && current.status !== "applied" ? (
        <span className="errtxt" role="status">
          {reasonText(current.status, current.code)}
        </span>
      ) : null}
      <form action={action} className="co-code-form" noValidate>
        <label className="lab" htmlFor="co-code">
          {t("other")}
        </label>
        <span className="co-code-row">
          <input
            id="co-code"
            name="code"
            className={`inp${state.status === "error" ? " err" : ""}`}
            maxLength={20}
            autoComplete="off"
            aria-invalid={state.status === "error"}
            aria-describedby={state.status === "error" ? "co-code-err" : undefined}
            defaultValue={state.status === "error" ? state.code : ""}
          />
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="btn" disabled={pending}>
            {t("apply")}
          </button>
        </span>
        {state.status === "error" ? (
          <span className="errtxt" id="co-code-err" role="alert">
            {reasonText(state.reason, state.code)}
          </span>
        ) : null}
        {state.status === "ok" ? (
          <span className="by-ok" role="status">
            {t("applied", { code: state.code })}
          </span>
        ) : null}
      </form>
    </section>
  );
}
