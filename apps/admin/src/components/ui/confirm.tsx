"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/form";
import { Dialog } from "./dialog";
import { DialogButtons, FormAlert, useOnDone, useSubmit } from "./form";
import { useToast } from "./toast";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * Một thao tác trên một bản ghi (`id`) cần hỏi lại: hộp thoại nêu từng hệ quả, nút xác nhận,
 * xong thì báo `done`. Nhận Server Action và chữ đã dịch từ trang (Server Component).
 */
export function ConfirmAction({
  action,
  id,
  label,
  title,
  points,
  submit,
  done,
  danger = true,
}: {
  action: Action;
  id: string;
  label: string;
  title: string;
  points: readonly string[];
  submit: string;
  done: string;
  danger?: boolean;
}) {
  return (
    <Dialog
      label={label}
      title={title}
      triggerClass={danger ? "btn sm danger" : "btn sm"}
      intro={
        <ul className="dlg-list">
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      }
    >
      {(close) => (
        <ConfirmForm
          action={action}
          id={id}
          submit={submit}
          done={done}
          close={close}
          danger={danger}
        />
      )}
    </Dialog>
  );
}

function ConfirmForm({
  action,
  id,
  submit,
  done,
  close,
  danger,
}: {
  action: Action;
  id: string;
  submit: string;
  done: string;
  close: () => void;
  danger: boolean;
}) {
  const toast = useToast();
  // Nút mở hộp thoại thường biến mất sau thao tác (bản ghi đổi trạng thái): báo ngay khi xong.
  const [state, run, pending] = useSubmit(action, () => {
    close();
    toast(done);
  });
  return (
    <form action={run} className="dlg-form">
      <input type="hidden" name="id" value={id} />
      <FormAlert state={state} />
      <DialogButtons submit={submit} pending={pending} close={close} danger={danger} />
    </form>
  );
}

/** Thao tác một bấm không cần hỏi lại (vd gửi lại lời mời); lỗi hiện ngay dưới nút. */
export function InlineAction({
  action,
  id,
  label,
  done,
  ariaLabel,
}: {
  action: Action;
  id: string;
  label: string;
  done: string;
  ariaLabel?: string;
}) {
  const toast = useToast();
  const [state, run, pending] = useActionState(action, {});
  useOnDone(state.done, () => toast(done));
  return (
    <form action={run} className="inline-form">
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn sm" disabled={pending} aria-label={ariaLabel}>
        {label}
      </button>
      <FormAlert state={state} />
    </form>
  );
}
