import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CategoryView, hasListingQuery } from "@/components/category/category-view";
import type { Locale } from "@/i18n/routing";
import { parseListing } from "@/lib/listing";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { sampleDataEnabled } from "@/sample";

// "Tất cả sản phẩm": mọi sản phẩm website bán, cùng bộ lọc với trang danh mục. Chỉ có khi bật dữ
// liệu mẫu (core chưa có catalog, bước 41).

export async function generateMetadata(props: PageProps<"/[locale]/danh-muc">): Promise<Metadata> {
  const locale = (await props.params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "listing" });
  const filter = parseListing(await props.searchParams);
  return pageMetadata({
    locale,
    path: routes.catalog(),
    title: t("all"),
    description: t("leadAll", { name: t("all") }),
    // Trang đã lọc, đã sắp hay trang sau: không vào chỉ mục (trùng nội dung trang gốc).
    noindex: hasListingQuery(filter),
  });
}

export default async function CatalogPage(props: PageProps<"/[locale]/danh-muc">) {
  if (!sampleDataEnabled()) notFound();
  const locale = (await props.params).locale as Locale;
  const filter = parseListing(await props.searchParams);
  return <CategoryView locale={locale} category={null} filter={filter} />;
}
