import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Icon } from "@/components/icon";
import { PostList, TopicChips } from "@/components/post-list";
import type { Locale } from "@/i18n/routing";
import { listPosts, listTopics } from "@/lib/content";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { siteIdentity } from "@/lib/site";

// Danh sách bài viết (mục blog của website, D-200): bài đã đăng mới nhất trước, 12 bài một trang.

export async function generateMetadata(props: PageProps<"/[locale]/blog">): Promise<Metadata> {
  const locale = (await props.params).locale as Locale;
  const { cursor } = await props.searchParams;
  const site = await siteIdentity(locale);
  const t = await getTranslations({ locale, namespace: "blog" });
  return pageMetadata({
    locale,
    path: routes.blog(),
    title: site.blogName,
    description: t("intro"),
    // Trang sau của danh sách không vào chỉ mục (nội dung trùng với trang bài).
    noindex: typeof cursor === "string",
  });
}

export default async function BlogPage(props: PageProps<"/[locale]/blog">) {
  const locale = (await props.params).locale as Locale;
  const { cursor } = await props.searchParams;
  const after = typeof cursor === "string" ? cursor.slice(0, 500) : undefined;
  const site = await siteIdentity(locale);
  const t = await getTranslations({ locale, namespace: "blog" });
  const [page, topics] = await Promise.all([
    listPosts(locale, after ? { cursor: after } : {}),
    listTopics(locale),
  ]);
  const posts = page?.data ?? [];
  return (
    <main id="main" className="wrap bl-page">
      <header className="bl-head">
        <Breadcrumbs items={[{ label: site.blogName }]} />
        <h1 className="dsp bl-title">{site.blogName}</h1>
        <p className="bl-intro">{t("intro")}</p>
        <a className="lnk bl-rss" href={locale === "vi" ? "/feed.xml" : `/${locale}/feed.xml`}>
          <Icon name="rss" small />
          {t("rss")}
        </a>
      </header>
      <TopicChips topics={topics?.data ?? []} label={t("topics")} />
      <PostList
        posts={posts}
        locale={locale}
        basePath={routes.blog()}
        nextCursor={page?.pagination.next_cursor ?? null}
        isFirstPage={!after}
        emptyText={t("empty")}
      />
    </main>
  );
}
