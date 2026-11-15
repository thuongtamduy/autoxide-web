"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface AccountTab {
  href: string;
  label: string;
}

/** Tab của màn: mỗi tab một đường dẫn con, nên mở thẳng được và nút quay lại chạy đúng. */
export function AccountTabs({ tabs, label }: { tabs: AccountTab[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav className="ptabs" aria-label={label}>
      {tabs.map((tab) => {
        const on = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={on ? "stab on" : "stab"}
            aria-current={on ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
