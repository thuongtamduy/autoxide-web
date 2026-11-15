"use client";

import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from "react";
import { Icon } from "@/components/shell/icon";

// Thông báo nổi ngắn sau một thao tác ("Đã đổi mật khẩu"). Vùng `role="status"` luôn có mặt để
// trình đọc màn hình đọc câu mới; câu tự tắt sau vài giây.
const ToastContext = createContext<(text: string) => void>(() => {});

export function useToast(): (text: string) => void {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const say = useCallback((next: string) => {
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(""), 4000);
  }, []);
  return (
    <ToastContext value={say}>
      {children}
      <div className="toast" role="status" aria-live="polite" data-open={text ? "" : undefined}>
        {text ? (
          <>
            <span className="toast-ok">
              <Icon name="check" />
            </span>
            <span>{text}</span>
          </>
        ) : null}
      </div>
    </ToastContext>
  );
}
