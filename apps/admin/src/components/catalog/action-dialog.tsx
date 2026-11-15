"use client";

import { Fragment, type ReactNode, useActionState, useRef } from "react";
import { Dialog } from "@/components/ui/dialog";
import { DialogButtons, FormAlert, useFocusInvalid, useOnDone } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { FormState } from "@/lib/form";

type Action<S> = (state: S, formData: FormData) => Promise<S>;

/**
 * Số lần form nhận kết quả mới. Dùng làm `key` cho phần ô: React đặt lại form sau mỗi lần gửi về
 * giá trị mặc định lúc gắn, mà `<select>` không nhận `defaultValue` mới; dựng lại phần ô để mọi ô
 * (cả ô chọn) điền lại đúng giá trị vừa gửi khi báo lỗi.
 */
function useRound(state: unknown): number {
  const round = useRef(0);
  const last = useRef(state);
  if (last.current !== state) {
    last.current = state;
    round.current += 1;
  }
  return round.current;
}

/**
 * Nút mở hộp thoại có một form gửi bằng Server Action — khuôn chung của các hộp thoại ở hai màn
 * Sản phẩm và Tồn kho (tạo sản phẩm, thêm dòng giá, điều chỉnh tồn…): gom mọi lỗi của ô, đưa con
 * trỏ về ô sai đầu tiên, xong thì đóng và báo `done`. `children` nhận trạng thái để hiện lỗi dưới
 * ô và điền lại giá trị vừa gửi.
 */
export function ActionDialog<S extends FormState>({
  label,
  title,
  intro,
  triggerClass = "btn sm",
  action,
  hidden = {},
  submit,
  done,
  danger = false,
  children,
}: {
  label: string;
  title: string;
  intro?: ReactNode;
  triggerClass?: string;
  action: Action<S>;
  hidden?: Record<string, string>;
  submit: string;
  done: string | ((state: S) => string);
  danger?: boolean;
  children: (state: S) => ReactNode;
}) {
  return (
    <Dialog label={label} title={title} intro={intro} triggerClass={triggerClass}>
      {(close) => (
        <DialogForm
          action={action}
          hidden={hidden}
          submit={submit}
          done={done}
          close={close}
          danger={danger}
        >
          {children}
        </DialogForm>
      )}
    </Dialog>
  );
}

function DialogForm<S extends FormState>({
  action,
  hidden,
  submit,
  done,
  close,
  danger,
  children,
}: {
  action: Action<S>;
  hidden: Record<string, string>;
  submit: string;
  done: string | ((state: S) => string);
  close: () => void;
  danger: boolean;
  children: (state: S) => ReactNode;
}) {
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  // Báo xong ngay khi Server Action trả về, không đợi effect: nút mở hộp thoại có thể nằm trên một
  // dòng biến mất sau thao tác (vd hồ sơ chuyển từ "chờ nộp" sang "đã nộp"), effect sẽ không kịp chạy.
  const report = async (previous: S, formData: FormData): Promise<S> => {
    const next = await action(previous, formData);
    if (next.done && next.done !== previous.done) {
      close();
      toast(typeof done === "string" ? done : done(next));
    }
    return next;
  };
  const [current, run, pending] = useActionState(
    report as unknown as (state: Awaited<S>, formData: FormData) => Promise<Awaited<S>>,
    {} as Awaited<S>,
  );
  // `S` là kiểu trạng thái của từng form (không phải Promise): `Awaited<S>` chính là `S`.
  const state = current as S;
  const round = useRound(state);
  useFocusInvalid(form, state);
  return (
    <form ref={form} action={run} noValidate className="dlg-form">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Fragment key={round}>{children(state)}</Fragment>
      <FormAlert state={state} />
      <DialogButtons submit={submit} pending={pending} close={close} danger={danger} />
    </form>
  );
}

/** Form đặt ngay trên trang (không trong hộp thoại), cùng cách báo lỗi và báo xong. */
export function ActionForm<S extends FormState>({
  action,
  hidden = {},
  submit,
  done,
  className = "card padded dlg-form",
  children,
  footer,
}: {
  action: Action<S>;
  hidden?: Record<string, string>;
  submit: string;
  done?: string | ((state: S) => string);
  className?: string;
  children: (state: S) => ReactNode;
  /** Phần hiện sau nút gửi (vd kết quả của lần gửi). */
  footer?: (state: S) => ReactNode;
}) {
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [current, run, pending] = useActionState(
    action as unknown as (state: Awaited<S>, formData: FormData) => Promise<Awaited<S>>,
    {} as Awaited<S>,
  );
  // `S` là kiểu trạng thái của từng form (không phải Promise): `Awaited<S>` chính là `S`.
  const state = current as S;
  const round = useRound(state);
  useFocusInvalid(form, state);
  useOnDone(state.done, () => {
    if (done) toast(typeof done === "string" ? done : done(state));
  });
  return (
    <form ref={form} action={run} noValidate className={className}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Fragment key={round}>{children(state)}</Fragment>
      <div className="role-foot">
        <FormAlert state={state} />
        <button type="submit" className="btn pri" disabled={pending}>
          {submit}
        </button>
      </div>
      {footer ? footer(state) : null}
    </form>
  );
}
