import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

/**
 * Đầu một khối của trang: tiêu đề (h2), dòng phụ, dấu "mẫu" nếu có, và link "Xem thêm" bên phải.
 * Dùng cho mọi khối của trang chủ và các trang thương mại để cùng nhịp chữ và khoảng cách.
 */
export function SectionHeader({
  id,
  title,
  sub,
  mark,
  more,
}: {
  id?: string;
  title: string;
  sub?: ReactNode;
  mark?: ReactNode;
  more?: { href: string; label: string } | null;
}) {
  return (
    <div className="sec-head">
      <h2 id={id} className="dsp">
        {title}
        {mark}
      </h2>
      {sub ? <span className="muted sec-sub">{sub}</span> : null}
      {more ? (
        <Link className="lnk sec-more" href={more.href}>
          {more.label}
        </Link>
      ) : null}
    </div>
  );
}
