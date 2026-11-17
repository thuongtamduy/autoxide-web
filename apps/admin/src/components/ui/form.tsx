"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  type InputHTMLAttributes,
  type ReactNode,
  type RefObject,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import type { FormState } from "@/lib/form";

/** Một ô nhập có nhãn; lỗi (nếu có) nằm ngay dưới ô và được gắn với ô bằng `aria-describedby`. */
export function Field({
  label,
  error,
  hint,
  mono = false,
  money = false,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  error?: string | undefined;
  hint?: string | undefined;
  mono?: boolean;
  /** Ô tiền (đồng): hiện dấu phân cách nghìn khi gõ; gửi đi chỉ chữ số. */
  money?: boolean;
}) {
  const id = useId();
  const described = [hint ? `${id}-hint` : "", error ? `${id}-err` : ""].filter(Boolean).join(" ");
  return (
    <div className="fld">
      <label className="lab" htmlFor={id}>
        {label}
      </label>
      {money ? (
        <MoneyInput {...input} id={id} error={!!error} described={described || undefined} />
      ) : (
        <input
          id={id}
          className={mono ? "inp mono" : "inp"}
          aria-invalid={error ? true : undefined}
          aria-describedby={described || undefined}
          {...input}
        />
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

/**
 * Chỉ giữ chữ số khi chữ gõ là số nguyên có dấu phân cách nghìn đúng chỗ ("1.500.000", "1,500,000",
 * "1500000"). Chữ khác ("1.000,50", "3k") giữ nguyên để máy chủ báo lỗi, không tự đổi thành số khác.
 */
export function moneyDigits(text: string): string {
  const t = text.replace(/[\s₫đ]/g, "");
  if (/^\d*$/.test(t)) return t;
  if (/^\d{1,3}(\.\d{3})+$/.test(t) || /^\d{1,3}(,\d{3})+$/.test(t)) return t.replace(/[.,]/g, "");
  return text;
}

/**
 * Định dạng khi gõ: bỏ dấu phân cách nghìn của ngôn ngữ giao diện (dấu "." với tiếng Việt) rồi viết
 * lại, "1.5000" → "15.000". Chữ không phải số nguyên ("1.000,50") giữ nguyên.
 */
export function formatMoneyInput(text: string, locale: string): string {
  const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const group = fmt.formatToParts(1000).find((p) => p.type === "group")?.value ?? ",";
  const digits = text
    .replace(/[\s₫đ]/g, "")
    .split(group)
    .join("")
    .replace(/\u00a0/g, "");
  if (!/^\d+$/.test(digits)) return text;
  return fmt.format(Number(digits));
}

/**
 * Ô tiền: người dùng thấy "1.500.000", form gửi "1500000" qua ô ẩn cùng `name` — máy chủ nhận như cũ.
 */
function MoneyInput({
  id,
  error,
  described,
  name,
  defaultValue,
  value: _value,
  onChange,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  error: boolean;
  described: string | undefined;
}) {
  const locale = useLocale();
  const [text, setText] = useState(() =>
    formatMoneyInput(String(_value ?? defaultValue ?? ""), locale),
  );
  useEffect(() => {
    if (_value !== undefined) setText(formatMoneyInput(String(_value), locale));
  }, [_value, locale]);
  return (
    <>
      <input
        id={id}
        className={className ?? "inp num"}
        inputMode="numeric"
        autoComplete="off"
        aria-invalid={error || undefined}
        aria-describedby={described}
        value={text}
        onChange={(e) => {
          setText(formatMoneyInput(e.target.value, locale));
          onChange?.(e);
        }}
        {...rest}
      />
      <input type="hidden" name={name} value={moneyDigits(text)} />
    </>
  );
}

/**
 * Nhãn, gợi ý và lỗi quanh một ô (input, select, textarea): cùng cách gắn `aria-describedby`.
 * Dùng khi ô không phải `<input>` thường (ô số, ô ngày, select có state).
 */
export function Labelled({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: (id: string, aria: { "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
}) {
  const id = useId();
  const described = [hint ? `${id}-hint` : "", error ? `${id}-err` : ""].filter(Boolean).join(" ");
  return (
    <div className="fld">
      <label className="lab" htmlFor={id}>
        {label}
      </label>
      {children(id, {
        ...(error ? { "aria-invalid": true as const } : {}),
        ...(described ? { "aria-describedby": described } : {}),
      })}
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

/** Ô chọn một trong danh sách, cùng cách báo lỗi như `Field`. */
export function SelectField({
  label,
  error,
  hint,
  options,
  ...select
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  name: string;
  options: readonly { value: string; label: string }[];
  error?: string | undefined;
  hint?: string | undefined;
}) {
  return (
    <Labelled label={label} error={error} hint={hint}>
      {(id, aria) => (
        <select id={id} className="inp" {...aria} {...select}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Labelled>
  );
}

/** Ô nhập nhiều dòng, cùng cách báo lỗi như `Field`. */
export function TextareaField({
  label,
  error,
  hint,
  ...area
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  name: string;
  error?: string | undefined;
  hint?: string | undefined;
}) {
  return (
    <Labelled label={label} error={error} hint={hint}>
      {(id, aria) => <textarea id={id} className="inp area" rows={3} {...aria} {...area} />}
    </Labelled>
  );
}

/** Một ô bật / tắt có nhãn và câu giải thích (checkbox; gửi `on` khi bật). */
export function CheckField({
  label,
  hint,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: string }) {
  return (
    <label className="check">
      <input type="checkbox" {...input} />
      <span className="check-main">
        <span className="check-name">{label}</span>
        {hint ? <span className="check-desc">{hint}</span> : null}
      </span>
    </label>
  );
}

/** Câu báo chung của form: lỗi của core, hoặc "còn N ô cần sửa" khi lỗi nằm ở các ô. */
export function FormAlert({ state }: { state: FormState }) {
  const t = useTranslations("form");
  const count = Object.keys(state.fields ?? {}).length;
  if (!state.error && count === 0) return null;
  return (
    <p role="alert" className="falert" data-code={state.code}>
      {state.error ?? t("fix", { count })}
    </p>
  );
}

/** Gọi `onDone` mỗi khi form gửi thành công (`state.done` tăng). */
export function useOnDone(done: number | undefined, onDone: () => void) {
  const callback = useRef(onDone);
  callback.current = onDone;
  const last = useRef(done);
  useEffect(() => {
    if (done !== undefined && done !== last.current) {
      last.current = done;
      callback.current();
    }
  }, [done]);
}

/** Sau mỗi lần báo lỗi, đưa con trỏ về ô sai đầu tiên. */
export function useFocusInvalid(form: RefObject<HTMLFormElement | null>, state: FormState) {
  useEffect(() => {
    if (state.fields) {
      form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [form, state]);
}

/** Hàng nút cuối form: Huỷ (đóng hộp thoại) và nút gửi. */
export function DialogButtons({
  submit,
  pending,
  close,
  danger = false,
}: {
  submit: string;
  pending: boolean;
  close: () => void;
  danger?: boolean;
}) {
  const t = useTranslations("form");
  return (
    <div className="dlg-acts">
      <button type="button" className="btn" onClick={close}>
        {t("cancel")}
      </button>
      <button type="submit" className={danger ? "btn danger-solid" : "btn pri"} disabled={pending}>
        {submit}
      </button>
    </div>
  );
}

/**
 * Như `useActionState`, nhưng gọi `onDone` ngay khi Server Action trả về thành công. Dùng cho
 * nút nằm trên một dòng sẽ biến mất sau khi làm xong (gỡ passkey, đăng xuất một phiên): dòng bị
 * gỡ khỏi trang trước khi effect kịp chạy, nên không đợi effect để báo.
 */
export function useSubmit<S extends FormState>(
  run: (state: S, formData: FormData) => Promise<S>,
  onDone: (state: S) => void,
): [S, (formData: FormData) => void, boolean] {
  const [state, setState] = useState<S>({} as S);
  const [pending, startTransition] = useTransition();
  // Báo lỗi: lệnh cập nhật sau `await` phải nằm lại trong transition (React 19 không tự giữ transition
  // qua `await`). Nếu không, thông báo lỗi hiện ngay ở một lần vẽ, còn việc React tự đặt lại form sau
  // lần gửi đến ở lần vẽ sau: chữ người dùng gõ sửa trong khoảng giữa bị đè về giá trị cũ.
  // Thành công: báo ngay (`onDone` ngoài transition), không chờ trang làm mới xong.
  const submit = (formData: FormData) =>
    startTransition(async () => {
      const next = await run(state, formData);
      if (next.done) onDone(next);
      startTransition(() => setState(next));
    });
  return [state, submit, pending];
}
