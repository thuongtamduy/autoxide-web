import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { NavLink } from "@/lib/menu";

/** Link của menu: trong website thì `Link` (thêm `/en` khi cần), ngoài website thì `<a>` thường. */
export function NavAnchor({
  link,
  className,
  children,
}: {
  link: NavLink;
  className?: string;
  children?: ReactNode;
}) {
  if (link.external) {
    return (
      <a className={className} href={link.href} rel="noopener noreferrer">
        {children ?? link.label}
      </a>
    );
  }
  return (
    <Link className={className} href={link.href}>
      {children ?? link.label}
    </Link>
  );
}
