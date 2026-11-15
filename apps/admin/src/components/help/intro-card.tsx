"use client";

// Thẻ giới thiệu tính năng mới (thiết kế mục 6): nhỏ, không chặn thao tác, tắt được. Đã tắt thì không
// hiện lại cho tài khoản này trên mọi thiết bị: trang chỉ dựng thẻ khi cờ `hint.<id>` chưa có. Bấm "Đã
// hiểu" ẩn thẻ ngay rồi mới ghi cờ; ghi không được thì lần sau thẻ hiện lại (không mất gì).
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { dismissHint } from "@/help/actions";
import type { HintId } from "@/help/flags";

export function IntroCard({ id }: { id: HintId }) {
  const t = useTranslations("help.intro");
  const [hidden, setHidden] = useState(false);
  const [, start] = useTransition();
  if (hidden) return null;
  return (
    <div className="intro" role="note" data-testid={`intro-${id}`}>
      <span className="intro-badge">{t("badge")}</span>
      <span>
        <b>{t(`${id}.title`)}</b> {t(`${id}.body`)}
      </span>
      <button
        type="button"
        className="btn sm"
        onClick={() => {
          setHidden(true);
          start(async () => {
            await dismissHint(id);
          });
        }}
      >
        {t("ok")}
      </button>
    </div>
  );
}
