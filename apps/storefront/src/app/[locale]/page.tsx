import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  BestSellers,
  CategoryTiles,
  CouponBand,
  MarketplaceBand,
  MealSection,
  PlainHero,
  PostsSection,
  SampleHero,
  StoresSection,
} from "@/components/home/home-sections";
import type { Locale } from "@/i18n/routing";
import { latestPosts } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";
import { siteIdentity } from "@/lib/site";
import { sampleDataEnabled } from "@/sample";
import { readStore } from "@/sample/server";

// Trang chủ (bản thiết kế `Main`). Bật dữ liệu mẫu: lời mở đầu, danh mục, mã giảm giá, bán chạy,
// "Hôm nay nấu gì?", cửa hàng, sàn — rồi bài viết thật. Tắt: lời mở đầu chung và bài viết thật.

export async function generateMetadata(props: PageProps<"/[locale]">): Promise<Metadata> {
  const locale = (await props.params).locale as Locale;
  const site = await siteIdentity(locale);
  const t = await getTranslations({ locale, namespace: "site" });
  return {
    ...pageMetadata({
      locale,
      path: "/",
      title: site.name,
      description: t("description", { name: site.name }),
    }),
    title: { absolute: site.name },
  };
}

export default async function HomePage(props: PageProps<"/[locale]">) {
  const locale = (await props.params).locale as Locale;
  const site = await siteIdentity(locale);
  const sample = sampleDataEnabled();
  const store = await readStore();
  const posts = (await latestPosts(locale, 3))?.data ?? [];
  return (
    <main id="main" className="home">
      {sample ? (
        <SampleHero locale={locale} />
      ) : (
        <PlainHero name={site.name} blogName={site.blogName} />
      )}
      {sample ? (
        <>
          <CategoryTiles locale={locale} />
          <CouponBand locale={locale} />
          <BestSellers locale={locale} store={store} />
          <MealSection locale={locale} />
          <StoresSection locale={locale} store={store} />
          <MarketplaceBand locale={locale} />
        </>
      ) : null}
      <PostsSection locale={locale} posts={posts} blogName={site.blogName} />
    </main>
  );
}
