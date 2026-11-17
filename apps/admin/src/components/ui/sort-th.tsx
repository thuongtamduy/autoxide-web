import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ariaSort, type Keep, type SortDir, type SortState, sortHref } from "@/lib/table";

/**
 * Tiêu đề cột sắp được: bấm thì đổi `?sort=field&dir=` trên địa chỉ (cột đang sắp thì đảo chiều,
 * cột khác bắt đầu bằng `first`), về trang đầu. `aria-sort` báo cột đang sắp cho trình đọc màn
 * hình. Chỉ dùng cho cột mà nguồn dữ liệu sắp được (hàm mẫu, hay API có tham số sắp của core).
 * `keep`: tham số đang có trên địa chỉ (bộ lọc), giữ nguyên khi đổi cách sắp.
 */
export function SortTh({
  field,
  sort,
  base,
  keep,
  first = "asc",
  className,
  children,
}: {
  field: string;
  sort: SortState;
  base: string;
  keep: Keep;
  first?: SortDir;
  className?: string;
  children: ReactNode;
}) {
  const t = useTranslations("table");
  const state = ariaSort(sort, field);
  const on = state !== "none";
  return (
    <th
      className={cn(
        "border-b border-border px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
      aria-sort={on ? state : undefined}
    >
      <Link
        className={on ? "sort-th on" : "sort-th"}
        href={sortHref(base, keep, sort, field, first)}
        title={on ? t(state === "ascending" ? "sortedAsc" : "sortedDesc") : t("sortHint")}
        scroll={false}
      >
        {children}
        <span className="sort-ic" aria-hidden="true">
          {state === "ascending" ? "↑" : state === "descending" ? "↓" : "↕"}
        </span>
      </Link>
    </th>
  );
}
