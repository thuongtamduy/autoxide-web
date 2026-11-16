import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PreferencesForm } from "@/components/preferences-form";
import type { Locale } from "@/i18n/routing";
import { loadOptional } from "@/lib/core";

// Trang của `AUTOXIDE_NEWSLETTER_PREFERENCES_URL` (core): `/newsletter/preferences?token={token}`.

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PreferencesPage(
  props: PageProps<"/[locale]/newsletter/preferences">,
) {
  const locale = (await props.params).locale as Locale;
  const { token } = await props.searchParams;
  const t = await getTranslations({ locale, namespace: "newsletter.preferences" });
  const value = typeof token === "string" ? token.slice(0, 2000) : "";
  const prefs = value
    ? (
        await loadOptional(locale, (client) =>
          client.GET("/api/v1/newsletter/public/preferences", {
            params: { query: { token: value } },
          }),
        )
      )?.data
    : null;
  const pick = (text: { en?: string | null; vi?: string | null }) =>
    (locale === "en" ? text.en || text.vi : text.vi || text.en) ?? "";
  return (
    <main id="main" className="wrap page-msg">
      <h1 className="dsp">{t("title")}</h1>
      {prefs ? (
        <>
          <p className="muted">{t("body", { email: prefs.email })}</p>
          <PreferencesForm
            token={value}
            locale={locale}
            lists={prefs.lists.map((list) => ({
              key: list.key,
              name: pick(list.name),
              description: pick(list.description),
              subscribed: list.subscribed,
              status: list.status ?? null,
            }))}
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
