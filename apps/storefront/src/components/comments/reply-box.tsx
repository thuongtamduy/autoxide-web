"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { CommentForm, type CommentFormSettings } from "./comment-form";

/** Nút "Trả lời" mở ô trả lời ngay dưới bình luận. */
export function ReplyBox({
  locale,
  settings,
  parentId,
  name,
}: {
  locale: string;
  settings: CommentFormSettings;
  parentId: string;
  name: string;
}) {
  const t = useTranslations("comments");
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <div className="cm-reply-form">
        <CommentForm
          locale={locale}
          settings={settings}
          parentId={parentId}
          onDone={() => setOpen(false)}
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      className="btn ghost sm cm-reply"
      aria-label={t("replyTo", { name })}
      onClick={() => setOpen(true)}
    >
      {t("reply")}
    </button>
  );
}
