import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AddToCart } from "@/components/add-to-cart";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Countdown } from "@/components/deals/countdown";
import { CopyCode } from "@/components/home/copy-code";
import { Art, Icon } from "@/components/icon";
import { Price } from "@/components/price";
import { SampleAction } from "@/components/sample-action";
import { SampleMark } from "@/components/sample-mark";
import { SectionHeader } from "@/components/section-header";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { vietnamTime } from "@/lib/countdown";
import { vietnamDay } from "@/lib/delivery";
import { formatDate, keepUnits } from "@/lib/format";
import { discountPercent, remainingPercent } from "@/lib/promo";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { sampleDataEnabled, text } from "@/sample";
import { productBySku, storeByCode, variantBySku } from "@/sample/catalog";
import { flashSale, LEGAL_LIMIT, NOTICE_RULE, publicPrograms } from "@/sample/deals";

// Trang "Khuyến mại" (bản thiết kế `Deals`): flash sale có đếm ngược (giờ tương đối với bây giờ),
// mã giảm giá công khai, chương trình tự áp, và thông tin pháp lý (thông báo Sở Công Thương, trần
// mức giảm có ngày hiệu lực). Dữ liệu mẫu tới khi core có `promotions` (bước 43).

export async function generateMetadata(
  props: PageProps<"/[locale]/khuyen-mai">,
): Promise<Metadata> {
  const locale = (await props.params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "deals" });
  return pageMetadata({ locale, path: routes.deals(), title: t("title"), description: t("lead") });
}

