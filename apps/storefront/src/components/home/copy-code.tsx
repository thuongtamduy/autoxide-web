"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Icon } from "../icon";

/** Nút "Sao chép mã": ghi mã vào bộ nhớ tạm, báo bằng thông báo nổi. */
export function CopyCode({ code }: { code: string }) {
  const t = useTranslations("home.coupon");
  const [toast, setToast] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Trình duyệt chặn bộ nhớ tạm (trang không an toàn): mã vẫn hiện trên nút để chép tay.
    }
    setToast(true);
    window.setTimeout(() => setToast(false), 2600);
  };
  return (
    <>
      <button type="button" className="btn coupon-btn" onClick={copy}>
        <Icon name="copy" small />
        {t("copy")}
        <span className="coupon-code">{code}</span>
      </button>
      {toast ? (
        <div className="toast" role="status">
          <Icon name="check" />
          {t("copied", { code })}
        </div>
      ) : null}
    </>
  );
}
