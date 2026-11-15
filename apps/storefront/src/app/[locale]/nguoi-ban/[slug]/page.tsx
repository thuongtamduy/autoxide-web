import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Art, Icon, type IconName } from "@/components/icon";
import { ProductCard } from "@/components/product-card";
import { Rating } from "@/components/rating";
import { SampleMark } from "@/components/sample-mark";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatMoney, formatRating, initials, keepUnits } from "@/lib/format";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { siteIdentity } from "@/lib/site";
import { sampleDataEnabled, text } from "@/sample";
import {
  ratingDistribution,
  sellerBySlug,
  sellerOpen,
  sellerProductBySku,
  sellerProducts,
  sellerReviews,
} from "@/sample/market";
import { sellerProductCard } from "@/sample/market-view";

// Gian hàng của một người bán trên sàn (bản thiết kế `Seller`): đầu gian hàng, ba mục sản phẩm / đánh
// giá / chính sách (`?tab=`, lọc nhóm hàng `?loai=`, đều là link thật), thông tin người bán bắt buộc
// công khai theo Luật Thương mại điện tử 2025 và cách sàn bảo vệ người mua. Mẫu (W-030); thay bằng
// `GET /api/v1/marketplace/public/sellers/{slug}` và `…/reviews` (bước 46).

const TABS = ["san-pham", "danh-gia", "chinh-sach"] as const;
type Tab = (typeof TABS)[number];
const TAB_KEY: Record<Tab, string> = {
  "san-pham": "products",
  "danh-gia": "reviews",
  "chinh-sach": "policies",
};

export async function generateMetadata(
  props: PageProps<"/[locale]/nguoi-ban/[slug]">,
): Promise<Metadata> {
  const { locale: raw, slug } = await props.params;
  const locale = raw as Locale;
  const seller = sampleDataEnabled() ? sellerBySlug(slug) : undefined;
  if (!seller) return {};
  const t = await getTranslations({ locale, namespace: "seller" });
  return pageMetadata({
    locale,
    path: routes.seller(seller.slug),
    title: seller.display_name,
    // Gian hàng chưa bán được không vào chỉ mục của máy tìm kiếm.
    noindex: !sellerOpen(seller),
    description: t("description", {
      name: seller.display_name,
      about: text(seller.description, locale),
    }),
  });
}

