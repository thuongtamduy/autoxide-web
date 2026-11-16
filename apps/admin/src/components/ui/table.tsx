import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Bảng. `cards`: trên điện thoại mỗi dòng thành một thẻ, mỗi ô hiện nhãn cột của nó (đặt bằng
 * `label` của `Td`), để con số không đứng trơ (quy ước thiết kế quản trị, mục 2.3).
 */
export function Table({
  className,
  cards = false,
  ...props
}: HTMLAttributes<HTMLTableElement> & { cards?: boolean }) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn("w-full border-collapse text-sm", cards && "rtable", className)}
        {...props}
      />
    </div>
  );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "border-b border-border px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  label,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { label?: string | undefined }) {
  return (
    <td
      className={cn("border-b border-border px-3 py-2 align-top", className)}
      data-label={label}
      {...props}
    />
  );
}
