"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { pickUnit } from "@/app/(admin)/org/actions";
import { initialsOf } from "@/lib/initials";
import { Icon } from "./icon";

export interface PickerNode {
  id: string;
  name: string;
  type: string;
  depth: number;
}

/**
 * Bộ chọn nút tổ chức ở góc trên trái (thiết kế: "Đổi khách hàng hoặc nút tổ chức"). Chọn một nút
 * thì danh sách bài, media, form, menu chỉ còn dữ liệu của nút đó; nút gốc = cả khách. Màn đang
 * xem giữ nguyên. Nút đã chọn nhớ ở cookie `ax_unit` (Server Action `pickUnit`).
 */
export function OrgPicker({
  title,
  tenant,
  nodes,
  current,
}: {
  /** `true` khi `title` là tên khách (core nhiều khách), không phải tên ứng dụng. */
  tenant: boolean;
  /** Dòng trên: tên khách (core nhiều khách) hay tên ứng dụng. */
  title: string;
  /** Mọi nút theo thứ tự cây; phần tử đầu là gốc. */
  nodes: readonly PickerNode[];
  /** Nút đang chọn; `null`: cả khách. */
  current: string | null;
}) {
  const t = useTranslations("shell.org");
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const titleId = useId();
  const root = nodes[0];
  const chosen = nodes.find((n) => n.id === current);
  const q = query.trim().toLowerCase();
  const shown = q
    ? nodes.filter((n) => n.name.toLowerCase().includes(q) || n.type.toLowerCase().includes(q))
    : nodes;
  return (
    <>
      <button
        type="button"
        className="ctx"
        aria-haspopup="dialog"
        aria-label={t("open")}
        onClick={() => {
          setQuery("");
          ref.current?.showModal();
        }}
      >
        <span className="tav">{initialsOf(title)}</span>
        <span className="ctx-text">
          <span
            className="ell"
            style={{ fontWeight: 600 }}
            data-testid={tenant ? "tenant-name" : undefined}
          >
            {title}
          </span>
          <span className="ell ctx-sub" data-testid="unit-name">
            {chosen ? chosen.name : t("all", { name: root?.name ?? title })}
          </span>
        </span>
        <Icon name="chev" />
      </button>
      <dialog ref={ref} className="axdlg org-picker" aria-labelledby={titleId}>
        <div className="dlg-head">
          <h2 id={titleId} className="h2">
            {t("title")}
          </h2>
          <button
            type="button"
            className="btn ghost sq"
            aria-label={t("close")}
            onClick={() => ref.current?.close()}
          >
            <Icon name="x" />
          </button>
        </div>
        <input
          className="inp"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
        />
        <form action={pickUnit} onSubmit={() => ref.current?.close()} className="op-list">
          {shown.map((node) => {
            const isRoot = node.id === root?.id;
            const on = isRoot ? current === null : node.id === current;
            return (
              <button
                key={node.id}
                type="submit"
                name="unit"
                value={isRoot ? "" : node.id}
                className={on ? "op-node on" : "op-node"}
                aria-current={on ? "true" : undefined}
                style={{ paddingInlineStart: `${10 + (q ? 0 : node.depth) * 18}px` }}
              >
                <span className="ell" style={{ flex: 1, minWidth: 0 }}>
                  {isRoot ? t("all", { name: node.name }) : node.name}
                </span>
                <span className="op-kind">{node.type}</span>
              </button>
            );
          })}
          {shown.length === 0 ? <p className="empty">{t("none")}</p> : null}
        </form>
        <p className="fhint">{t("hint")}</p>
      </dialog>
    </>
  );
}
