import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/shell/icon";

/**
 * Trạng thái rỗng chuẩn: biểu tượng, tiêu đề, một câu giải thích, nút làm việc kế tiếp (như Shopify,
 * Stripe). Chỗ chỉ cần một câu thì dùng `<p className="empty">` (CSS đã có biểu tượng).
 */
export function EmptyState({
  icon = "grid",
  title,
  children,
  actions,
  className,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `empty-state ${className}` : "empty-state"}>
      <span className="es-ic" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {actions ? <div className="es-acts">{actions}</div> : null}
    </div>
  );
}
