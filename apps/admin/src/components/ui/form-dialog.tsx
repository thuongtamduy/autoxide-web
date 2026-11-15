"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import type { FormState } from "@/lib/form";
import { Dialog } from "./dialog";
import {
  CheckField,
  DialogButtons,
  Field,
  FormAlert,
  SelectField,
  TextareaField,
  useFocusInvalid,
  useSubmit,
} from "./form";
import { useToast } from "./toast";

/** Trạng thái của form trong hộp thoại: thêm ô gửi cho Hoàn tác và trang mở sau khi xong. */
export interface DialogState extends FormState {
  /** Ô gửi kèm cho action Hoàn tác (vd id của nút vừa tạo). Không có thì không hiện Hoàn tác. */
  undo?: Record<string, string>;
  /** Mở trang này sau khi xong (vd nút vừa tạo). */
  go?: string;
}

type Action = (state: DialogState, formData: FormData) => Promise<DialogState>;

interface Base {
  name: string;
  label: string;
  hint?: string | undefined;
}

/** Một ô của hộp thoại, mô tả bằng dữ liệu để trang (Server Component) truyền chữ đã dịch. */
export type FieldSpec =
  | (Base & {
      kind: "text" | "email" | "date" | "number";
      mono?: boolean;
      defaultValue?: string;
      placeholder?: string;
    })
  | (Base & {
      kind: "select";
      options: readonly { value: string; label: string }[];
      defaultValue?: string;
    })
  | (Base & { kind: "textarea"; defaultValue?: string })
  | (Base & { kind: "check" })
  | (Base & { kind: "checks"; options: readonly { value: string; label: string }[] })
  | { kind: "hidden"; name: string; value: string };

/**
 * Nút mở hộp thoại có form (Server Action): gom mọi lỗi của ô một lần, lỗi dưới từng ô, con trỏ về
 * ô sai đầu tiên. `points` nêu từng hệ quả khi thao tác không đảo được. Xong thì đóng và báo
 * `done`, kèm Hoàn tác khi action trả `undo` và có `undoAction`.
 */
