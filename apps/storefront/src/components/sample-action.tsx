"use client";

import { useState } from "react";
import { Icon, type IconName } from "./icon";

/**
 * Nút của việc core chưa có API (nhắc khi flash sale bắt đầu, báo vi phạm…): bấm thì đổi sang trạng
 * thái đã làm và báo bằng thông báo nổi nói rõ đây là bản mẫu. Thay bằng Server Action gọi endpoint
 * thật khi core có (comment ở chỗ dùng ghi endpoint).
 */
export function SampleAction({
  label,
  doneLabel,
  message,
  icon,
  className = "btn sm",
}: {
  label: string;
  doneLabel: string;
  message: string;
  icon?: IconName;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  const [toast, setToast] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        aria-pressed={done}
        onClick={() => {
          setDone(!done);
          if (!done) {
            setToast(true);
            window.setTimeout(() => setToast(false), 2800);
          }
        }}
      >
        {icon ? <Icon name={done ? "check" : icon} small /> : null}
        {done ? doneLabel : label}
      </button>
      {toast ? (
        <div className="toast" role="status">
          <Icon name="info" />
          {message}
        </div>
      ) : null}
    </>
  );
}
