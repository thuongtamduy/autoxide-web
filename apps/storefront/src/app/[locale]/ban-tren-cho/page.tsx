import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SellForm } from "@/components/buyer/sell-form";
import { Icon } from "@/components/icon";
import { SampleMark } from "@/components/sample-mark";
import type { Locale } from "@/i18n/routing";
import { loadOptional } from "@/lib/core";
import { formatMoney } from "@/lib/format";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { siteIdentity } from "@/lib/site";
import { sampleDataEnabled, text } from "@/sample";
import { feesOn } from "@/sample/market";
import { vnDay } from "@/sample/shipping";

// Mời người bán (bản thiết kế `SellOn`): phí sàn đang hiệu lực, năm bước (đăng ký → xác thực danh tính
// → chấp nhận quy chế → mở gian hàng → sàn duyệt), giấy tờ cần có, hỏi nhanh, form đăng ký. Phí là
// dữ liệu có ngày hiệu lực (mẫu theo `seedFees` của trang quản trị, bước 46). Form dùng module `forms`
// thật của core khi khách có biểu mẫu khoá `ban-tren-cho`; chưa có thì form mẫu.

const FORM_KEY = "ban-tren-cho";
const STEPS = ["register", "kyc", "terms", "shop", "review"] as const;
const FAQ = ["payout", "tax", "cod", "dispute"] as const;

export async function generateMetadata(
  props: PageProps<"/[locale]/ban-tren-cho">,
): Promise<Metadata> {
  const locale = (await props.params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "sellOn" });
  const site = await siteIdentity(locale);
  const name = site.marketplace ?? site.name;
  return pageMetadata({
    locale,
    path: routes.sellOn(),
    title: t("title", { name }),
    description: t("lead", { name: site.name }),
  });
}

export default async function SellOnPage(props: PageProps<"/[locale]/ban-tren-cho">) {
  const locale = (await props.params).locale as Locale;
  const sample = sampleDataEnabled();
  const form = await loadOptional(locale, (client) =>
    client.GET("/api/v1/forms/public/{key}", {
      params: { path: { key: FORM_KEY }, query: { locale } },
    }),
  );
  // Không có dữ liệu mẫu (phí, các bước) và khách chưa có biểu mẫu: trang không có gì để hiện.
  if (!sample && !form) notFound();
  const t = await getTranslations({ locale, namespace: "sellOn" });
  const site = await siteIdentity(locale);
  const name = site.marketplace ?? site.name;
  const today = vnDay(new Date());
  const fees = feesOn(today);
  const commission = fees.find((f) => f.kind === "commission" && f.category === null);
  const special = fees.filter((f) => f.kind === "commission" && f.category !== null);
  const storage = fees.find((f) => f.kind === "storage");
  const percent = (bp: number | null) => (bp === null ? "" : `${bp / 100}%`);
  return (
    <main id="main" className="wrap so-page">
      <Breadcrumbs items={[{ label: name, href: routes.marketplace() }, { label: t("crumb") }]} />
      <div className="so-hero rise">
        <div className="so-hero-text">
          <h1 className="dsp">{t("title", { name })}</h1>
          <p className="muted">{t("lead", { name: site.name })}</p>
        </div>
        {sample ? (
          <dl className="card so-fees">
            <div>
              <dt>
                {t("fees.commission")}
                <SampleMark endpoint="GET /api/v1/marketplace/fee-rules/preview" step="46" />
              </dt>
              <dd>{t("fees.vatIncluded", { rate: percent(commission?.rate_bp ?? null) })}</dd>
            </div>
            {special.map((rule) => (
              <div key={rule.effective_from}>
                <dt>
                  {t("fees.category", {
                    category: text(rule.category ?? { vi: "", en: "" }, locale),
                  })}
                </dt>
                <dd>{percent(rule.rate_bp)}</dd>
              </div>
            ))}
            <div>
              <dt>{t("fees.open")}</dt>
              <dd className="price num">{formatMoney({ amount: 0, currency: "VND" }, locale)}</dd>
            </div>
            {storage?.fixed ? (
              <div>
                <dt>{t("fees.storage")}</dt>
                <dd>
                  <span className="price num">
                    {formatMoney({ amount: storage.fixed, currency: "VND" }, locale)}
                  </span>{" "}
                  {t("fees.perM3")}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>{t("fees.payout")}</dt>
              <dd>{t("fees.payoutValue")}</dd>
            </div>
            <p className="muted">{t("fees.note")}</p>
          </dl>
        ) : null}
      </div>

      {sample ? (
        <section aria-labelledby="so-steps">
          <h2 className="dsp so-h2" id="so-steps">
            {t("steps.title")}
          </h2>
          <ol className="so-steps">
            {STEPS.map((step, index) => (
              <li className="card" key={step}>
                <span className="dsp num so-step-n">{index + 1}</span>
                <b>{t(`steps.${step}`)}</b>
                <span className="muted">{t(`steps.${step}Text`, { name })}</span>
              </li>
            ))}
          </ol>
          <div className="so-req">
            <h3 className="dsp">{t("requirements.title")}</h3>
            <ul>
              <li>
                <Icon name="user" small />
                {t("requirements.kyc")}
              </li>
              <li>
                <Icon name="doc" small />
                {t("requirements.license")}
              </li>
              <li>
                <Icon name="shield" small />
                {t("requirements.conditional")}
              </li>
              <li>
                <Icon name="card" small />
                {t("requirements.bank")}
              </li>
            </ul>
            <p className="muted">{t("requirements.law")}</p>
          </div>
        </section>
      ) : null}

      <section className="so-bottom" aria-labelledby="so-faq">
        <div className="so-faq">
          {sample ? (
            <>
              <h2 className="dsp so-h2" id="so-faq">
                {t("faq.title")}
              </h2>
              {FAQ.map((q) => (
                <details key={q} className="so-q">
                  <summary>{t(`faq.${q}`)}</summary>
                  <p className="muted">{t(`faq.${q}Answer`, { name: site.name })}</p>
                </details>
              ))}
            </>
          ) : (
            <h2 className="dsp so-h2" id="so-faq">
              {t("form.title")}
            </h2>
          )}
        </div>
        <SellForm locale={locale} form={form?.data ?? null} />
      </section>
    </main>
  );
}
