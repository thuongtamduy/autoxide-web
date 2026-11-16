import { formatMoney, type Money } from "@/lib/format";

/**
 * Một số tiền. Không bao giờ bẻ dòng: NBSP trước "₫" (`formatMoney`) và `white-space: nowrap` của
 * `.price` / `.was`. `was` = giá gạch (giá trước giảm).
 */
export function Price({
  money,
  locale,
  sale = false,
  was = false,
  className,
}: {
  money: Money;
  locale: string;
  sale?: boolean;
  was?: boolean;
  className?: string;
}) {
  const cls = [was ? "was" : "price", sale ? "sale" : "", "num", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return was ? (
    <s className={cls}>{formatMoney(money, locale)}</s>
  ) : (
    <span className={cls}>{formatMoney(money, locale)}</span>
  );
}
