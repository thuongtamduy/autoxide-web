"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { Icon } from "@/components/shell/icon";
import { cn } from "@/lib/cn";
import type { BulkInput, BulkResult } from "@/lib/table";
import { useToast } from "./toast";

/**
 * Một nút của thanh hàng loạt. Đúng một trong `run` (Server Action nhận danh sách id), `href` (mở
 * địa chỉ kèm `?ids=`, vd in phiếu, xuất CSV) hoặc `copy` (chép chữ của các dòng đã chọn).
 */
export interface BulkActionSpec {
  key: string;
  label: string;
  tone?: "pri" | "danger";
  run?: (input: BulkInput) => Promise<BulkResult>;
  /** Hoàn tác: nhận `undo` của kết quả (id đã đổi). */
  undo?: (ids: string[]) => Promise<BulkResult>;
  href?: string;
  /** Tải tệp (`download`) thay vì chuyển trang. */
  download?: boolean;
  copy?: boolean;
  /** Hỏi lại trước khi chạy: tiêu đề, các hệ quả, chữ của nút xác nhận. */
  confirm?: { title: string; points?: readonly string[]; submit: string };
  /** Một ô người dùng chọn (có `options`) hay gõ, gửi đi thành `value`. */
  field?: { label: string; options?: readonly { value: string; label: string }[] };
}

interface Selection {
  ids: readonly string[];
  selected: ReadonlySet<string>;
  toggle: (id: string, on: boolean, range: boolean) => void;
  setAll: (on: boolean) => void;
  /** Tên dễ đọc của từng dòng (do `SelectTd` ghi), để câu lỗi chỉ đúng dòng như người xem thấy. */
  names: Map<string, string>;
}

const SelectionContext = createContext<Selection | null>(null);

function useSelection(): Selection {
  const value = useContext(SelectionContext);
  if (!value) throw new Error("SelectAllTh / SelectTd phải nằm trong BulkTable");
  return value;
}

/**
 * Bảng có chọn nhiều (như IndexTable của Shopify Polaris): ô chọn mỗi dòng (`SelectTd`), ô chọn cả
 * trang ở tiêu đề (`SelectAllTh`, lửng khi chọn một phần), Shift + bấm chọn một dải. Khi có dòng được
 * chọn, thanh dính ở đáy màn hiện "Đã chọn N", các nút hàng loạt và "Bỏ chọn" (Esc cũng bỏ chọn).
 * Lỗi của từng dòng gom lại: "Xong 8/10, 2 lỗi"; dòng hỏng vẫn được chọn để làm lại.
 *
 * `ids`: id các dòng trên trang theo thứ tự hiện. `texts`: chữ để chép (thao tác `copy`).
 * `matching`: tổng số dòng khớp bộ lọc và bộ lọc dạng chuỗi, để chọn cả những dòng ngoài trang.
 */
export function BulkTable({
  ids,
  actions,
  texts = {},
  matching,
  children,
}: {
  ids: readonly string[];
  actions: readonly BulkActionSpec[];
  texts?: Readonly<Record<string, string>>;
  matching?: { count: number; query: string } | undefined;
  children: ReactNode;
}) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const names = useRef(new Map<string, string>()).current;
  // Chỉ giữ id còn trên trang (trang làm mới sau thao tác, dòng có thể đã rời bộ lọc).
  const selected = new Set(ids.filter((id) => chosen.has(id)));
  const toggle = (id: string, on: boolean, range: boolean) => {
    const next = new Set(selected);
    const from = anchor.current ? ids.indexOf(anchor.current) : -1;
    const to = ids.indexOf(id);
    if (range && from >= 0 && to >= 0) {
      const [a, b] = from < to ? [from, to] : [to, from];
      for (const each of ids.slice(a, b + 1)) {
        if (on) next.add(each);
        else next.delete(each);
      }
    } else if (on) next.add(id);
    else next.delete(id);
    anchor.current = id;
    setChosen(next);
  };
  const setAll = (on: boolean) => setChosen(on ? new Set(ids) : new Set());
  return (
    <SelectionContext value={{ ids, selected, toggle, setAll, names }}>
      {children}
      <BulkBar
        actions={actions}
        selected={ids.filter((id) => selected.has(id))}
        pageCount={ids.length}
        texts={texts}
        matching={matching}
        names={names}
        replace={(next) => setChosen(new Set(next))}
      />
    </SelectionContext>
  );
}

