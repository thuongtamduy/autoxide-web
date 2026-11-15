"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface PageTab {
  href: string;
  label: string;
  /** Tab vẫn sáng khi mở trang con của nó (vd `/org/access/users/{id}` thuộc tab Người dùng). */
  nested?: boolean;
  /** Chữ nhỏ cạnh nhãn, vd "mẫu" cho tab dùng dữ liệu mẫu (W-006). */
  badge?: string;
}

/** Tab của màn: mỗi tab một đường dẫn con, nên mở thẳng được và nút quay lại chạy đúng. */
export function PageTabs({ tabs, label }: { tabs: PageTab[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav className="ptabs" aria-label={label}>
      {tabs.map((tab) => {
        const on =
          pathname === tab.href || (tab.nested === true && pathname.startsWith(`${tab.href}/`));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={on ? "stab on" : "stab"}
            aria-current={on ? "page" : undefined}
          >
            {tab.label}
            {tab.badge ? <span className="cnt">{tab.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
