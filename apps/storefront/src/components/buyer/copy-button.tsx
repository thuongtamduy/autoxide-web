"use client";

import { useState } from "react";
import { Icon } from "../icon";

/** Nút "Sao chép" cạnh một giá trị (số tài khoản, nội dung chuyển khoản, link giới thiệu). */
export function CopyButton({
  value,
  label,
  done,
  children,
}: {
  value: string;
  /** `aria-label` của nút. */
  label: string;
  /** Câu báo sau khi chép. */
  done: string;
  children: React.ReactNode;
}) {
  const [toast, setToast] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Trình duyệt chặn bộ nhớ tạm: giá trị vẫn hiện cạnh nút để chép tay.
    }
    setToast(true);
    window.setTimeout(() => setToast(false), 2600);
  };
  return (
    <>
      <button type="button" className="btn sm" aria-label={label} onClick={copy}>
        <Icon name="copy" small />
        {children}
      </button>
      {toast ? (
        <div className="toast" role="status">
          <Icon name="check" />
          {done}
        </div>
      ) : null}
    </>
  );
}
