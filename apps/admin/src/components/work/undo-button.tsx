"use client";

import { FormAlert, useSubmit } from "@/components/ui/form";
import type { DialogState } from "@/components/ui/form-dialog";
import { useToast } from "@/components/ui/toast";

type Action = (state: DialogState, formData: FormData) => Promise<DialogState>;

/**
 * Thao tác đảo được một bấm (bỏ hoãn, bỏ ghim): xong thì báo kèm Hoàn tác. Action trả `undo` (ô gửi
 * cho action Hoàn tác, mặc định chính nó). Dòng chứa nút có thể biến mất sau thao tác, nên Hoàn tác
 * không dựa vào state của component này.
 */
export function UndoButton({
  action,
  undoAction = action,
  fields,
  label,
  ariaLabel,
  done,
  undo,
}: {
  action: Action;
  undoAction?: Action;
  fields: Record<string, string>;
  label: string;
  ariaLabel?: string;
  done: string;
  undo: { label: string; done: string };
}) {
  const toast = useToast();
  const [state, run, pending] = useSubmit(action, (next) => {
    const back = next.undo;
    toast(
      done,
      back
        ? {
            label: undo.label,
            run: async () => {
              const data = new FormData();
              for (const [name, value] of Object.entries(back)) data.set(name, value);
              const result = await undoAction({}, data);
              toast(result.done ? undo.done : (result.error ?? ""));
            },
          }
        : undefined,
    );
  });
  return (
    <form action={run} className="inline-form">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" className="btn sm" disabled={pending} aria-label={ariaLabel}>
        {label}
      </button>
      <FormAlert state={state} />
    </form>
  );
}
