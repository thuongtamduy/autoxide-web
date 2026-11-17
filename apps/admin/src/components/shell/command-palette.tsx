"use client";

// Bảng lệnh: Ctrl K / ⌘K mở ở mọi màn, con trỏ vào ô gõ, Esc đóng (popover tự làm), tìm không
// cần dấu, mũi tên lên xuống chọn (dòng chọn luôn cuộn vào khung), Enter mở. Chưa gõ gì thì chỉ gợi
// ý ít dòng: "Tạo mới" (lối tắt tạo, theo permission) và "Gần đây" (màn vừa mở trên máy này) — chưa
// có thì "Phân hệ" (màn đầu của mỗi phân hệ). Gõ chữ thì "Đi tới" (mọi màn) và "Kết quả" (dữ liệu thật:
// bài viết, media, người dùng — `searchEverything`, gọi sau khi ngừng gõ 250 ms). Mỗi dòng có icon,
// tên ở trái, phân hệ mờ ở phải; chân bảng nhắc phím (W-052).
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { type SearchHit, searchEverything } from "@/app/search-actions";
import {
  type CreateShortcut,
  type Destination,
  destinationAt,
  destinations,
  filterDestinations,
  hitIcon,
  pushRecent,
  suggestions,
} from "./command-items";
import { Icon, type IconName } from "./icon";
import type { ShellGroup, ShellPage } from "./nav-client";

export type { CreateShortcut };

/** Màn vừa mở, theo `key` của `Destination`; chỉ là tiện ích trên máy này (mất thì thôi). */
const RECENT_STORE = "ax.qs.recent";

function readRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_STORE) ?? "[]");
    return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

function writeRecent(keys: string[]) {
  try {
    localStorage.setItem(RECENT_STORE, JSON.stringify(keys));
  } catch {
    // Trình duyệt chặn lưu (chế độ riêng tư): bảng lệnh vẫn chạy, chỉ không nhớ màn gần đây.
  }
}

interface Row {
  key: string;
  label: string;
  context: string;
  href: string;
  icon: IconName;
}

export function CommandPalette({
  groups,
  extra,
  create,
  labels,
}: {
  groups: ShellGroup[];
  extra: (ShellPage & { icon?: IconName })[];
  create: CreateShortcut[];
  labels: {
    title: string;
    placeholder: string;
    goTo: string;
    none: string;
    create: string;
    results: string;
    searching: string;
    recent: string;
    areas: string;
    keyMove: string;
    keyOpen: string;
    keyClose: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sheet = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const all = useMemo(() => destinations(groups, extra), [groups, extra]);
  const [hits, setHits] = useState<{ query: string; items: SearchHit[] } | null>(null);
  const q = query.trim();
  const creates: Row[] = filterDestinations(create, query).map((c) => ({ ...c, icon: "plus" }));
  // Màn đang mở không nằm trong "Gần đây": mở lại nó không đưa người dùng đi đâu.
  const here = destinationAt(all, pathname)?.key;
  const suggested = suggestions(
    all,
    groups,
    recent.filter((key) => key !== here),
  );
  const middle: { id: string; caption: string; items: Destination[] } = q
    ? { id: "goto", caption: labels.goTo, items: filterDestinations(all, query) }
    : {
        id: suggested.kind,
        caption: suggested.kind === "recent" ? labels.recent : labels.areas,
        items: suggested.items,
      };
  const results: Row[] = (hits && hits.query === q ? hits.items : []).map((h) => ({
    ...h,
    icon: hitIcon(h.key),
  }));
  const searching = q.length >= 2 && hits?.query !== q;
  // Thứ tự nhóm: có màn gần đây thì chúng lên đầu (đi tới màn quen là việc làm nhiều nhất); còn lại
  // "Tạo mới" đứng đầu, để danh sách dài (mọi phân hệ, kết quả tìm) không đẩy nó khỏi khung.
  const createSection = { id: "create", caption: labels.create, items: creates as Row[] };
  const resultsSection = { id: "results", caption: labels.results, items: results };
  const ordered =
    middle.id === "recent"
      ? [middle, createSection, resultsSection]
      : [createSection, middle, resultsSection];
  let offset = 0;
  const sections = ordered.map((section) => {
    const placed = { ...section, offset };
    offset += section.items.length;
    return placed;
  });
  // Một danh sách phẳng cho phím mũi tên và Enter, theo thứ tự hiện.
  const shown: Row[] = sections.flatMap((section) => section.items);

  // Màn gần đây: nhớ mọi màn người dùng mở (bằng bảng lệnh hay thanh bên), đọc sau khi gắn vào
  // trình duyệt (máy chủ không có localStorage).
  useEffect(() => {
    const here = destinationAt(all, pathname);
    const keys = readRecent();
    if (!here) {
      setRecent(keys);
      return;
    }
    const next = pushRecent(keys, here.key);
    writeRecent(next);
    setRecent(next);
  }, [all, pathname]);

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

  // Dòng đang chọn bằng phím luôn nằm trong khung (danh sách dài thì cuộn theo).
  useEffect(() => {
    document.getElementById(`qs-${index}`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const go = (href: string) => {
    sheet.current?.hidePopover();
    router.push(href);
  };

  return (
    <div
      className="axsheet qs"
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
      </div>
      <div className="qs-list" id="qs-list" role="listbox" aria-label={labels.title}>
        {sections.map(({ id, caption, items, offset }) =>
          items.length > 0 || (id === "results" && searching) ? (
            <div key={id} className="qs-sec" data-testid={`qs-${id}`}>
              <span className="qs-cap">{caption}</span>
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
                    // Rê chuột chọn dòng, như phím mũi tên (Enter mở đúng dòng đang sáng). Dùng
                    // `pointermove` để danh sách tự cuộn dưới con trỏ đứng yên không đổi dòng chọn.
                    onPointerMove={() => {
                      if (i !== index) setIndex(i);
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      go(d.href);
                    }}
                  >
                    <span className="qs-ic">
                      <Icon name={d.icon} small />
                    </span>
                    <span className="qs-label">{d.label}</span>
                    {d.context ? <span className="qs-dim">{d.context}</span> : null}
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
      <div className="qs-foot hide-mobile" aria-hidden="true">
        <span>
          <span className="kbd">↑</span>
          <span className="kbd">↓</span>
          {labels.keyMove}
        </span>
        <span>
          <span className="kbd">↵</span>
          {labels.keyOpen}
        </span>
        <span>
          <span className="kbd">Esc</span>
          {labels.keyClose}
        </span>
      </div>
    </div>
  );
}
