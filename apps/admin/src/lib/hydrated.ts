"use client";

import { useSyncExternalStore } from "react";

// Trang quản trị dựng sẵn HTML ở máy chủ; nút bấm chỉ chạy khi JavaScript của trang đã gắn vào
// (hydration). Bấm sớm hơn thì form có `onSubmit` bị trình duyệt gửi kiểu thô (tải lại trang, giá trị
// lên thanh địa chỉ) và nút `onClick` không làm gì — người dùng tưởng đã lưu. Form và nút lưu đặt ngay
// trên trang (không nằm trong hộp thoại) khoá tới khi `useHydrated()` là `true`.

const subscribe = () => () => {};

/** `false` khi dựng ở máy chủ và lúc hydration; `true` từ lần dựng đầu tiên trên trình duyệt. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
