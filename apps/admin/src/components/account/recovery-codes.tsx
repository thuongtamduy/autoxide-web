"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * Mười mã khôi phục, chỉ hiện một lần: chép hay tải về thành file văn bản. Mã nằm trong bộ nhớ
 * của trang này; đóng hộp thoại là mất, core không cho xem lại.
 */
export function RecoveryCodes({ codes, close }: { codes: string[]; close: () => void }) {
  const t = useTranslations("account.codes");
  const [copied, setCopied] = useState<"" | "ok" | "failed">("");
  const text = `${codes.join("\n")}\n`;
  return (
    <div className="dlg-form">
      <p className="note warn">{t("once")}</p>
      <ol className="codes mono" aria-label={t("label")}>
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className="dlg-acts">
        <button
          type="button"
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied("ok");
            } catch {
              setCopied("failed");
            }
          }}
        >
          {t("copy")}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = "autoxide-recovery-codes.txt";
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          {t("download")}
        </button>
        <button type="button" className="btn pri" onClick={close}>
          {t("stored")}
        </button>
      </div>
      <p role="status" className="fhint">
        {copied === "ok" ? t("copied") : copied === "failed" ? t("copyFailed") : ""}
      </p>
    </div>
  );
}
