import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CategoryView, hasListingQuery } from "@/components/category/category-view";
import type { Locale } from "@/i18n/routing";
import { parseListing } from "@/lib/listing";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { sampleDataEnabled, text } from "@/sample";
import { categoryBySlug } from "@/sample/catalog";

// Trang danh mục sản phẩm (bản thiết kế `Category`). Slug theo ngôn ngữ (`slugs` của danh mục, như
// bài viết); slug của ngôn ngữ kia vẫn mở được, `canonical` trỏ về slug đúng ngôn ngữ.

export async function generateMetadata(
  props: PageProps<"/[locale]/danh-muc/[slug]">,
): Promise<Metadata> {
  const { locale: raw, slug } = await props.params;
  const locale = raw as Locale;
  const category = sampleDataEnabled() ? categoryBySlug(decodeURIComponent(slug)) : undefined;
  if (!category) return {};
  const t = await getTranslations({ locale, namespace: "listing" });
  const name = text(category.names, locale);
  const filter = parseListing(await props.searchParams);
  return pageMetadata({
    locale,
    path: routes.category(text(category.slugs, locale)),
    alternates: {
      vi: routes.category(category.slugs.vi),
      en: routes.category(category.slugs.en),
    },
    title: name,
    description: t("lead", { name }),
    noindex: hasListingQuery(filter),
  });
}

export default async function CategoryPage(props: PageProps<"/[locale]/danh-muc/[slug]">) {
  if (!sampleDataEnabled()) notFound();
  const { locale, slug } = await props.params;
  const category = categoryBySlug(decodeURIComponent(slug));
  if (!category) notFound();
  const filter = parseListing(await props.searchParams);
  return <CategoryView locale={locale as Locale} category={category} filter={filter} />;
}