export function FormDialog({
  action,
  fields,
  label,
  title,
  intro,
  points,
  submit,
  done,
  danger = false,
  triggerClass = "btn sm",
  undoAction,
  undoLabel,
  undoDone,
}: {
  action: Action;
  fields: readonly FieldSpec[];
  label: string;
  title: string;
  intro?: string;
  points?: readonly string[];
  submit: string;
  done: string;
  danger?: boolean;
  triggerClass?: string;
  undoAction?: Action;
  undoLabel?: string;
  undoDone?: string;
}) {
  return (
    <Dialog
      label={label}
      title={title}
      triggerClass={triggerClass}
      intro={
        intro || points?.length ? (
          <>
            {intro ? <p>{intro}</p> : null}
            {points?.length ? (
              <ul className="dlg-list">
                {points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : undefined
      }
    >
      {(close) => (
        <DialogForm
          action={action}
          fields={fields}
          submit={submit}
          done={done}
          danger={danger}
          close={close}
          undo={
            undoAction && undoLabel && undoDone
              ? { action: undoAction, label: undoLabel, done: undoDone }
              : undefined
          }
        />
      )}
    </Dialog>
  );
}

function DialogForm({
  action,
  fields,
  submit,
  done,
  danger,
  close,
  undo,
}: {
  action: Action;
  fields: readonly FieldSpec[];
  submit: string;
  done: string;
  danger: boolean;
  close: () => void;
  undo: { action: Action; label: string; done: string } | undefined;
}) {
  const toast = useToast();
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  // Báo ngay khi action trả về: nút mở hộp thoại có thể biến mất cùng bản ghi vừa đổi.
  const [state, run, pending] = useSubmit(action, (next) => {
    close();
    if (next.go) router.push(next.go);
    const fieldsForUndo = next.undo;
    toast(
      done,
      undo && fieldsForUndo
        ? {
            label: undo.label,
            run: async () => {
              const data = new FormData();
              for (const [name, value] of Object.entries(fieldsForUndo)) data.set(name, value);
              const back = await undo.action({}, data);
              toast(back.done ? undo.done : (back.error ?? ""));
            },
          }
        : undefined,
    );
  });
  useFocusInvalid(form, state);
  return (
    <form ref={form} action={run} noValidate className="dlg-form">
      {fields.map((field) => (
        <DialogField key={field.name} field={field} state={state} />
      ))}
      <FormAlert state={state} />
      <DialogButtons submit={submit} pending={pending} close={close} danger={danger} />
    </form>
  );
}

function DialogField({ field, state }: { field: FieldSpec; state: DialogState }) {
  if (field.kind === "hidden") {
    return <input type="hidden" name={field.name} value={field.value} />;
  }
  const error = state.fields?.[field.name];
  const value = state.values?.[field.name];
  if (field.kind === "select") {
    return (
      <SelectField
        // React đặt lại form sau mỗi lần gửi và ô chọn quay về lựa chọn đầu tiên; đổi `key` theo giá trị
        // vừa gửi để ô dựng lại với đúng lựa chọn khi báo lỗi (W-018).
        key={value ?? ""}
        label={field.label}
        name={field.name}
        options={field.options}
        hint={field.hint}
        defaultValue={value ?? field.defaultValue}
        error={error}
      />
    );
  }
  if (field.kind === "textarea") {
    return (
      <TextareaField
        label={field.label}
        name={field.name}
        hint={field.hint}
        defaultValue={value ?? field.defaultValue}
        error={error}
      />
    );
  }
  if (field.kind === "check" || field.kind === "checks") {
    const options = field.kind === "check" ? [{ value: "on", label: field.label }] : field.options;
    const chosen = new Set((value ?? "").split(",").filter(Boolean));
    return (
      <fieldset className="checks plain" aria-invalid={error ? true : undefined}>
        {field.kind === "checks" ? <legend className="lab">{field.label}</legend> : null}
        {options.map((option) => (
          <CheckField
            key={option.value}
            name={field.name}
            value={option.value}
            label={option.label}
            defaultChecked={chosen.has(option.value)}
            {...(field.kind === "check" && field.hint ? { hint: field.hint } : {})}
            aria-invalid={error ? true : undefined}
          />
        ))}
        {field.kind === "checks" && field.hint ? <span className="fhint">{field.hint}</span> : null}
        {error ? <span className="ferr">{error}</span> : null}
      </fieldset>
    );
  }
  return (
    <Field
      label={field.label}
      name={field.name}
      type={field.kind}
      autoComplete="off"
      mono={field.mono ?? false}
      hint={field.hint}
      placeholder={field.placeholder}
      defaultValue={value ?? field.defaultValue}
      error={error}
    />
  );
}

/**
 * Form nằm ngay trên trang (không trong hộp thoại), cùng cách báo lỗi như `FormDialog`: gom lỗi một
 * lần, lỗi dưới từng ô, con trỏ về ô sai đầu tiên; xong thì báo `done`.
 */
export function InlineForm({
  action,
  fields,
  submit,
  done,
  disabled = false,
}: {
  action: Action;
  fields: readonly FieldSpec[];
  submit: string;
  done: string;
  disabled?: boolean;
}) {
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useSubmit(action, () => toast(done));
  useFocusInvalid(form, state);
  return (
    <form ref={form} action={run} noValidate className="dlg-form cp-form">
      <fieldset className="cp-fields" disabled={disabled}>
        {fields.map((field) => (
          <DialogField key={field.name} field={field} state={state} />
        ))}
      </fieldset>
      <FormAlert state={state} />
      {disabled ? null : (
        <div className="dlg-acts">
          <button type="submit" className="btn pri" disabled={pending}>
            {submit}
          </button>
        </div>
      )}
    </form>
  );
}
