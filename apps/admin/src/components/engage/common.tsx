import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { MessagePanel } from "@/components/message-panel";

// Khối dùng chung của phân hệ Tiếp thị (Server Component): đầu trang, chip lọc, phân trang, báo
// thiếu quyền. Cùng lớp CSS của khung (`.phead`, `.chips`, `.pager`) như các màn khác.

/** Đầu trang: dòng phạm vi, h1, mô tả, nút chính ở phải (đứng đầu trên điện thoại). */
export function PageHead({
  crumb,
  title,
  description,
  actions,
  badge,
}: {
  crumb: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <section className="phead">
      <div className="phead-main">
        <span className="crumb ell">{crumb}</span>
        <h1 className="h1">
          {title}
          {badge ? <> {badge}</> : null}
        </h1>
        {description ? <p className="pdesc">{description}</p> : null}
      </div>
      {actions ? <div className="headacts eg-headacts">{actions}</div> : null}
    </section>
  );
}

export interface Chip {
  href: string;
  label: string;
  on: boolean;
  count?: number | string | undefined;
}

/** Chip lọc: mỗi chip là một link (bộ lọc nằm trên địa chỉ, nút quay lại chạy đúng). */
export function Chips({ label, chips }: { label: string; chips: readonly Chip[] }) {
  return (
    <nav className="chips" aria-label={label}>
      {chips.map((chip) => (
        <Link
          key={chip.href}
          className={chip.on ? "chip on" : "chip"}
          href={chip.href}
          aria-current={chip.on ? "page" : undefined}
        >
          {chip.label}
          {chip.count !== undefined ? <span className="cnt">{chip.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

/** Trang đầu / trang sau theo con trỏ của core. */
export function Pager({ first, next }: { first?: string | null; next?: string | null }) {
  const t = useTranslations("engage");
  if (!first && !next) return null;
  return (
    <nav className="pager" aria-label={t("pages")}>
      {first ? (
        <Link className="btn sm" href={first}>
          {t("first")}
        </Link>
      ) : null}
      {next ? (
        <Link className="btn sm" href={next} rel="next">
          {t("next")}
        </Link>
      ) : null}
    </nav>
  );
}

/** Thay nội dung trang khi người xem thiếu permission. */
export function Forbidden({ permission }: { permission: string }) {
  const t = useTranslations("errors");
  return <MessagePanel title={t("forbiddenTitle")} message={t("forbidden", { permission })} />;
}

/** Nút quay lại danh sách. */
export function Back({ href, label }: { href: string; label: string }) {
  return (
    <nav className="back" aria-label={label}>
      <Link href={href} className="btn ghost sm">
        <span aria-hidden="true">←</span> {label}
      </Link>
    </nav>
  );
}

/** Một cặp nhãn – giá trị của khối chi tiết. */
export function Facts({ items }: { items: readonly [string, ReactNode][] }) {
  return (
    <dl className="eg-facts">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Đầu của trang chi tiết nằm trong một màn có tab (vd một danh sách nhận tin): h2 kèm nhãn trạng
 * thái và nút, vì h1 là tên màn.
 */
export function DetailHead({
  title,
  badge,
  description,
  actions,
  mono = false,
}: {
  title: string;
  badge?: ReactNode;
  description?: string | undefined;
  actions?: ReactNode;
  mono?: boolean;
}) {
  return (
    <section className="block eg-detailhead">
      <div className="block-head">
        <h2 className={mono ? "h2 mono ell" : "h2 ell"}>{title}</h2>
        {badge}
        {actions ? <div className="eg-acts">{actions}</div> : null}
      </div>
      {description ? <p className="fhint">{description}</p> : null}
    </section>
  );
}
