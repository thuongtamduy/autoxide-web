"use client";

import { useActionState } from "react";
import type { ActionState as State } from "@/lib/action-state";

/**
 * Trang mở từ link trong thư: chỉ làm việc khi người đọc bấm nút (trình quét link của hộp thư mở
 * link trước người đọc, không được tự xác nhận hay huỷ thay họ). Kết quả là câu của máy chủ.
 */
export function TokenAction({
  action,
  token,
  locale,
  intent,
  button,
}: {
  action: (state: State, form: FormData) => Promise<State>;
  token: string;
  locale: string;
  intent?: string;
  button: string;
}) {
  const [state, run, pending] = useActionState<State, FormData>(action, {
    status: "idle",
    message: "",
  });
  if (state.status === "ok") {
    return (
      <p className="note-ok pop" role="status">
        {state.message}
      </p>
    );
  }
  return (
    <form action={run} className="token-form">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      {intent ? <input type="hidden" name="intent" value={intent} /> : null}
      <button className="btn pri" type="submit" disabled={pending}>
        {button}
      </button>
      {state.status === "error" ? (
        <p className="errtxt" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
