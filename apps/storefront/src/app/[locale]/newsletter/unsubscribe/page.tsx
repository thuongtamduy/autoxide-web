import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TokenAction } from "@/components/token-action";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { savePreferences } from "@/lib/newsletter-actions";

// Huỷ mọi danh sách bằng một nút, với token của trang tuỳ chọn (`AUTOXIDE_NEWSLETTER_PREFERENCES_URL`).
// Huỷ một chạm của ứng dụng thư (`List-Unsubscribe`) thì ứng dụng thư gọi thẳng core, không qua đây.

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function UnsubscribePage(
  props: PageProps<"/[locale]/newsletter/unsubscribe">,
) {
  const locale = (await props.params).locale as Locale;
  const { token } = await props.searchParams;
  const t = await getTranslations({ locale, namespace: "newsletter" });
  const value = typeof token === "string" ? token.slice(0, 2000) : "";
  return (
    <main id="main" className="wrap page-msg">
      <h1 className="dsp">{t("unsubscribe.title")}</h1>
      {value ? (
        <>
          <p className="muted">{t("unsubscribe.body")}</p>
          <TokenAction
            action={savePreferences}
            token={value}
            locale={locale}
            intent="all"
            button={t("unsubscribe.button")}
          />
          <Link className="lnk" href={`/newsletter/preferences?token=${encodeURIComponent(value)}`}>
            {t("unsubscribe.preferences")}
          </Link>
        </>
      ) : (
        <p className="muted" role="alert">
          {t("preferences.invalid")}
        </p>
      )}
    </main>
  );
}
