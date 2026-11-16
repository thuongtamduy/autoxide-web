"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

/** Nút chép một đoạn chữ vào bộ nhớ tạm; báo đã chép (hay không chép được) ngay cạnh nút. */
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const t = useTranslations("settings.secret");
  const [copied, setCopied] = useState<"" | "ok" | "failed">("");
  return (
    <span className="copy">
      <button
        type="button"
        className="btn sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied("ok");
          } catch {
            setCopied("failed");
          }
        }}
      >
        {label ?? t("copy")}
      </button>
      <span role="status" className="fhint">
        {copied === "ok" ? t("copied") : copied === "failed" ? t("copyFailed") : ""}
      </span>
    </span>
  );
}

/**
 * Một secret core chỉ trả một lần (khoá API, secret ký webhook): hiện kèm nút chép và lời dặn.
 * Giá trị nằm trong bộ nhớ của trang này; đóng hộp thoại hay rời trang là mất.
 */
export function SecretOnce({ value, label, note }: { value: string; label: string; note: string }) {
  const t = useTranslations("settings.secret");
  return (
    <div className="dlg-form">
      <p className="note warn">{note}</p>
      <div className="fld">
        <span className="lab">{label}</span>
        <code className="secret mono" data-testid="secret">
          {value}
        </code>
      </div>
      <CopyButton text={value} label={t("copy")} />
    </div>
  );
}
