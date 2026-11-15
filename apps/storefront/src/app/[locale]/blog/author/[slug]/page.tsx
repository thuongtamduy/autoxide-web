import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { MediaImage } from "@/components/media-image";
import { PostList } from "@/components/post-list";
import type { Locale } from "@/i18n/routing";
import { getAuthor, listPosts } from "@/lib/content";
import { initials } from "@/lib/format";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { siteIdentity } from "@/lib/site";

// Trang tác giả: tên, ảnh, giới thiệu, trang web và các bài của họ.

type Props = PageProps<"/[locale]/blog/author/[slug]">;

async function load(props: Props) {
  const { locale: raw, slug } = await props.params;
  const locale = raw as Locale;
  const author = (await getAuthor(locale, decodeURIComponent(slug)))?.data;
  if (!author) notFound();
  return { locale, author };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale, author } = await load(props);
  return pageMetadata({
    locale,
    path: routes.author(author.slug),
    title: author.display_name,
    description: author.bio.slice(0, 300),
    image: author.avatar
      ? {
          url: author.avatar.url,
          alt: author.avatar.alt,
          width: author.avatar.width ?? null,
          height: author.avatar.height ?? null,
        }
      : null,
  });
}

export default async function AuthorPage(props: Props) {
  const { locale, author } = await load(props);
  const { cursor } = await props.searchParams;
  const after = typeof cursor === "string" ? cursor.slice(0, 500) : undefined;
  const site = await siteIdentity(locale);
  const t = await getTranslations({ locale, namespace: "blog" });
  const page = await listPosts(locale, {
    authorId: author.id,
    ...(after ? { cursor: after } : {}),
  });
  const website = /^https?:\/\//i.test(author.website_url) ? author.website_url : "";
  return (
    <main id="main" className="wrap bl-page">
      <header className="bl-head au-head">
        <Breadcrumbs
          items={[{ label: site.blogName, href: routes.blog() }, { label: author.display_name }]}
        />
        <div className="au-card">
          <span className="au-avatar">
            {author.avatar ? (
              <MediaImage media={author.avatar} sizes="96px" />
            ) : (
              <span aria-hidden="true">{initials(author.display_name)}</span>
            )}
          </span>
          <span className="au-text">
            <h1 className="dsp bl-title">{author.display_name}</h1>
            {author.bio ? <p className="bl-intro">{author.bio}</p> : null}
            {website ? (
              <a className="lnk" href={website} rel="noopener noreferrer me">
                {t("website")}
              </a>
            ) : null}
          </span>
        </div>
      </header>
      <h2 className="dsp au-posts">{t("authorPosts", { name: author.display_name })}</h2>
      <PostList
        posts={page?.data ?? []}
        locale={locale}
        basePath={routes.author(author.slug)}
        nextCursor={page?.pagination.next_cursor ?? null}
        isFirstPage={!after}
        emptyText={t("empty")}
      />
    </main>
  );
}
