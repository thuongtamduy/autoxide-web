"use client";

import { useTranslations } from "next-intl";

// Lỗi khi dựng trang (thường là core không trả lời). Đầu trang và chân trang vẫn còn; người đọc
// thử lại được.
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("errors");
  return (
    <main id="main" className="wrap page-msg">
      <h1 className="dsp">{t("title")}</h1>
      <p className="muted">{t("body")}</p>
      <button type="button" className="btn pri" onClick={reset}>
        {t("retry")}
      </button>
    </main>
  );
}
