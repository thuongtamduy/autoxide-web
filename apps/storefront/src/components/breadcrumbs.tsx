import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export interface Crumb {
  label: string;
  /** Không có: mục hiện tại (cuối). */
  href?: string;
}

/** Đường dẫn "Trang chủ / … / trang này". Mục cuối có `aria-current="page"`. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const t = useTranslations("nav");
  const all: Crumb[] = [{ label: t("home"), href: "/" }, ...items];
  return (
    <nav className="crumbs" aria-label={t("breadcrumbs")}>
      <ol>
        {all.map((crumb, index) => (
          <li key={`${crumb.href ?? ""}|${crumb.label}`}>
            {crumb.href && index < all.length - 1 ? (
              <Link href={crumb.href}>{crumb.label}</Link>
            ) : (
              <span aria-current="page">{crumb.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
