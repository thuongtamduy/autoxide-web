"use client";

import { useState, useTransition } from "react";
import { addToCart } from "@/sample/actions";
import { Icon } from "./icon";

/**
 * Nút "Thêm" vào giỏ (giỏ mẫu, cookie). Sau khi thêm, báo bằng một thông báo nổi `role="status"`
 * (trình đọc màn hình đọc lên); số trên biểu tượng giỏ ở đầu trang tự cập nhật vì action đổi cookie.
 */
export function AddToCart({
  skus,
  label,
  done,
  children,
  className = "btn sm pri",
}: {
  skus: string[];
  /** `aria-label` của nút (vd "Thêm Chảo gang vào giỏ"). */
  label: string;
  /** Câu báo sau khi thêm. */
  done: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [toast, setToast] = useState("");
  const add = () =>
    start(async () => {
      const count = await addToCart(skus);
      if (count !== null) {
        setToast(done);
        window.setTimeout(() => setToast(""), 2600);
      }
    });
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={label}
        disabled={pending}
        onClick={add}
      >
        <Icon name="plus" small />
        {children}
      </button>
      {toast ? (
        <div className="toast" role="status">
          <Icon name="check" />
          {toast}
        </div>
      ) : null}
    </>
  );
}
