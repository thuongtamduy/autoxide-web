import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Art, Icon } from "@/components/icon";
import { ProductCard } from "@/components/product-card";
import { SampleMark } from "@/components/sample-mark";
import { SectionHeader } from "@/components/section-header";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatRating } from "@/lib/format";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { siteIdentity } from "@/lib/site";
import { sampleDataEnabled, text } from "@/sample";
import { SELLER_PRODUCTS, SELLER_PROFILES, sellerOpen } from "@/sample/market";
import { sellerProductCard } from "@/sample/market-view";

// Trang của sàn: người bán đang bán (đã xác thực, không bị tạm khoá) và vài sản phẩm của họ, lối vào
// "Bán trên sàn". Mẫu (W-030); thay bằng `GET /api/v1/marketplace/public/sellers` (bước 46) và
// `GET /api/v1/catalog/public/products?owner_kind=seller` (bước 41).

export async function generateMetadata(props: PageProps<"/[locale]/nguoi-ban">): Promise<Metadata> {
  const locale = (await props.params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "market" });
  const site = await siteIdentity(locale);
  const name = site.marketplace ?? site.name;
  return pageMetadata({
    locale,
    path: routes.marketplace(),
    title: name,
    description: t("lead", { name }),
  });
}

export default async function MarketplacePage(props: PageProps<"/[locale]/nguoi-ban">) {
  const locale = (await props.params).locale as Locale;
  if (!sampleDataEnabled()) notFound();
  const t = await getTranslations({ locale, namespace: "market" });
  const site = await siteIdentity(locale);
  const name = site.marketplace ?? site.name;
  const sellers = SELLER_PROFILES.filter(sellerOpen);
  const picks = sellers
    .flatMap((seller) => SELLER_PRODUCTS.filter((p) => p.seller === seller.slug).slice(0, 2))
    .slice(0, 6);
  return (
    <main id="main" className="wrap mk-page">
      <Breadcrumbs items={[{ label: name }]} />
      <header className="mk-head rise">
        <h1 className="dsp">
          {name}
          <SampleMark endpoint="GET /api/v1/marketplace/public/sellers" step="46" />
        </h1>
        <p className="muted">{t("lead", { name })}</p>
        <Link className="btn" href={routes.sellOn()}>
          {t("sell", { name })}
        </Link>
      </header>
      <section aria-labelledby="mk-sellers">
        <SectionHeader id="mk-sellers" title={t("sellers")} sub={t("sellersSub")} />
        <div className="sgrid">
          {sellers.map((seller) => (
            <Link className="card" href={routes.seller(seller.slug)} key={seller.slug}>
              <span className={`thumb seller-thumb ${seller.tone}`}>
                <Art name={seller.art} />
              </span>
              <span className="sbody">
                <span className="seller-name">{seller.display_name}</span>
                <span className="muted">{text(seller.description, locale)}</span>
                <span className="seller-meta">
                  <span className="badge b-ok seller-badge">
                    <Icon name="check" />
                    {t("verified")}
                  </span>
                  <span className="muted">
                    {t("meta", {
                      rating: formatRating(seller.rating?.average ?? 0, locale),
                      count: seller.product_count,
                    })}
                  </span>
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section aria-labelledby="mk-picks">
        <SectionHeader id="mk-picks" title={t("picks")} />
        <div className="g6 mk-picks">
          {picks.map((product) => (
            <ProductCard
              key={product.sku}
              product={sellerProductCard(product, locale, true)}
              locale={locale}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
