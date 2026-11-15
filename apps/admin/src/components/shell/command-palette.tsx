"use client";

// Bảng lệnh: Ctrl K / ⌘K mở ở mọi màn, con trỏ vào ô gõ, Esc đóng (popover tự làm), tìm không
// cần dấu, mũi tên lên xuống chọn, Enter mở. Hiện chỉ có "Đi tới"; tìm dữ liệu xuyên phân hệ
// cần API tìm chung của core (bước 52).
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { fold } from "@/lib/fold";
import { Icon } from "./icon";
import type { ShellGroup, ShellPage } from "./nav-client";

interface Destination {
  key: string;
  label: string;
  context: string;
  href: string;
}

export function destinations(groups: ShellGroup[], extra: ShellPage[]): Destination[] {
  const out: Destination[] = [];
  for (const group of groups) {
    for (const page of group.pages) {
      out.push({
        key: `${group.id}/${page.id}`,
        label: page.label,
        context: group.pages.length > 1 || page.label !== group.label ? group.label : "",
        href: page.href,
      });
    }
  }
  for (const page of extra) {
    out.push({ key: page.id, label: page.label, context: "", href: page.href });
  }
  return out;
}

export function filterDestinations(list: Destination[], query: string): Destination[] {
  const q = fold(query);
  if (!q) return list;
  return list.filter((d) => fold(`${d.context} ${d.label}`).includes(q));
}

export function CommandPalette({
  groups,
  extra,
  labels,
}: {
  groups: ShellGroup[];
  extra: ShellPage[];
  labels: { title: string; placeholder: string; goTo: string; none: string };
}) {
  const router = useRouter();
  const sheet = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const all = useMemo(() => destinations(groups, extra), [groups, extra]);
  const shown = filterDestinations(all, query);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const el = sheet.current;
        if (el && !el.matches(":popover-open")) el.showPopover();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    const onToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === "open") {
        setQuery("");
        setIndex(0);
        input.current?.focus();
      }
    };
    el.addEventListener("toggle", onToggle);
    return () => el.removeEventListener("toggle", onToggle);
  }, []);

  const go = (href: string) => {
    sheet.current?.hidePopover();
    router.push(href);
  };

  return (
    <div
      className="axsheet"
      id="qs"
      popover="auto"
      ref={sheet}
      role="dialog"
      aria-label={labels.title}
    >
      <div className="qs-in">
        <Icon name="search" />
        <input
          ref={input}
          type="search"
          value={query}
          placeholder={labels.placeholder}
          aria-label={labels.placeholder}
          aria-controls="qs-list"
          aria-activedescendant={shown[index] ? `qs-${index}` : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setIndex((i) => Math.min(i + 1, shown.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (event.key === "Enter") {
              const target = shown[index];
              if (target) {
                event.preventDefault();
                go(target.href);
              }
            }
          }}
        />
        <span className="kbd hide-mobile">Esc</span>
      </div>
      <span className="cap" style={{ margin: "8px 18px 2px" }}>
        {labels.goTo}
      </span>
      <div className="qs-list" id="qs-list" role="listbox" aria-label={labels.goTo}>
        {shown.map((d, i) => (
          <a
            key={d.key}
            id={`qs-${i}`}
            href={d.href}
            role="option"
            aria-selected={i === index}
            className="qs-it"
            onClick={(event) => {
              event.preventDefault();
              go(d.href);
            }}
          >
            {d.context ? <span className="qs-dim">{d.context} ›</span> : null}
            <span>{d.label}</span>
          </a>
        ))}
        {shown.length === 0 ? <span className="qs-none">{labels.none}</span> : null}
      </div>
    </div>
  );
}
