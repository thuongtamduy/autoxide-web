import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { LookupForm } from "@/components/buyer/lookup-form";
import { Icon } from "@/components/icon";
import { SampleMark } from "@/components/sample-mark";
import type { Locale } from "@/i18n/routing";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { siteIdentity } from "@/lib/site";
import { sampleDataEnabled } from "@/sample";

// Tra cứu đơn không cần tài khoản (bản thiết kế `Lookup`): mã đơn + số điện thoại → OTP qua SMS → xem
// đơn và các mốc giao. Mẫu; thay bằng `POST /api/v1/orders/public/orders/lookup` và
// `POST …/lookup/{id}/confirm` (bước 45, D-202).

export async function generateMetadata(
  props: PageProps<"/[locale]/tra-cuu-don-hang">,
): Promise<Metadata> {
  const locale = (await props.params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "lookup" });
  return pageMetadata({
    locale,
    path: routes.orderLookup(),
    title: t("title"),
    description: t("lead"),
  });
}

export default async function LookupPage(props: PageProps<"/[locale]/tra-cuu-don-hang">) {
  const locale = (await props.params).locale as Locale;
  if (!sampleDataEnabled()) notFound();
  const t = await getTranslations({ locale, namespace: "lookup" });
  const site = await siteIdentity(locale);
  return (
    <main id="main" className="wrap lk-page">
      <Breadcrumbs items={[{ label: t("title") }]} />
      <header className="lk-head rise">
        <h1 className="dsp">
          {t("title")}
          <SampleMark endpoint="POST /api/v1/orders/public/orders/lookup" step="45" />
        </h1>
        <p className="muted">{t("lead")}</p>
      </header>
      <div className="lk-cols">
        <LookupForm locale={locale} siteName={site.name} />
        <aside className="lk-aside">
          <h2 className="dsp">{t("how.title")}</h2>
          <ul>
            <li>
              <Icon name="mail" small />
              <span>{t("how.code")}</span>
            </li>
            <li>
              <Icon name="phone" small />
              <span>{t("how.otp")}</span>
            </li>
            <li>
              <Icon name="lock" small />
              <span>{t("how.limit")}</span>
            </li>
          </ul>
        </aside>
      </div>
    </main>
  );
}