/** Ô "chọn mọi dòng trên trang này" ở tiêu đề bảng; lửng (indeterminate) khi chọn một phần. */
export function SelectAllTh({ className }: { className?: string }) {
  const t = useTranslations("table");
  const { ids, selected, setAll } = useSelection();
  const box = useRef<HTMLInputElement>(null);
  const all = ids.length > 0 && selected.size === ids.length;
  const some = selected.size > 0 && !all;
  useEffect(() => {
    if (box.current) box.current.indeterminate = some;
  }, [some]);
  return (
    <th className={cn("t-sel border-b border-border px-3 py-2", className)}>
      <input
        ref={box}
        type="checkbox"
        className="t-box"
        aria-label={t("selectPage")}
        checked={all}
        disabled={ids.length === 0}
        onChange={(e) => setAll(e.target.checked)}
      />
    </th>
  );
}

/** Ô chọn của một dòng; `name` là tên dễ đọc của dòng, cho nhãn "Chọn …" của trình đọc màn hình. */
export function SelectTd({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  const t = useTranslations("table");
  const { selected, toggle, names } = useSelection();
  const shift = useRef(false);
  useEffect(() => {
    names.set(id, name);
  }, [names, id, name]);
  return (
    <td className={cn("t-sel border-b border-border px-3 py-2 align-top", className)}>
      <label className="t-hit">
        <input
          type="checkbox"
          className="t-box"
          aria-label={t("selectRow", { name })}
          checked={selected.has(id)}
          onClick={(e) => {
            shift.current = e.shiftKey;
          }}
          onChange={(e) => {
            toggle(id, e.target.checked, shift.current);
            shift.current = false;
          }}
        />
      </label>
    </td>
  );
}

/** Câu tóm tắt kết quả: câu riêng của thao tác, hoặc "Xong 8/10, 2 lỗi". */
export function bulkSummary(
  result: BulkResult,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (result.message) return result.message;
  const failed = result.errors.length;
  return failed === 0
    ? t("done", { done: result.done, total: result.total })
    : t("doneErrors", { done: result.done, total: result.total, count: failed });
}

function BulkBar({
  actions,
  selected,
  pageCount,
  texts,
  matching,
  names,
  replace,
}: {
  names: ReadonlyMap<string, string>;
  actions: readonly BulkActionSpec[];
  selected: string[];
  pageCount: number;
  texts: Readonly<Record<string, string>>;
  matching: { count: number; query: string } | undefined;
  replace: (ids: readonly string[]) => void;
}) {
  const t = useTranslations("table");
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [all, setAll] = useState(false);
  const [errors, setErrors] = useState<BulkResult["errors"]>([]);
  const [asking, setAsking] = useState<BulkActionSpec | null>(null);
  const count = selected.length;
  const allMode = all && matching !== undefined && count === pageCount;
  if (!allMode && all) setAll(false);
  const label = useId();

  const clear = () => {
    replace([]);
    setAll(false);
    setErrors([]);
  };

  const target = (spec: BulkActionSpec) => {
    const base = spec.href ?? "";
    const sep = base.includes("?") ? "&" : "?";
    return allMode && matching
      ? `${base}${sep}${matching.query}${matching.query ? "&" : ""}all=1`
      : `${base}${sep}ids=${selected.map(encodeURIComponent).join(",")}`;
  };

  const execute = (spec: BulkActionSpec, value?: string) => {
    if (spec.copy) {
      const text = selected.map((id) => texts[id] ?? id).join("\n");
      void navigator.clipboard
        ?.writeText(text)
        .then(() => toast(t("copied", { count })))
        .catch(() => toast(t("copyFailed")));
      return;
    }
    if (spec.href) {
      if (spec.download) {
        const a = document.createElement("a");
        a.href = target(spec);
        a.download = "";
        document.body.append(a);
        a.click();
        a.remove();
      } else router.push(target(spec));
      return;
    }
    const run = spec.run;
    if (!run) return;
    start(async () => {
      const input: BulkInput = { ids: selected };
      if (allMode && matching) {
        input.all = true;
        input.query = matching.query;
      }
      if (value !== undefined) input.value = value;
      const result = await run(input);
      const failed = new Set(result.errors.map((e) => e.id).filter(Boolean));
      setErrors(result.errors);
      // Dòng hỏng vẫn được chọn để sửa rồi làm lại; dòng xong bỏ chọn.
      replace(selected.filter((id) => failed.has(id)));
      setAll(false);
      const summary = bulkSummary(result, t);
      const undo = spec.undo;
      const back = result.undo;
      if (undo && back && back.length > 0) {
        toast(summary, {
          label: t("undo"),
          run: () => {
            void undo(back).then((r) => toast(bulkSummary(r, t)));
          },
        });
      } else toast(summary);
    });
  };

  return (
    <>
      {count > 0 ? (
        <section
          className="bulkbar"
          aria-labelledby={label}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !asking) clear();
          }}
        >
          <span id={label} className="bulkbar-count" aria-live="polite">
            {allMode && matching
              ? t("allSelected", { count: matching.count })
              : t("selected", { count })}
          </span>
          {matching && !allMode && count === pageCount && matching.count > count ? (
            <button type="button" className="linkish" onClick={() => setAll(true)}>
              {t("selectAllMatching", { count: matching.count })}
            </button>
          ) : null}
          <span className="bulkbar-acts">
            {actions.map((spec) => (
              <button
                key={spec.key}
                type="button"
                className={`btn sm${spec.tone ? ` ${spec.tone}` : ""}`}
                disabled={pending}
                aria-haspopup={spec.confirm || spec.field ? "dialog" : undefined}
                onClick={() => (spec.confirm || spec.field ? setAsking(spec) : execute(spec))}
              >
                {spec.label}
              </button>
            ))}
          </span>
          <button type="button" className="linkish" onClick={clear}>
            {t("clear")}
          </button>
          {pending ? <span className="bulkbar-wait">{t("working")}</span> : null}
          {errors.length > 0 ? (
            <div className="bulkbar-errors" role="alert">
              <b>{t("failed")}</b>
              <ul>
                {errors.slice(0, 5).map((e) => (
                  <li key={`${e.id}-${e.detail}`}>
                    {e.id ? `${names.get(e.id) ?? e.name}: ${e.detail}` : e.detail}
                  </li>
                ))}
              </ul>
              {errors.length > 5 ? (
                <span>{t("moreErrors", { count: errors.length - 5 })}</span>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
      {asking ? (
        <BulkAsk
          spec={asking}
          count={allMode && matching ? matching.count : count}
          close={() => setAsking(null)}
          confirm={(value) => {
            setAsking(null);
            execute(asking, value);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Hộp thoại hỏi lại của một thao tác hàng loạt; nằm ngoài thanh hàng loạt nên vẫn hiện được khi
 * thanh đổi. Nút an toàn (Huỷ) nhận con trỏ khi mở.
 */
function BulkAsk({
  spec,
  count,
  close,
  confirm,
}: {
  spec: BulkActionSpec;
  count: number;
  close: () => void;
  confirm: (value?: string) => void;
}) {
  const t = useTranslations("table");
  const tf = useTranslations("form");
  const ts = useTranslations("shell");
  const ref = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const fieldId = useId();
  const [value, setValue] = useState(spec.field?.options?.[0]?.value ?? "");
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    if (!spec.field) cancel.current?.focus();
  }, [spec.field]);
  const title = spec.confirm?.title ?? spec.label;
  return (
    <dialog ref={ref} className="axdlg" aria-labelledby={titleId} onClose={close}>
      <div className="dlg-head">
        <h2 id={titleId} className="h2">
          {title}
        </h2>
        <button type="button" className="btn ghost sq" aria-label={ts("close")} onClick={close}>
          <Icon name="x" />
        </button>
      </div>
      <div className="dlg-intro">
        <p>{t("affects", { count })}</p>
        {spec.confirm?.points && spec.confirm.points.length > 0 ? (
          <ul className="dlg-list">
            {spec.confirm.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <form
        className="dlg-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (spec.field && !value.trim()) {
            setMissing(true);
            return;
          }
          confirm(spec.field ? value.trim() : undefined);
        }}
      >
        {spec.field ? (
          <div className="fld">
            <label className="lab" htmlFor={fieldId}>
              {spec.field.label}
            </label>
            {spec.field.options ? (
              <select
                id={fieldId}
                className="inp"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              >
                {spec.field.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={fieldId}
                className="inp"
                value={value}
                maxLength={200}
                aria-invalid={missing || undefined}
                aria-describedby={missing ? `${fieldId}-err` : undefined}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
            {missing ? (
              <span id={`${fieldId}-err`} className="ferr">
                {t("required")}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="dlg-acts">
          <button ref={cancel} type="button" className="btn" onClick={close}>
            {tf("cancel")}
          </button>
          <button type="submit" className={spec.tone === "danger" ? "btn danger-solid" : "btn pri"}>
            {spec.confirm?.submit ?? spec.label}
          </button>
        </div>
      </form>
    </dialog>
  );
}
