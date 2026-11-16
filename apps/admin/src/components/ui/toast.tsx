"use client";

import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from "react";
import { Icon } from "@/components/shell/icon";

// Thông báo nổi ngắn sau một thao tác ("Đã đổi mật khẩu"). Vùng `role="status"` luôn có mặt để
// trình đọc màn hình đọc câu mới; câu tự tắt sau vài giây. Thao tác đảo được (duyệt, ẩn một bình
// luận…) truyền `undo`: câu kèm nút Hoàn tác và sống lâu hơn (quy ước ui-design.md mục 5 của core).
export interface ToastUndo {
  /** Chữ của nút (đã dịch). */
  label: string;
  run: () => void;
}

type Say = (text: string, undo?: ToastUndo) => void;

const ToastContext = createContext<Say>(() => {});

export function useToast(): Say {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState("");
  const [undo, setUndo] = useState<ToastUndo | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const say = useCallback<Say>((next, withUndo) => {
    setText(next);
    setUndo(withUndo ?? null);
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => {
        setText("");
        setUndo(null);
      },
      withUndo ? 8000 : 4000,
    );
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
            {undo ? (
              <button
                type="button"
                className="toast-undo"
                onClick={() => {
                  setText("");
                  setUndo(null);
                  undo.run();
                }}
              >
                {undo.label}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </ToastContext>
  );
}
