"use client";

import { useActionState, useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { DialogButtons, FormAlert, useSubmit } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { ChangeState } from "@/lib/engage";
import type { FormState } from "@/lib/form";

type ChangeAction = (state: ChangeState, formData: FormData) => Promise<ChangeState>;
type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export interface Move {
  /** Trạng thái mới gửi cho core. */
  value: string;
  label: string;
  /** Câu báo sau khi xong. */
  done: string;
  tone?: "pri" | "danger";
}

/**
 * Nút đổi trạng thái đảo được của một bản ghi (duyệt / ẩn bình luận, đánh dấu bài nộp, tạm dừng
 * chiến dịch…). Xong thì báo kèm Hoàn tác: bấm là gửi lại trạng thái cũ, cũng có kiểm phiên bản
 * (`expect` = `updated_at` core vừa trả). Dòng chứa nút có thể biến mất sau thao tác (bình luận
 * vừa duyệt rời hàng chờ), nên Hoàn tác không dựa vào state của component này.
 */
export function ChangeButtons({
  action,
  id,
  expect,
  moves,
  undo,
  small = true,
  extra = {},
}: {
  action: ChangeAction;
  id: string;
  expect: string;
  moves: readonly Move[];
  /** Ô gửi kèm khác (vd loại và id của đích bình luận). */
  extra?: Record<string, string>;
  /** Chữ của nút Hoàn tác và câu báo sau khi hoàn tác. */
  undo: { label: string; done: string };
  small?: boolean;
}) {
  const toast = useToast();
  const [state, setState] = useState<ChangeState>({});
  const [pending, start] = useTransition();
  const call = (status: string, version: string) => {
    const formData = new FormData();
    formData.set("id", id);
    formData.set("expect", version);
    formData.set("status", status);
    for (const [name, value] of Object.entries(extra)) formData.set(name, value);
    return action({}, formData);
  };
  const run = (move: Move) =>
    start(async () => {
      const next = await call(move.value, expect);
      setState(next);
      if (!next.done) return;
      const { previous, updated } = next;
      if (!previous || !updated || previous === move.value) {
        toast(move.done);
        return;
      }
      toast(move.done, {
        label: undo.label,
        run: async () => {
          const back = await call(previous, updated);
          toast(back.done ? undo.done : (back.error ?? ""));
        },
      });
    });
  return (
    <div className="eg-acts">
      {moves.map((move) => (
        <button
          key={move.value}
          type="button"
          className={`btn${small ? " sm" : ""}${move.tone ? ` ${move.tone}` : ""}`}
          disabled={pending}
          onClick={() => run(move)}
        >
          {move.label}
        </button>
      ))}
      {state.error ? <FormAlert state={state} /> : null}
    </div>
  );
}

/**
 * Thao tác cần hỏi lại (xoá, huỷ chiến dịch, gửi ngay): hộp thoại nêu từng hệ quả. `fields` là các
 * ô ẩn gửi kèm (id, phiên bản…). Server Action chuyển trang thì trang đích tự báo; không thì báo
 * `done` ngay khi xong (nút mở hộp thoại có thể biến mất cùng bản ghi).
 */
export function ConfirmButton({
  action,
  fields,
  label,
  title,
  points,
  submit,
  done,
  danger = true,
  small = true,
}: {
  action: Action;
  fields: Record<string, string>;
  label: string;
  title: string;
  points: readonly string[];
  submit: string;
  done?: string;
  danger?: boolean;
  small?: boolean;
}) {
  const size = small ? " sm" : "";
  return (
    <Dialog
      label={label}
      title={title}
      triggerClass={danger ? `btn${size} danger` : `btn${size}`}
      intro={
        <ul className="dlg-list">
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      }
    >
      {(close) =>
        done ? (
          <ConfirmNow
            action={action}
            fields={fields}
            submit={submit}
            done={done}
            close={close}
            danger={danger}
          />
        ) : (
          <ConfirmRedirect
            action={action}
            fields={fields}
            submit={submit}
            close={close}
            danger={danger}
          />
        )
      }
    </Dialog>
  );
}

function Hidden({ fields }: { fields: Record<string, string> }) {
  return (
    <>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

function ConfirmNow({
  action,
  fields,
  submit,
  done,
  close,
  danger,
}: {
  action: Action;
  fields: Record<string, string>;
  submit: string;
  done: string;
  close: () => void;
  danger: boolean;
}) {
  const toast = useToast();
  const [state, run, pending] = useSubmit(action, () => {
    close();
    toast(done);
  });
  return (
    <form action={run} className="dlg-form">
      <Hidden fields={fields} />
      <FormAlert state={state} />
      <DialogButtons submit={submit} pending={pending} close={close} danger={danger} />
    </form>
  );
}

function ConfirmRedirect({
  action,
  fields,
  submit,
  close,
  danger,
}: {
  action: Action;
  fields: Record<string, string>;
  submit: string;
  close: () => void;
  danger: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="dlg-form">
      <Hidden fields={fields} />
      <FormAlert state={state} />
      <DialogButtons submit={submit} pending={pending} close={close} danger={danger} />
    </form>
  );
}
