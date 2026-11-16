import type { InputHTMLAttributes } from "react";
import { useId } from "react";
import { Input, Label } from "@/components/ui/input";

/** Ô nhập của trang công khai: nhãn, ô, lỗi ngay dưới ô (gắn bằng `aria-describedby`). */
export function PublicField({
  label,
  error,
  hint,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  error?: string | undefined;
  hint?: string | undefined;
}) {
  const id = useId();
  const described = [hint ? `${id}-hint` : "", error ? `${id}-err` : ""].filter(Boolean).join(" ");
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={described || undefined}
        className={error ? "border-danger" : undefined}
        {...input}
      />
      {hint ? (
        <span id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${id}-err`} className="text-sm text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** Câu báo lỗi chung của form (lỗi của core: `detail`, giữ `code` để rẽ nhánh và test). */
export function PublicAlert({
  error,
  code,
  reason,
}: {
  error?: string | undefined;
  code?: string | undefined;
  /** `reason` của Problem khi có (token trong link: `expired`, `used`, `unknown`). */
  reason?: string | undefined;
}) {
  if (!error) return null;
  return (
    <p role="alert" data-code={code} data-reason={reason} className="text-sm text-danger">
      {error}
    </p>
  );
}
