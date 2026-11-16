"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { formToken } from "@/lib/antispam-actions";
import { type CommentState, postComment } from "@/lib/comments-actions";

export interface CommentFormSettings {
  targetType: string;
  targetId: string;
  tokenScope: string;
  maxLength: number;
  markdown: boolean;
  replyMails: boolean;
}

/**
 * Ô viết bình luận của khách (website chưa có đăng nhập cho người mua). Token chống spam xin khi
 * người đọc bắt đầu viết. Bình luận hiện ngay thì làm mới trang; chờ duyệt thì báo.
 */
export function CommentForm({
  locale,
  settings,
  parentId,
  onDone,
}: {
  locale: string;
  settings: CommentFormSettings;
  parentId?: string;
  onDone?: () => void;
}) {
  const t = useTranslations("comments");
  const router = useRouter();
  const [state, action, pending] = useActionState<CommentState, FormData>(postComment, {
    status: "idle",
    message: "",
  });
  const [token, setToken] = useState("");
  const asked = useRef(false);
  const askToken = () => {
    if (asked.current) return;
    asked.current = true;
    void formToken(settings.tokenScope, locale).then((value) => setToken(value ?? ""));
  };
  useEffect(() => {
    if (state.status === "published") {
      router.refresh();
    }
  }, [state.status, router]);
  if (state.status === "published" || state.status === "pending") {
    return (
      <p className="cm-done pop" role="status">
        {state.message}
        {onDone ? (
          <button type="button" className="btn ghost sm" onClick={onDone}>
            {t("cancel")}
          </button>
        ) : null}
      </p>
    );
  }
  const id = parentId ? `cm-${parentId}` : "cm-new";
  return (
    <form className="cm-form" action={action} onFocusCapture={askToken}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="target_type" value={settings.targetType} />
      <input type="hidden" name="target_id" value={settings.targetId} />
      <input type="hidden" name="token_scope" value={settings.tokenScope} />
      <input type="hidden" name="form_token" value={token} />
      <input type="hidden" name="format" value={settings.markdown ? "markdown" : "text"} />
      {parentId ? <input type="hidden" name="parent_id" value={parentId} /> : null}
      <input
        className="trap"
        type="text"
        name="trap"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
      <label className="lab" htmlFor={`${id}-body`}>
        {t("label")}
      </label>
      <textarea
        id={`${id}-body`}
        className="inp cm-body"
        name="body"
        rows={parentId ? 3 : 4}
        required
        maxLength={settings.maxLength}
        placeholder={t("placeholder")}
      />
      {settings.markdown ? <span className="help">{t("markdown")}</span> : null}
      <div className="cm-fields">
        <label className="cm-field">
          <span className="lab">{t("name")}</span>
          <input className="inp" name="author_name" required maxLength={100} autoComplete="name" />
        </label>
        {settings.replyMails ? (
          <label className="cm-field">
            <span className="lab">{t("email")}</span>
            <input className="inp" type="email" name="email" maxLength={254} autoComplete="email" />
          </label>
        ) : null}
      </div>
      {settings.replyMails ? (
        <label className="cm-check">
          <input className="chk" type="checkbox" name="notify" />
          {t("notify")}
        </label>
      ) : null}
      {state.status === "error" ? (
        <p className="errtxt" role="alert">
          {state.message}
        </p>
      ) : null}
      <span className="cm-actions">
        <span className="help">{t("moderated")}</span>
        {onDone ? (
          <button type="button" className="btn ghost" onClick={onDone}>
            {t("cancel")}
          </button>
        ) : null}
        <button className="btn pri" type="submit" disabled={pending}>
          {t("submit")}
        </button>
      </span>
    </form>
  );
}
