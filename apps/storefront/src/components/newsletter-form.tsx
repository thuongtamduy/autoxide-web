"use client";

import { useActionState, useRef, useState } from "react";
import { formToken } from "@/lib/antispam-actions";
import { type SubscribeState, subscribe } from "@/lib/newsletter-actions";

/**
 * Ô đăng ký bản tin (chân trang). Danh sách lấy từ core (`GET /newsletter/public/lists`); một danh
 * sách thì ẩn, nhiều thì hiện ô chọn. Token chống spam xin khi người đọc focus vào ô email.
 */
export function NewsletterForm({
  locale,
  lists,
  tokenScope,
  labels,
}: {
  locale: string;
  lists: { key: string; name: string; doubleOptIn: boolean }[];
  tokenScope: string;
  labels: { email: string; placeholder: string; submit: string; consent: string; lists: string };
}) {
  const [state, action, pending] = useActionState<SubscribeState, FormData>(subscribe, {
    status: "idle",
    message: "",
  });
  const [token, setToken] = useState("");
  const asked = useRef(false);
  const askToken = () => {
    if (asked.current) return;
    asked.current = true;
    void formToken(tokenScope, locale).then((value) => setToken(value ?? ""));
  };
  if (state.status === "ok") {
    return (
      <p className="nl-done pop" role="status">
        {state.message}
      </p>
    );
  }
  return (
    <form className="nl-form" action={action}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="form_token" value={token} />
      <input type="hidden" name="consent_text" value={labels.consent} />
      <input type="hidden" name="confirm" value={lists.some((l) => l.doubleOptIn) ? "1" : "0"} />
      {/* Bẫy cho máy: người thật không thấy ô này nên để trống. */}
      <input
        className="trap"
        type="text"
        name="trap"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
      {lists.length === 1 ? (
        <input type="hidden" name="lists" value={lists[0]?.key} />
      ) : (
        <fieldset className="nl-lists">
          <legend className="sr-only">{labels.lists}</legend>
          {lists.map((list, index) => (
            <label key={list.key}>
              <input
                className="chk"
                type="checkbox"
                name="lists"
                value={list.key}
                defaultChecked={index === 0}
              />
              {list.name}
            </label>
          ))}
        </fieldset>
      )}
      <div className="nl-row">
        <input
          className="inp"
          type="email"
          name="email"
          required
          maxLength={254}
          autoComplete="email"
          placeholder={labels.placeholder}
          aria-label={labels.email}
          onFocus={askToken}
        />
        <button className="btn pri" type="submit" disabled={pending}>
          {labels.submit}
        </button>
      </div>
      <p className="nl-consent">{labels.consent}</p>
      {state.status === "error" ? (
        <p className="nl-err" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
