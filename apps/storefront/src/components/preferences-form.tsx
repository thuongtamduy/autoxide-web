"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { savePreferences, type TokenActionState } from "@/lib/newsletter-actions";

/** Chọn danh sách nhận thư (trang tuỳ chọn mở từ link trong thư). */
export function PreferencesForm({
  token,
  locale,
  lists,
}: {
  token: string;
  locale: string;
  lists: {
    key: string;
    name: string;
    description: string;
    subscribed: boolean;
    status: string | null;
  }[];
}) {
  const t = useTranslations("newsletter");
  const [state, action, pending] = useActionState<TokenActionState, FormData>(savePreferences, {
    status: "idle",
    message: "",
  });
  return (
    <form action={action} className="pref-form">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      <fieldset className="pref-lists">
        <legend className="sr-only">{t("lists")}</legend>
        {lists.map((list) => (
          <label key={list.key} className="opt pref-opt">
            <input type="hidden" name="all_lists" value={list.key} />
            <input
              className="chk"
              type="checkbox"
              name="lists"
              value={list.key}
              defaultChecked={list.subscribed}
            />
            <span className="pref-text">
              <b>{list.name}</b>
              {list.description ? <span className="muted">{list.description}</span> : null}
              {list.status ? (
                <span className="muted">
                  {t("preferences.status", {
                    status: t(
                      `preferences.${list.status as "confirmed" | "unconfirmed" | "unsubscribed"}`,
                    ),
                  })}
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="pref-actions">
        <button className="btn pri" type="submit" name="intent" value="save" disabled={pending}>
          {t("preferences.save")}
        </button>
        <button className="btn" type="submit" name="intent" value="all" disabled={pending}>
          {t("preferences.all")}
        </button>
      </div>
      {state.status !== "idle" ? (
        <p
          className={state.status === "ok" ? "note-ok" : "errtxt"}
          role={state.status === "ok" ? "status" : "alert"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