export default async function SellerPage(props: PageProps<"/[locale]/nguoi-ban/[slug]">) {
  const { locale: raw, slug } = await props.params;
  const locale = raw as Locale;
  const seller = sampleDataEnabled() ? sellerBySlug(slug) : undefined;
  if (!seller) notFound();
  const t = await getTranslations({ locale, namespace: "seller" });
  const site = await siteIdentity(locale);
  const query = await props.searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(String(query.tab))
    ? (query.tab as Tab)
    : "san-pham";
  const kind = seller.kinds.some((k) => k.key === query.loai) ? String(query.loai) : null;
  const open = sellerOpen(seller);
  const all = sellerProducts(seller.slug);
  const products = kind ? all.filter((p) => p.kind === kind) : all;
  const reviews = sellerReviews(seller.slug);
  const dist = ratingDistribution(seller);
  const marketplace = site.marketplace ?? site.name;
  const typeLabel = t(`type.${seller.seller_type}`);
  const tabHref = (key: Tab) =>
    key === "san-pham" ? routes.seller(seller.slug) : `${routes.seller(seller.slug)}?tab=${key}`;

  const policies: { icon: IconName; title: string; text: string }[] = [
    {
      icon: "ret",
      title: t("policy.returns"),
      text: t("policy.returnsText", { market: marketplace }),
    },
    {
      icon: "truck",
      title: t("policy.shipping", {
        from: text(seller.ships_from, locale),
        min: seller.ship_days[0],
        max: seller.ship_days[1],
      }),
      text: t(seller.fulfillment === "self" ? "policy.shippingSelf" : "policy.shippingPlatform", {
        fee: formatMoney({ amount: seller.ship_fee, currency: "VND" }, locale),
        market: marketplace,
      }),
    },
    {
      icon: "doc",
      title: t("policy.tax"),
      text: t(seller.seller_type === "enterprise" ? "policy.taxEnterprise" : "policy.taxHousehold"),
    },
    {
      icon: "chat",
      title: t("policy.dispute"),
      text: t("policy.disputeText", { market: marketplace }),
    },
  ];

  return (
    <main id="main" className="wrap sl-page">
      <Breadcrumbs
        items={[{ label: marketplace, href: routes.marketplace() }, { label: seller.display_name }]}
      />
      <section className="sl-head rise" aria-labelledby="sl-name">
        <span className={`thumb sl-banner ${seller.tone}`} aria-hidden="true">
          <Art name={seller.art} />
        </span>
        <div className="sl-id">
          <span className="dsp sl-logo" aria-hidden="true">
            {initials(seller.display_name)}
          </span>
          <div className="seller-head sl-text">
            <h1 className="dsp" id="sl-name">
              {seller.display_name}
              <SampleMark endpoint="GET /api/v1/marketplace/public/sellers/{slug}" step="46" />
            </h1>
            <p className="muted">{text(seller.description, locale)}</p>
            <span className="sl-badges">
              {seller.legal.verified_on ? (
                <span className="badge b-ok">
                  <Icon name="check" small />
                  {t("verified")}
                </span>
              ) : (
                <span className="badge b-warn">{t("notVerified")}</span>
              )}
              {open && seller.on_time_percent >= 95 ? (
                <span className="badge b-brand">
                  {t("trusted", { percent: seller.on_time_percent })}
                </span>
              ) : null}
              {seller.rating ? (
                <Rating value={seller.rating.average} count={seller.rating.count} locale={locale} />
              ) : null}
              <span className="muted">
                {t("meta", {
                  products: seller.product_count,
                  since: `${seller.joined.slice(5, 7)}/${seller.joined.slice(0, 4)}`,
                })}
              </span>
            </span>
          </div>
        </div>
      </section>

      {open ? null : (
        <div className="sl-paused" role="note">
          <Icon name="info" />
          <span>
            <b>{t(`${seller.status === "pending" ? "pending" : "paused"}.title`)}</b>{" "}
            {t(`${seller.status === "pending" ? "pending" : "paused"}.text`, {
              market: marketplace,
            })}
          </span>
        </div>
      )}

      <div className="sl-cols">
        <section className="sl-main" aria-label={t(`tabs.${TAB_KEY[tab]}`)}>
          <nav className="tabrow segtabs sl-tabs" aria-label={t("tabsLabel")}>
            {TABS.map((key) => (
              <Link
                key={key}
                href={tabHref(key)}
                className={`cat-a seg-tab${key === tab ? " on" : ""}`}
                aria-current={key === tab ? "page" : undefined}
              >
                <span className="st-long">{t(`tabs.${TAB_KEY[key]}`)}</span>
                <span className="st-short">{t(`tabs.${TAB_KEY[key]}`)}</span>
                <span className="st-meta">
                  {key === "san-pham"
                    ? t("tabMeta.products", { count: seller.product_count })
                    : key === "danh-gia"
                      ? t("tabMeta.reviews", { count: seller.rating?.count ?? 0 })
                      : t("tabMeta.policies")}
                </span>
              </Link>
            ))}
          </nav>

          {tab === "san-pham" ? (
            <>
              <nav className="chiprow sl-chips" aria-label={t("kinds")}>
                <Link
                  className={`chip${kind === null ? " on" : ""}`}
                  href={routes.seller(seller.slug)}
                  aria-current={kind === null ? "true" : undefined}
                >
                  {t("allKinds", { count: seller.product_count })}
                </Link>
                {seller.kinds.map((k) => (
                  <Link
                    key={k.key}
                    className={`chip${kind === k.key ? " on" : ""}`}
                    href={`${routes.seller(seller.slug)}?loai=${k.key}`}
                    aria-current={kind === k.key ? "true" : undefined}
                  >
                    {text(k.names, locale)} ({k.count})
                  </Link>
                ))}
              </nav>
              <div className="by-pgrid">
                {products.map((product) => (
                  <div id={product.sku.toLowerCase()} key={product.sku} className="sl-cell">
                    <ProductCard product={sellerProductCard(product, locale)} locale={locale} />
                    <span className="muted sl-sold">{t("sold", { count: product.sold })}</span>
                  </div>
                ))}
              </div>
              {products.length === 0 ? (
                <p className="muted">{t("noProducts", { market: marketplace })}</p>
              ) : null}
              <p className="muted sl-more">
                {t("shown", {
                  shown: products.length,
                  total: kind
                    ? (seller.kinds.find((k) => k.key === kind)?.count ?? products.length)
                    : seller.product_count,
                })}
              </p>
            </>
          ) : tab === "danh-gia" ? (
            <div className="sl-rev">
              <div className="sl-score card">
                <span>
                  <b className="dsp num sl-score-n">
                    {formatRating(seller.rating?.average ?? 0, locale)}
                  </b>
                  <span className="muted"> {t("outOf")}</span>
                </span>
                <span className="muted">
                  {t("reviewCount", { count: seller.rating?.count ?? 0 })}
                </span>
                <ul className="sl-bars" aria-label={t("distribution")}>
                  {dist.map((n, i) => {
                    const stars = 5 - i;
                    const pct = seller.rating?.count
                      ? Math.round((n / seller.rating.count) * 100)
                      : 0;
                    return (
                      <li key={stars}>
                        <span className="num">{t("stars", { stars })}</span>
                        <span className="sl-bar" aria-hidden="true">
                          <span className="sl-bar-fill" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="num muted">{n}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="sl-list">
                {reviews.length === 0 ? <p className="muted">{t("noReviews")}</p> : null}
                {reviews.map((review) => {
                  const product = sellerProductBySku(review.sku);
                  return (
                    <article className="card sl-item" key={review.id}>
                      <span className="sl-rhead">
                        <span
                          className="stars"
                          role="img"
                          aria-label={t("starsLabel", { stars: review.stars })}
                        >
                          {"★".repeat(review.stars)}
                          <span className="sl-dim">{"★".repeat(5 - review.stars)}</span>
                        </span>
                        <b>{review.author}</b>
                        <span className="badge b-ok">{t("bought")}</span>
                      </span>
                      <span className="muted">
                        {t("reviewMeta", {
                          days: review.days_ago,
                          item: product ? keepUnits(text(product.names, locale)) : review.sku,
                        })}
                      </span>
                      <p>{text(review.body, locale)}</p>
                      {review.reply ? (
                        <p className="sl-reply">
                          <b>{t("reply")}</b> {text(review.reply, locale)}
                        </p>
                      ) : null}
                      <span className="muted">{t("helpful", { count: review.helpful })}</span>
                    </article>
                  );
                })}
                <p className="muted">{t("reviewRule", { market: marketplace })}</p>
              </div>
            </div>
          ) : (
            <div className="g2 sl-policies">
              {policies.map((policy) => (
                <div className="card sl-policy" key={policy.title}>
                  <span className="sl-policy-h">
                    <Icon name={policy.icon} small />
                    <b>{policy.title}</b>
                  </span>
                  <span className="muted">{policy.text}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="sl-aside">
          <section className="card sl-info" aria-labelledby="sl-info-h">
            <h2 className="dsp" id="sl-info-h">
              {t("info.title")}
            </h2>
            <dl>
              <div>
                <dt>{t("info.name")}</dt>
                <dd>{seller.legal.name}</dd>
              </div>
              <div>
                <dt>{t("info.type")}</dt>
                <dd>{typeLabel}</dd>
              </div>
              <div>
                <dt>{t("info.taxCode")}</dt>
                <dd>{seller.legal.tax_code}</dd>
              </div>
              <div>
                <dt>{t("info.address")}</dt>
                <dd>{text(seller.legal.address, locale)}</dd>
              </div>
              <div>
                <dt>{t("info.contact")}</dt>
                <dd>{seller.legal.contact}</dd>
              </div>
              <div>
                <dt>{t("info.verified")}</dt>
                <dd>
                  {seller.legal.verified_on
                    ? t("info.verifiedOn", {
                        date: `${seller.legal.verified_on.slice(8, 10)}/${seller.legal.verified_on.slice(5, 7)}/${seller.legal.verified_on.slice(0, 4)}`,
                      })
                    : seller.status === "pending"
                      ? t("info.pending")
                      : t("info.reverify")}
                </dd>
              </div>
            </dl>
            <p className="muted">{t("info.law", { market: marketplace })}</p>
          </section>
          <section className="sl-protect" aria-labelledby="sl-protect-h">
            <h2 className="dsp" id="sl-protect-h">
              {t("protect.title")}
            </h2>
            <ul>
              <li>
                <Icon name="check" small />
                {t("protect.verified")}
              </li>
              <li>
                <Icon name="shield" small />
                {t("protect.money")}
              </li>
              <li>
                <Icon name="star" small />
                {t("protect.reviews")}
              </li>
            </ul>
            <Link className="lnk" href={routes.sellOn()}>
              {t("sellToo", { market: marketplace })}
            </Link>
          </section>
        </aside>
      </div>
    </main>
  );
}
