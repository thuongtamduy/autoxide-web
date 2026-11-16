import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TokenAction } from "@/components/token-action";
import type { Locale } from "@/i18n/routing";
import { confirmSubscription } from "@/lib/newsletter-actions";

// Trang của `AUTOXIDE_NEWSLETTER_CONFIRM_URL` (core): `/newsletter/confirm?token={token}`.

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ConfirmPage(props: PageProps<"/[locale]/newsletter/confirm">) {
  const locale = (await props.params).locale as Locale;
  const { token } = await props.searchParams;
  const t = await getTranslations({ locale, namespace: "newsletter.confirm" });
  const value = typeof token === "string" ? token.slice(0, 2000) : "";
  return (
    <main id="main" className="wrap page-msg">
      <h1 className="dsp">{t("title")}</h1>
      {value ? (
        <>
          <p className="muted">{t("body")}</p>
          <TokenAction
            action={confirmSubscription}
            token={value}
            locale={locale}
            button={t("button")}
          />
        </>
      ) : (
        <p className="muted" role="alert">
          {t("invalid")}
        </p>
      )}
    </main>
  );
}
