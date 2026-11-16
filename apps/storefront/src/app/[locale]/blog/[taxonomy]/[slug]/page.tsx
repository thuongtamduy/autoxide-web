import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArticleView, PageView } from "@/components/article-view";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PostList } from "@/components/post-list";
import type { Locale } from "@/i18n/routing";
import { getTerm, isTaxonomy, listPosts } from "@/lib/content";
import { entryAt, entryMetadata, joinPath } from "@/lib/entry-page";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { siteIdentity } from "@/lib/site";

// Trang của một danh mục hay thẻ (`/blog/category/<slug>`, `/blog/tag/<slug>`): mô tả và các bài
// của nó. Đoạn giữa không phải `category` / `tag` thì là địa chỉ nội dung thường (core quyết).

type Props = PageProps<"/[locale]/blog/[taxonomy]/[slug]">;

async function load(props: Props) {
  const { locale: raw, taxonomy, slug } = await props.params;
  const locale = raw as Locale;
  if (!isTaxonomy(taxonomy)) {
    return {
      kind: "entry" as const,
      locale,
      entry: await entryAt(locale, joinPath(["blog", taxonomy, slug])),
    };
  }
  const term = (await getTerm(locale, taxonomy, decodeURIComponent(slug)))?.data;
  if (!term) notFound();
  return { kind: "term" as const, locale, term, taxonomy };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const found = await load(props);
  if (found.kind === "entry") return entryMetadata(found.entry, found.locale);
  const { cursor } = await props.searchParams;
  return pageMetadata({
    locale: found.locale,
    path: routes.term(found.taxonomy, found.term.slug),
    title: found.term.meta_title || found.term.name,
    description: found.term.meta_description || found.term.description,
    alternates: Object.fromEntries(
      found.term.translations.map((tr) => [
        tr.locale,
        routes.term(found.taxonomy, tr.path.split("/").pop() ?? tr.path),
      ]),
    ),
    noindex: typeof cursor === "string",
  });
}

export default async function TermPage(props: Props) {
  const found = await load(props);
  const { locale } = found;
  if (found.kind === "entry") {
    return found.entry.kind === "page" ? (
      <PageView entry={found.entry} locale={locale} />
    ) : (
      <ArticleView entry={found.entry} locale={locale} site={await siteIdentity(locale)} />
    );
  }
  const { term, taxonomy } = found;
  const { cursor } = await props.searchParams;
  const after = typeof cursor === "string" ? cursor.slice(0, 500) : undefined;
  const site = await siteIdentity(locale);
  const t = await getTranslations({ locale, namespace: "blog" });
  const page = await listPosts(locale, { termId: term.id, ...(after ? { cursor: after } : {}) });
  return (
    <main id="main" className="wrap bl-page">
      <header className="bl-head">
        <Breadcrumbs
          items={[{ label: site.blogName, href: routes.blog() }, { label: term.name }]}
        />
        <span className="kick">{t(taxonomy)}</span>
        <h1 className="dsp bl-title">{taxonomy === "tag" ? `#${term.name}` : term.name}</h1>
        {term.description ? <p className="bl-intro">{term.description}</p> : null}
      </header>
      <PostList
        posts={page?.data ?? []}
        locale={locale}
        basePath={routes.term(taxonomy, term.slug)}
        nextCursor={page?.pagination.next_cursor ?? null}
        isFirstPage={!after}
        emptyText={t("termEmpty")}
      />
    </main>
  );
}
