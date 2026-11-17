"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { type ChangeAction, useChange } from "@/components/engage/actions";
import { DialogHostContext } from "./dialog";
import { useToast } from "./toast";

/**
 * Một mục của menu "⋯": liên kết (`href`), hộp thoại (`dialog`: một component dùng `Dialog`, vd
 * `ConfirmAction`, `ActionDialog` — nút mở của nó tự ẩn), đổi trạng thái đảo được (`change`, như
 * `ChangeButtons`, có Hoàn tác) hoặc chép chữ (`copy`).
 */
export type RowMenuItem = { label: string; danger?: boolean } & (
  | { href: string }
  | { dialog: ReactNode }
  | {
      change: {
        action: ChangeAction;
        id: string;
        expect: string;
        value: string;
        done: string;
        undo?: { label: string; done: string };
        extra?: Record<string, string>;
      };
    }
  | { copy: string; done: string }
);

/** Đặt menu ngay dưới nút (hoặc trên, khi sát đáy màn hình), canh phải theo nút. */
function place(el: HTMLElement | null, button: HTMLElement | null) {
  if (!el || !button) return;
  const rect = button.getBoundingClientRect();
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  const below = rect.bottom + 4 + height <= window.innerHeight;
  el.style.top = `${Math.max(4, below ? rect.bottom + 4 : rect.top - 4 - height)}px`;
  el.style.left = `${Math.min(Math.max(4, rect.right - width), window.innerWidth - width - 4)}px`;
}

/** Trình duyệt có Popover API không (menu chỉ dựng khi mở, ở trình duyệt, nên không lệch khi hydrate). */
function canPopover(): boolean {
  return typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;
}

/**
 * Menu "⋯" cuối dòng bảng (quy ước: dòng hiện tối đa một nút phụ, còn lại vào đây). Nút mở có
 * `aria-haspopup="menu"`; menu `role="menu"` nằm trong lớp trên cùng (Popover API) nên không bị khung
 * cuộn của bảng cắt. Phím: Enter / Space / ↓ mở và vào mục đầu, ↑ vào mục cuối; trong menu ↑ ↓ Home
 * End đi giữa các mục, Esc đóng và trả con trỏ về nút, Tab đóng. Bấm ra ngoài thì đóng.
 * Hộp thoại của mục được dựng ngoài popover và do state ở đây điều khiển, nên vẫn hiện khi menu đã đóng.
 */
export function RowMenu({ label, items }: { label: string; items: readonly RowMenuItem[] }) {
  const t = useTranslations("table");
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [focusAt, setFocusAt] = useState<"first" | "last">("first");
  const [dialog, setDialog] = useState<number | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = (focus = true) => {
    setOpen(false);
    if (focus) trigger.current?.focus();
  };

  // Mở popover, đặt chỗ, đưa con trỏ vào mục đầu (hay cuối).
  useLayoutEffect(() => {
    const el = menu.current;
    if (!open || !el) return;
    if (typeof el.showPopover === "function" && !el.matches(":popover-open")) el.showPopover();
    place(el, trigger.current);
    const entries = el.querySelectorAll<HTMLElement>("[role=menuitem]");
    (focusAt === "last" ? entries[entries.length - 1] : entries[0])?.focus({ preventScroll: true });
  }, [open, focusAt]);

  // Bấm ra ngoài thì đóng; cuộn hay đổi cỡ cửa sổ thì đặt lại chỗ theo nút (đóng khi nút ra khỏi màn).
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      const target = e.target as Node | null;
      if (target && (menu.current?.contains(target) || trigger.current?.contains(target))) return;
      setOpen(false);
    };
    const follow = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) setOpen(false);
      else place(menu.current, trigger.current);
    };
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("resize", follow);
      window.removeEventListener("scroll", follow, true);
    };
  }, [open]);

  const openWith = (at: "first" | "last") => {
    setFocusAt(at);
    setOpen(true);
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openWith("first");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openWith("last");
    }
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const entries = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const at = entries.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => entries[(i + entries.length) % entries.length]?.focus();
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(entries.length - 1);
    else if (e.key === "Escape") close();
    else if (e.key === "Tab") {
      setOpen(false);
      return;
    } else return;
    e.preventDefault();
  };

  const chosen = dialog === null ? null : items[dialog];
  return (
    <span className="rmenu-wrap">
      <button
        ref={trigger}
        type="button"
        className="btn sm ghost sq rmenu-btn"
        aria-label={label}
        title={t("more")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : openWith("first"))}
        onKeyDown={onTriggerKey}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open ? (
        <div
          ref={menu}
          id={menuId}
          className="rmenu"
          role="menu"
          aria-label={label}
          popover={canPopover() ? "manual" : undefined}
          onKeyDown={onMenuKey}
        >
          {items.map((item, index) => (
            <MenuEntry
              key={item.label}
              item={item}
              onDone={() => close()}
              onDialog={() => {
                setOpen(false);
                setDialog(index);
              }}
              onError={(text) => toast(text)}
            />
          ))}
        </div>
      ) : null}
      {chosen && "dialog" in chosen ? (
        <DialogHostContext
          value={{
            onClose: () => {
              setDialog(null);
              trigger.current?.focus();
            },
          }}
        >
          {chosen.dialog}
        </DialogHostContext>
      ) : null}
    </span>
  );
}

function MenuEntry({
  item,
  onDone,
  onDialog,
  onError,
}: {
  item: RowMenuItem;
  onDone: () => void;
  onDialog: () => void;
  onError: (text: string) => void;
}) {
  const className = item.danger ? "rmenu-item danger" : "rmenu-item";
  if ("href" in item) {
    return (
      <Link role="menuitem" tabIndex={-1} className={className} href={item.href} onClick={onDone}>
        {item.label}
      </Link>
    );
  }
  if ("dialog" in item) {
    return (
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        className={className}
        aria-haspopup="dialog"
        onClick={onDialog}
      >
        {item.label}
      </button>
    );
  }
  if ("copy" in item) return <CopyEntry item={item} className={className} onDone={onDone} />;
  return <ChangeEntry item={item} className={className} onDone={onDone} onError={onError} />;
}

function CopyEntry({
  item,
  className,
  onDone,
}: {
  item: { label: string; copy: string; done: string };
  className: string;
  onDone: () => void;
}) {
  const t = useTranslations("table");
  const toast = useToast();
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={className}
      onClick={() => {
        onDone();
        void navigator.clipboard
          ?.writeText(item.copy)
          .then(() => toast(item.done))
          .catch(() => toast(t("copyFailed")));
      }}
    >
      {item.label}
    </button>
  );
}

function ChangeEntry({
  item,
  className,
  onDone,
  onError,
}: {
  item: Extract<RowMenuItem, { change: unknown }>;
  className: string;
  onDone: () => void;
  onError: (text: string) => void;
}) {
  const { change } = item;
  const [, run, pending] = useChange({
    action: change.action,
    id: change.id,
    expect: change.expect,
    undo: change.undo,
    extra: change.extra,
    onError,
  });
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={className}
      disabled={pending}
      onClick={() => {
        run({ value: change.value, label: item.label, done: change.done });
        onDone();
      }}
    >
      {item.label}
    </button>
  );
}
