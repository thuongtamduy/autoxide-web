"use client";

// Bảng lệnh: Ctrl K / ⌘K mở ở mọi màn, con trỏ vào ô gõ, Esc đóng (popover tự làm), tìm không
// cần dấu, mũi tên lên xuống chọn, Enter mở. Ba nhóm như thiết kế: "Tạo mới" (lối tắt tạo, theo
// permission), "Đi tới" (màn), "Kết quả" (dữ liệu thật: bài viết, media, người dùng — `searchEverything`,
// gọi sau khi ngừng gõ 250 ms).
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { type SearchHit, searchEverything } from "@/app/search-actions";
import { type CreateShortcut, destinations, filterDestinations } from "./command-items";
import { Icon } from "./icon";
import type { ShellGroup, ShellPage } from "./nav-client";

export type { CreateShortcut };

export function CommandPalette({
  groups,
  extra,
  create,
  labels,
}: {
  groups: ShellGroup[];
  extra: ShellPage[];
  create: CreateShortcut[];
  labels: {
    title: string;
    placeholder: string;
    goTo: string;
    none: string;
    create: string;
    results: string;
    searching: string;
  };
}) {
  const router = useRouter();
  const sheet = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const all = useMemo(() => destinations(groups, extra), [groups, extra]);
  const [hits, setHits] = useState<{ query: string; items: SearchHit[] } | null>(null);
  const creates = filterDestinations(create, query);
  const pages = filterDestinations(all, query);
  const q = query.trim();
  const results = hits && hits.query === q ? hits.items : [];
  const searching = q.length >= 2 && hits?.query !== q;
  // Một danh sách phẳng cho phím mũi tên và Enter, theo thứ tự hiện: Tạo mới, Đi tới, Kết quả.
  const shown = [...creates, ...pages, ...results];

  // Tìm dữ liệu sau khi ngừng gõ; câu trả lời của lần gõ cũ thì bỏ (so `query`).
  useEffect(() => {
    if (q.length < 2) return;
    let live = true;
    const timer = setTimeout(() => {
      searchEverything(q)
        .then((items) => {
          if (live) setHits({ query: q, items });
        })
        .catch(() => {
          if (live) setHits({ query: q, items: [] });
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);

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
    // Xoá chữ khi ĐÓNG, không phải khi mở: sự kiện `toggle` tới sau khi bảng đã mở, xoá lúc đó thì
    // chữ người dùng gõ ngay sau Ctrl K bị mất.
    const onToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === "open") {
        input.current?.focus();
      } else {
        setQuery("");
        setIndex(0);
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
      <div className="qs-list" id="qs-list" role="listbox" aria-label={labels.title}>
        {(
          [
            ["create", labels.create, creates, 0],
            ["goto", labels.goTo, pages, creates.length],
            ["results", labels.results, results, creates.length + pages.length],
          ] as const
        ).map(([id, caption, items, offset]) =>
          items.length > 0 || (id === "results" && searching) ? (
            <div key={id} data-testid={`qs-${id}`}>
              <span className="cap" style={{ display: "block", margin: "8px 18px 2px" }}>
                {caption}
              </span>
              {items.map((d, n) => {
                const i = offset + n;
                return (
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
                    {id === "results" ? (
                      <>
                        <span>{d.label}</span>
                        <span className="qs-dim">{d.context}</span>
                      </>
                    ) : (
                      <>
                        {d.context ? <span className="qs-dim">{d.context} ›</span> : null}
                        <span>{d.label}</span>
                      </>
                    )}
                  </a>
                );
              })}
              {id === "results" && searching && items.length === 0 ? (
                <span className="qs-none" role="status">
                  {labels.searching}
                </span>
              ) : null}
            </div>
          ) : null,
        )}
        {shown.length === 0 && !searching ? <span className="qs-none">{labels.none}</span> : null}
      </div>
    </div>
  );
}
