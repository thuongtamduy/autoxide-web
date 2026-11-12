"use client";

import { useTranslations } from "next-intl";
import { MessagePanel } from "@/components/message-panel";
import { Button } from "@/components/ui/button";

// Lỗi không lường trước khi render (vd core không trả lời). Chi tiết lỗi chỉ có trong log
// của máy chủ; trình duyệt chỉ nhận câu chung.
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("errors");
  return (
    <MessagePanel title={t("failedTitle")} message={t("failed")}>
      <Button variant="outline" onClick={reset}>
        {t("retry")}
      </Button>
    </MessagePanel>
  );
}
