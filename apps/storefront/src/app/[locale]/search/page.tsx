import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Icon } from "@/components/icon";
import { ProductCard } from "@/components/product-card";
import { SampleMark } from "@/components/sample-mark";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { searchContent } from "@/lib/content";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { sampleDataEnabled } from "@/sample";
import { searchProducts } from "@/sample/catalog";
import { readStore } from "@/sample/server";
import { productCard } from "@/sample/view";

// Tìm kiếm: bài viết và trang (core thật, `GET /api/v1/content/public/search` — theo nghĩa khi bật
// embeddings, và theo chữ, bỏ dấu) cùng sản phẩm (mẫu, tới khi catalog của core có tìm kiếm).

export async function generateMetadata(props: PageProps<"/[locale]/search">): Promise<Metadata> {
  const locale = (await props.params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "search" });
  // Trang kết quả tìm kiếm không vào chỉ mục của máy tìm kiếm.
  return pageMetadata({ locale, path: routes.search(), title: t("title"), noindex: true });
}

export default async function SearchPage(props: PageProps<"/[locale]/search">) {
  const locale = (await props.params).locale as Locale;
  const { q: raw } = await props.searchParams;
  const q = (typeof raw === "string" ? raw : "").trim().slice(0, 200);
  const t = await getTranslations({ locale, namespace: "search" });
  const sample = sampleDataEnabled();
  const hits = q ? await searchContent(locale, q) : [];
  const store = await readStore();
  const products =
    q && sample ? searchProducts(q, locale, 8).map((p) => productCard(p, store, locale)) : [];
  return (
    <main id="main" className="wrap sr-page">
      <header className="bl-head">
        <Breadcrumbs items={[{ label: t("title") }]} />
        <h1 className="dsp bl-title">{q ? t("resultsFor", { q }) : t("title")}</h1>
        <search>
          <form
            className="sr-form"
            action={getPathname({ href: routes.search(), locale })}
            method="get"
          >
            <label className="hs-field sr-field">
              <Icon name="search" className="hs-ic" />
              <input
                className="inp"
                type="search"
                name="q"
                defaultValue={q}
                maxLength={200}
                aria-label={t("label")}
              />
            </label>
            <button className="btn pri" type="submit">
              {t("submit")}
            </button>
          </form>
        </search>
        <p className="help">{t("hint")}</p>
      </header>
      {!q ? <p className="empty">{t("start")}</p> : null}
      {q && hits.length === 0 && products.length === 0 ? (
        <p className="empty">{t("none", { q })}</p>
      ) : null}
      {products.length > 0 ? (
        <section className="sr-sec" aria-labelledby="sr-products">
          <h2 id="sr-products" className="dsp sr-h">
            {t("products")}
            <SampleMark endpoint="GET /api/v1/catalog/public/products?q" step="41" />
          </h2>
          <div className="pgrid g4 sr-products">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} locale={locale} />
            ))}
          </div>
        </section>
      ) : null}
      {q && (hits.length > 0 || products.length > 0) ? (
        <section className="sr-sec" aria-labelledby="sr-content">
          <h2 id="sr-content" className="dsp sr-h">
            {t("content")}
          </h2>
          {hits.length === 0 ? (
            <p className="muted">{t("noContent")}</p>
          ) : (
            <ol className="sr-hits">
              {hits.map((hit) => (
                <li key={hit.id}>
                  <span className="badge b-plain">
                    {hit.kind === "page" ? t("page") : t("post")}
                  </span>
                  <Link className="sr-title" href={hit.path}>
                    {hit.title}
                  </Link>
                  {hit.snippet ? <p className="sr-snippet">{hit.snippet}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
    </main>
  );
}
