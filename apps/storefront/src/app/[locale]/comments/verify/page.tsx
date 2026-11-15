import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TokenAction } from "@/components/token-action";
import type { Locale } from "@/i18n/routing";
import { commentMailLink } from "@/lib/comments-actions";

// Trang của `AUTOXIDE_COMMENTS_VERIFY_URL` (core): `/comments/verify?token={token}`.

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function VerifyPage(props: PageProps<"/[locale]/comments/verify">) {
  const locale = (await props.params).locale as Locale;
  const { token } = await props.searchParams;
  const t = await getTranslations({ locale, namespace: "comments" });
  const value = typeof token === "string" ? token.slice(0, 2000) : "";
  return (
    <main id="main" className="wrap page-msg">
      <h1 className="dsp">{t("verifyTitle")}</h1>
      {value ? (
        <>
          <p className="muted">{t("verifyBody")}</p>
          <TokenAction
            action={commentMailLink}
            token={value}
            locale={locale}
            intent="verify"
            button={t("verifyButton")}
          />
        </>
      ) : (
        <p className="muted" role="alert">
          {t("linkInvalid")}
        </p>
      )}
    </main>
  );
}
