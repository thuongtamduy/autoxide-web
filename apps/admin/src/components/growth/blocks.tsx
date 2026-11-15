import Link from "next/link";
import type { ReactNode } from "react";
import "./growth.css";

// Khối hiển thị dùng chung của ba màn Khách hàng, Kênh bán, Tiếp thị liên kết (Server Component, W-019):
// hàng số liệu, danh sách dòng tiền, cặp nhãn – giá trị, dòng thời gian, thẻ ô, dòng chi tiết mở bằng
// `?open=`. Dùng lại lớp CSS sẵn có của khung (`.kpis`, `.cat-kv`, `.cat-lines`, `.timeline`, `.note`).

export interface Kpi {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}

/** Hàng số liệu đầu tab. */
export function Kpis({ label, items }: { label: string; items: readonly Kpi[] }) {
  return (
    <section className="block" aria-label={label}>
      <div className="kpis">
        {items.map((k) => (
          <div key={k.label} className="card kpi">
            <span className="kpi-label">{k.label}</span>
            <b className="kpi-value num">{k.value}</b>
            {k.sub ? <span className="kpi-sub">{k.sub}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Nhãn trạng thái có chấm màu (`tone` là lớp của khung: b-ok, b-warn, b-bad, b-info, b-violet…). */
export function Status({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={`badge ${tone}`}>
      <span className="dot" />
      {children}
    </span>
  );
}

/** Cặp nhãn – giá trị của dòng chi tiết. */
export function KV({ items }: { items: readonly (readonly [string, ReactNode] | null | false)[] }) {
  return (
    <dl className="cat-kv">
      {items
        .filter((x): x is readonly [string, ReactNode] => Boolean(x))
        .map(([k, v]) => [<dt key={`${k}-t`}>{k}</dt>, <dd key={`${k}-d`}>{v}</dd>])}
    </dl>
  );
}

/** Danh sách dòng (tên – số tiền), dòng cuối có thể đậm (tổng). */
export function Lines({
  items,
  total = false,
}: {
  items: readonly (readonly [ReactNode, ReactNode])[];
  total?: boolean;
}) {
  return (
    <ul className="cat-lines">
      {items.map(([k, v], i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: dòng cố định theo thứ tự, không sắp lại
        <li key={i} className={total && i === items.length - 1 ? "gr-total" : undefined}>
          <span>{k}</span>
          <b className="num">{v}</b>
        </li>
      ))}
    </ul>
  );
}

/** Dòng thời gian (mới nhất trước). */
export function Timeline({ items }: { items: readonly (readonly [ReactNode, ReactNode])[] }) {
  return (
    <ol className="timeline">
      {items.map(([at, text], i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: dòng nhật ký chỉ thêm, thứ tự cố định
        <li key={i}>
          <span>{text}</span>
          <span className="sub">{at}</span>
        </li>
      ))}
    </ol>
  );
}

export interface Tile {
  title: string;
  big?: ReactNode;
  text?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  badge?: ReactNode;
}

/** Thẻ ô (quy tắc đang áp dụng, bộ nối…). */
export function Tiles({ items }: { items: readonly Tile[] }) {
  return (
    <div className="kpis gr-tiles">
      {items.map((x) => (
        <div key={x.title} className="card kpi">
          <span className="kpi-label">
            {x.title} {x.badge}
          </span>
          {x.big ? <b className="kpi-value num">{x.big}</b> : null}
          {x.text ? <span>{x.text}</span> : null}
          {x.meta ? <span className="kpi-sub">{x.meta}</span> : null}
          {x.action ? <span className="row-acts">{x.action}</span> : null}
        </div>
      ))}
    </div>
  );
}

/** Tiêu đề khối: h2, gợi ý, nút ở phải. */
export function BlockHead({
  id,
  title,
  about,
  actions,
}: {
  id: string;
  title: string;
  about?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <>
      <div className="block-head">
        <h2 id={id} className="h2">
          {title}
        </h2>
        {actions}
      </div>
      {about ? <p className="fhint">{about}</p> : null}
    </>
  );
}

/** Địa chỉ của trang với tham số đổi (giữ tham số cũ, bỏ giá trị rỗng). */
export function hrefWith(
  base: string,
  params: Record<string, string | undefined | null>,
  change: Record<string, string | null>,
  hash = "",
): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...change })) if (v) next.set(k, v);
  const q = next.toString();
  return `${q ? `${base}?${q}` : base}${hash}`;
}

/** Tên dòng mở / đóng khung chi tiết bằng `?open=` (mở thẳng được, nút quay lại chạy đúng). */
export function OpenLink({
  open,
  href,
  closeHref,
  children,
}: {
  open: boolean;
  href: string;
  closeHref: string;
  children: ReactNode;
}) {
  return (
    <Link className="open" href={open ? closeHref : href} scroll={false} aria-expanded={open}>
      {children}
    </Link>
  );
}

/** Dòng chi tiết dưới một dòng của bảng. */
export function DetailRow({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr className="cat-detail-row">
      <td colSpan={cols}>
        <div className="cat-detail">{children}</div>
      </td>
    </tr>
  );
}

/** Ô có hai dòng: chữ chính và chữ phụ. */
export function Cell2({ main, sub }: { main: ReactNode; sub?: ReactNode }) {
  return (
    <span className="cell2">
      <span>{main}</span>
      {sub ? <span className="sub">{sub}</span> : null}
    </span>
  );
}

/** Tham số chuỗi của địa chỉ trang. */
export function param(params: Record<string, string | string[] | undefined>, name: string): string {
  const v = params[name];
  return typeof v === "string" ? v : "";
}
