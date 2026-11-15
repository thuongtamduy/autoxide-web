"use client";

import { type ReactNode, useEffect, useState } from "react";
import { Icon } from "../icon";

export interface DetailSection {
  id: string;
  /** Tên trên tab (máy tính) và tiêu đề mục gập (điện thoại). */
  label: string;
  /** Tên ngắn cho khổ 721–1100px. */
  short: string;
  /** Dòng phụ dưới tiêu đề mục gập. */
  meta: string;
  content: ReactNode;
}

/**
 * Thông tin chi tiết của sản phẩm: máy tính là hàng tab (ARIA tabs, phím ← →), điện thoại là các mục
 * mở / gập xếp dọc (tab ngang làm người dùng bỏ sót nội dung — bản thiết kế, R2 4.8). Nội dung từng
 * mục do máy chủ dựng. Địa chỉ có `#reviews` / `#qa` (link "212 đánh giá" ở đầu trang) thì mở đúng mục.
 */
export function DetailTabs({ sections, label }: { sections: DetailSection[]; label: string }) {
  const [tab, setTab] = useState(sections[0]?.id ?? "");
  const [open, setOpen] = useState<Record<string, boolean>>({ [sections[0]?.id ?? ""]: true });

  useEffect(() => {
    const show = () => {
      const id = window.location.hash.slice(1);
      if (sections.some((s) => s.id === id)) {
        setTab(id);
        setOpen((current) => ({ ...current, [id]: true }));
      }
    };
    show();
    window.addEventListener("hashchange", show);
    return () => window.removeEventListener("hashchange", show);
  }, [sections]);

  const move = (from: number, delta: number) => {
    const next = sections[(from + delta + sections.length) % sections.length];
    if (!next) return;
    setTab(next.id);
    document.getElementById(`pp-tab-${next.id}`)?.focus();
  };

  return (
    <section id="detail" className="pp-detail" aria-label={label}>
      <div className="tabrow pp-tabs" role="tablist" aria-label={label}>
        {sections.map((section, index) => (
          <button
            key={section.id}
            id={`pp-tab-${section.id}`}
            type="button"
            role="tab"
            className={`cat-a${tab === section.id ? " on" : ""}`}
            aria-selected={tab === section.id}
            aria-controls={`pp-pane-${section.id}`}
            tabIndex={tab === section.id ? 0 : -1}
            onClick={() => setTab(section.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") move(index, 1);
              if (event.key === "ArrowLeft") move(index, -1);
            }}
          >
            <span className="pp-tl">{section.label}</span>
            <span className="pp-ts">{section.short}</span>
          </button>
        ))}
      </div>
      {sections.map((section) => {
        const expanded = Boolean(open[section.id]);
        return (
          <div
            key={section.id}
            id={section.id}
            className={`pp-sec${tab === section.id ? " is-tab" : ""}${expanded ? " is-open" : ""}`}
          >
            <h2 className="pp-acc-h">
              <button
                type="button"
                className="pp-acc"
                aria-expanded={expanded}
                aria-controls={`pp-pane-${section.id}`}
                onClick={() => setOpen({ ...open, [section.id]: !expanded })}
              >
                <span className="pp-acc-t">
                  <span className="pp-acc-n">{section.label}</span>
                  <span className="pp-acc-m">{section.meta}</span>
                </span>
                <Icon name="down" />
              </button>
            </h2>
            <div
              id={`pp-pane-${section.id}`}
              className="pp-pane"
              role="tabpanel"
              aria-labelledby={`pp-tab-${section.id}`}
            >
              {section.content}
            </div>
          </div>
        );
      })}
    </section>
  );
}
