"use client";

import Form from "next/form";
import { type ReactNode, useEffect, useState } from "react";
import { Icon } from "../icon";

/**
 * Khung của trang danh mục: cột bộ lọc (form GET, đổi là gửi ngay — điều hướng phía trình duyệt của
 * `next/form`, không tải lại trang) và cột kết quả. Trên điện thoại cột lọc thành tấm toàn màn mở bằng
 * nút "Bộ lọc". Không có JavaScript thì form vẫn chạy bằng nút "Áp dụng".
 *
 * Ô lọc do máy chủ dựng (truyền vào `filters`), nên dữ liệu và chữ ở một chỗ; component này chỉ giữ
 * trạng thái mở / đóng của tấm lọc.
 */
export function ListingShell({
  formId,
  action,
  filters,
  bar,
  children,
  labels,
  activeCount,
}: {
  formId: string;
  action: string;
  filters: ReactNode;
  bar: ReactNode;
  children: ReactNode;
  labels: { title: string; open: string; close: string; show: string; apply: string };
  activeCount: number;
}) {
  const [open, setOpen] = useState(false);
  // Tấm lọc toàn màn: Esc đóng, nền không cuộn theo.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="cat-layout">
      <aside className={`filters cat-filters${open ? " open" : ""}`} aria-label={labels.title}>
        <div className="only-mobile cat-sheet-x">
          <span className="dsp cat-sheet-t">{labels.title}</span>
          <button
            type="button"
            className="btn ghost sq"
            aria-label={labels.close}
            onClick={() => setOpen(false)}
          >
            <Icon name="x" />
          </button>
        </div>
        <Form
          id={formId}
          action={action}
          scroll={false}
          replace
          className="cat-form"
          onChange={(event) => event.currentTarget.requestSubmit()}
        >
          {filters}
          <noscript>
            <button type="submit" className="btn">
              {labels.apply}
            </button>
          </noscript>
        </Form>
        <div className="only-mobile cat-sheet-foot">
          <button type="button" className="btn pri wide" onClick={() => setOpen(false)}>
            {labels.show}
          </button>
        </div>
      </aside>
      <section className="cat-main">
        <div className="cat-bar">
          <button
            type="button"
            className="btn sm only-mobile cat-fbtn"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Icon name="filter" small />
            {labels.open}
            {activeCount > 0 ? (
              <span className="badge b-brand cat-fcount">{activeCount}</span>
            ) : null}
          </button>
          {bar}
        </div>
        {children}
      </section>
    </div>
  );
}

/** Ô "Sắp xếp" nằm ngoài form lọc (thanh trên lưới) nhưng gửi cùng form (`form="…"`). */
export function SortSelect({
  formId,
  value,
  label,
  options,
}: {
  formId: string;
  value: string;
  label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      className="sel cat-sel"
      name="sort"
      form={formId}
      defaultValue={value}
      aria-label={label}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
