import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductView } from "@/components/product/product-view";
import type { Locale } from "@/i18n/routing";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { siteIdentity } from "@/lib/site";
import { sampleDataEnabled, text } from "@/sample";
import { productBySlug } from "@/sample/catalog";
import { productDetail } from "@/sample/product-detail";
import { readStore } from "@/sample/server";

// Trang sản phẩm (bản thiết kế `Product`). Thay `productBySlug` bằng
// `GET /api/v1/catalog/public/products/by-slug/{slug}` (bước 41) khi core có; 404 như nhau.

function findProduct(slug: string) {
  return sampleDataEnabled() ? productBySlug(decodeURIComponent(slug)) : undefined;
}

export async function generateMetadata(
  props: PageProps<"/[locale]/san-pham/[slug]">,
): Promise<Metadata> {
  const { locale: raw, slug } = await props.params;
  const locale = raw as Locale;
  const product = findProduct(slug);
  if (!product) return {};
  return pageMetadata({
    locale,
    path: routes.product(text(product.slugs, locale)),
    alternates: {
      vi: routes.product(product.slugs.vi),
      en: routes.product(product.slugs.en),
    },
    title: text(product.names, locale),
    description: text(productDetail(product.key).summary, locale),
  });
}

export default async function ProductPage(props: PageProps<"/[locale]/san-pham/[slug]">) {
  const { locale, slug } = await props.params;
  const product = findProduct(slug);
  if (!product) notFound();
  const { sku } = await props.searchParams;
  const site = await siteIdentity(locale);
  return (
    <ProductView
      locale={locale as Locale}
      product={product}
      sku={typeof sku === "string" ? sku : null}
      site={site}
      store={await readStore()}
      now={Date.now()}
    />
  );
}
