import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

export default function NotFound() {
  const t = useTranslations("errors");
  return (
    <main id="main" className="wrap page-msg">
      <span className="kick">404</span>
      <h1 className="dsp">{t("notFoundTitle")}</h1>
      <p className="muted">{t("notFoundBody")}</p>
      <div className="page-msg-actions">
        <Link className="btn pri" href="/">
          {t("home")}
        </Link>
        <Link className="btn" href={routes.search()}>
          {t("search")}
        </Link>
      </div>
    </main>
  );
}
