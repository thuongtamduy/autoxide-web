"use client";

import { useId } from "react";

/**
 * Một ô chữ có nhãn (một dòng hoặc nhiều dòng). Lỗi nằm ngay dưới ô và gắn với ô bằng
 * `aria-describedby`; `limit` hiện bộ đếm ký tự (gợi ý, core mới là nơi kiểm).
 */
export function TextField({
  label,
  name,
  value,
  onChange,
  error,
  hint,
  limit,
  multiline = false,
  rows = 3,
  mono = false,
  big = false,
  prefix,
  disabled = false,
  required = false,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  hint?: string | undefined;
  limit?: number;
  multiline?: boolean;
  rows?: number;
  mono?: boolean;
  big?: boolean;
  prefix?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const id = useId();
  const described = [hint ? `${id}-hint` : "", error ? `${id}-err` : ""].filter(Boolean).join(" ");
  const common = {
    id,
    name,
    value,
    disabled,
    required,
    className: ["inp", mono ? "mono" : "", big ? "ce-big" : "", multiline ? "ce-area" : ""]
      .filter(Boolean)
      .join(" "),
    "aria-invalid": error ? true : undefined,
    "aria-describedby": described || undefined,
  } as const;
  return (
    <div className="fld">
      <span className="ce-labrow">
        <label className="lab" htmlFor={id}>
          {label}
        </label>
        {limit ? (
          <span className={value.length > limit ? "ce-count over" : "ce-count"} aria-hidden="true">
            {value.length} / {limit}
          </span>
        ) : null}
      </span>
      {multiline ? (
        <textarea {...common} rows={rows} onChange={(event) => onChange(event.target.value)} />
      ) : prefix ? (
        <span className="ce-prefixed">
          <span className="mono ce-prefix">{prefix}</span>
          <input {...common} onChange={(event) => onChange(event.target.value)} />
        </span>
      ) : (
        <input {...common} onChange={(event) => onChange(event.target.value)} />
      )}
      {hint ? (
        <span id={`${id}-hint`} className="fhint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${id}-err`} className="ferr">
          {error}
        </span>
      ) : null}
    </div>
  );
}
