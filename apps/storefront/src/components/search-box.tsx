"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import type { SuggestGroup } from "@/lib/suggest";
import { Icon } from "./icon";

/**
 * Ô tìm ở đầu trang có gợi ý (combobox theo mẫu ARIA APG): gõ là gợi ý từ khoá, "trong danh mục",
 * sản phẩm có giá, bài viết, cửa hàng (`/api/suggest`). ↓ ↑ chọn, Enter mở mục đang chọn (không chọn
 * thì gửi form tới trang tìm kiếm), Esc đóng. Không có JavaScript thì vẫn là form GET bình thường.
 */
export function SearchBox({
  action,
  locale,
  placeholder,
  label,
}: {
  action: string;
  locale: string;
  placeholder: string;
  label: string;
}) {
  const t = useTranslations("suggest");
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<SuggestGroup[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loaded, setLoaded] = useState("");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setGroups([]);
      setLoaded("");
      return;
    }
    const controller = new AbortController();
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/suggest?q=${encodeURIComponent(q)}&locale=${encodeURIComponent(locale)}`,
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const body = (await response.json()) as { groups: SuggestGroup[] };
        setGroups(body.groups);
        setActive(-1);
        setLoaded(q);
      } catch {
        // Huỷ (gõ tiếp) hay mất mạng: giữ gợi ý cũ, Enter vẫn mở trang tìm kiếm.
      }
    }, 150);
    return () => {
      controller.abort();
      window.clearTimeout(timer.current);
    };
  }, [query, locale]);

  const items = groups.flatMap((g) => g.items);
  const expanded = open && query.trim() !== "" && loaded !== "";
  const optionId = (index: number) => `${listId}-o${index}`;

  return (
    <search className="hdr-search">
      <form action={action} method="get" className="hs-form">
        <label className="hs-field">
          <Icon name="search" className="hs-ic" />
          <input
            className="inp"
            type="search"
            name="q"
            maxLength={200}
            autoComplete="off"
            placeholder={placeholder}
            aria-label={label}
            role="combobox"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
                setActive(-1);
              } else if (event.key === "ArrowDown" && items.length > 0) {
                event.preventDefault();
                setOpen(true);
                setActive((active + 1) % items.length);
              } else if (event.key === "ArrowUp" && items.length > 0) {
                event.preventDefault();
                setActive(active <= 0 ? items.length - 1 : active - 1);
              } else if (event.key === "Enter" && expanded && active >= 0) {
                const item = items[active];
                if (item) {
                  event.preventDefault();
                  setOpen(false);
                  router.push(item.href);
                }
              }
            }}
          />
        </label>
      </form>
      {expanded ? (
        // Bấm chuột vào gợi ý không làm ô tìm mất focus trước khi link mở.
        <div
          id={listId}
          className="card pop hs-list"
          role="listbox"
          aria-label={t("label")}
          onMouseDown={(event) => event.preventDefault()}
        >
          {groups.map((group) => (
            // biome-ignore lint/a11y/useSemanticElements: nhóm trong listbox theo mẫu ARIA APG (fieldset không hợp lệ trong listbox)
            <div
              className="hs-group"
              role="group"
              aria-labelledby={`${listId}-${group.key}`}
              key={group.key}
            >
              <span className="hs-gl" id={`${listId}-${group.key}`}>
                {group.label}
              </span>
              {group.items.map((item) => {
                const index = items.indexOf(item);
                return (
                  <NextLink
                    key={item.href + item.label}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === active}
                    className={`hs-opt${index === active ? " on" : ""}`}
                    href={item.href}
                    onClick={() => setOpen(false)}
                  >
                    <span className="ell">{item.label}</span>
                    {item.sub ? <span className="num hs-sub">{item.sub}</span> : null}
                  </NextLink>
                );
              })}
            </div>
          ))}
          {groups.length === 0 ? <span className="hs-empty">{t("empty")}</span> : null}
          <span className="hs-foot">{t("hint")}</span>
        </div>
      ) : null}
    </search>
  );
}