export default async function DealsPage(props: PageProps<"/[locale]/khuyen-mai">) {
  if (!sampleDataEnabled()) notFound();
  const locale = (await props.params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "deals" });
  const tt = await getTranslations({ locale, namespace: "time" });
  const tp = await getTranslations({ locale, namespace: "product" });
  const now = Date.now();
  const flash = flashSale(now);
  const programs = publicPrograms(now);
  const running = now >= flash.starts_at && now < flash.ends_at;
  const day = (at: number) => {
    const d = vietnamDay(at);
    return `${tt(`l${d.weekday}`)} ${d.dayMonth}`;
  };
  const when = (startIso: string, endIso: string) => {
    const start = Date.parse(startIso);
    return start > now
      ? t("from", { time: vietnamTime(start), day: day(start), until: formatDate(endIso, locale) })
      : t("until", { date: formatDate(endIso, locale) });
  };
  const code = programs.find((p) => p.kind === "code");
  const automatic = programs.filter((p) => p.kind !== "code");
  const flashWindow = t("window", {
    start: vietnamTime(flash.starts_at),
    end: vietnamTime(flash.ends_at),
    day: day(flash.starts_at),
  });
  // Bảng chương trình và số thông báo Sở Công Thương (giảm phí giao: luật không bắt thông báo).
  const rows = [
    ...programs.map((p) => ({
      id: p.id,
      title: text(p.title, locale),
      when: when(p.starts_at, p.ends_at),
      ref:
        p.kind === "free_shipping"
          ? t("noNotice")
          : p.notice
            ? t("noticeRef", { ref: p.notice })
            : t("noticeBefore"),
    })),
    { id: flash.id, title: text(flash.title, locale), when: flashWindow, ref: t("noticeBefore") },
  ];

  return (
    <main id="main" className="wrap dl-page">
      <Breadcrumbs items={[{ label: t("title") }]} />
      <header className="rise dl-head">
        <h1 className="dsp dl-title">{t("title")}</h1>
        <p className="dl-lead">{t("lead")}</p>
      </header>

      <section className="dl-sec dl-flash" aria-labelledby="dl-flash-h">
        <div className="dl-flash-head">
          <h2 id="dl-flash-h" className="dsp dl-h2">
            <Icon name="bolt" />
            {text(flash.title, locale)}
            <SampleMark endpoint="GET /api/v1/promotions/public/promotions/flash-sales" step="43" />
          </h2>
          <Countdown start={flash.starts_at} end={flash.ends_at} now={now} />
          <span className="muted dl-window">{flashWindow}</span>
          <span className="cat-gap" />
          {running ? null : (
            <SampleAction
              label={t("remind")}
              doneLabel={t("reminded")}
              message={t("remindSample")}
              icon="clock"
            />
          )}
        </div>
        <p className="muted dl-note">
          {text(flash.terms, locale)} {t("flashRules")}
        </p>
        <div className="pgrid g4 dl-grid">
          {flash.items.map((item) => {
            const product = productBySku(item.sku);
            const variant = variantBySku(item.sku);
            if (!product || !variant) return null;
            const name = keepUnits(
              `${text(product.names, locale)}${variant.labels ? ` ${text(variant.labels, locale)}` : ""}`,
            );
            const href = `${routes.product(text(product.slugs, locale))}?sku=${encodeURIComponent(item.sku)}`;
            const left = item.limit - item.used;
            return (
              <div className="pcard dl-card" key={item.sku}>
                <Link
                  href={href}
                  className={`thumb ${product.tone}`}
                  aria-label={name}
                  tabIndex={-1}
                >
                  <Art name={product.art} />
                  <span className="flag">
                    <span className="badge b-sale">
                      −{discountPercent(item.reference, item.sale)}%
                    </span>
                  </span>
                </Link>
                <span className="pc-body">
                  <Link href={href} className="pc-name">
                    {name}
                  </Link>
                  <span className="pc-price">
                    <Price money={{ amount: item.sale, currency: "VND" }} locale={locale} sale />
                    <Price
                      money={{ amount: item.reference, currency: "VND" }}
                      locale={locale}
                      was
                    />
                  </span>
                  <span className="dl-bar" aria-hidden="true">
                    <span
                      style={{ width: `${running ? remainingPercent(left, item.limit) : 100}%` }}
                    />
                  </span>
                  <span className="muted dl-left">
                    {running
                      ? t("left", { left, total: item.limit })
                      : t("quota", { total: item.limit })}
                  </span>
                  {running ? (
                    <AddToCart
                      skus={[item.sku]}
                      className="btn sm pri"
                      label={tp("addNamed", { name })}
                      done={tp("added", { name })}
                    >
                      {tp("add")}
                    </AddToCart>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
        <p className="muted dl-note">{t("referenceNote", { max: LEGAL_LIMIT.max_percent })}</p>
      </section>

      {code?.code ? (
        <section className="dl-sec" aria-labelledby="dl-codes-h">
          <SectionHeader
            id="dl-codes-h"
            title={t("codes")}
            mark={<SampleMark endpoint="GET /api/v1/promotions/public/promotions" step="43" />}
          />
          <div className="coupon dl-coupon">
            <div className="coupon-text">
              <span className="coupon-kick">{when(code.starts_at, code.ends_at)}</span>
              <span className="dsp coupon-title">{text(code.title, locale)}</span>
              <span className="coupon-terms">
                {text(code.terms, locale)}{" "}
                {code.remaining !== null ? t("usesLeft", { count: code.remaining }) : null}
              </span>
            </div>
            <CopyCode code={code.code} />
          </div>
          <p className="muted dl-note">{t("codeHow")}</p>
        </section>
      ) : null}

      <section className="dl-sec" aria-labelledby="dl-auto-h">
        <SectionHeader id="dl-auto-h" title={t("automatic")} sub={t("automaticSub")} />
        <div className={`g3 dl-programs n${automatic.length}`}>
          {automatic.map((program) => {
            const upcoming = Date.parse(program.starts_at) > now;
            return (
              <article className="card dl-program" key={program.id}>
                <span className="dl-program-h">
                  <span className={`badge ${upcoming ? "b-brand" : "b-ok"}`}>
                    {upcoming ? t("soon") : t("running")}
                  </span>
                  {program.store ? (
                    <span className="badge b-plain">
                      {text(storeByCode(program.store).name, locale)}
                    </span>
                  ) : null}
                </span>
                <h3 className="dsp dl-program-t">{text(program.title, locale)}</h3>
                <p className="muted">{text(program.terms, locale)}</p>
                <span className="dl-program-f">
                  <span>{when(program.starts_at, program.ends_at)}</span>
                  {program.remaining !== null ? (
                    <span className="muted">{t("giftsLeft", { count: program.remaining })}</span>
                  ) : null}
                </span>
              </article>
            );
          })}
        </div>
      </section>

      <section className="dl-legal" aria-labelledby="dl-legal-h">
        <h2 id="dl-legal-h" className="dsp dl-h3">
          {t("legalTitle")}
        </h2>
        <ul className="dl-list">
          {rows.map((row) => (
            <li key={row.id}>
              <b>{row.title}</b>
              <span className="muted">{row.when}</span>
              <span className="muted dl-ref">{row.ref}</span>
            </li>
          ))}
        </ul>
        <p className="muted dl-note">
          {t("legalNotice", { basis: NOTICE_RULE.basis })}{" "}
          {t("legalCap", {
            max: LEGAL_LIMIT.max_percent,
            basis: LEGAL_LIMIT.basis,
            from: formatDate(`${LEGAL_LIMIT.effective_from}T12:00:00Z`, locale),
          })}{" "}
          {LEGAL_LIMIT.needs_review || NOTICE_RULE.needs_review ? t("needsReview") : null}
        </p>
      </section>
    </main>
  );
}
