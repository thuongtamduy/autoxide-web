import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { nodeText, outline } from "@/lib/body";
import { listPosts } from "@/lib/content";
import { formatDate, initials, keepUnits, pick } from "@/lib/format";
import { routes } from "@/lib/routes";
import type { SiteIdentity } from "@/lib/site";
import type { PublicEntry } from "@/lib/types";
import { sampleDataEnabled, text } from "@/sample";
import { mentionedProducts, variantBySku } from "@/sample/catalog";
import { BodyView } from "./body-view";
import { Breadcrumbs } from "./breadcrumbs";
import { CommentsSection } from "./comments/comments-section";
import { ART_NAMES, Art, Icon, TONES } from "./icon";
import { MediaImage } from "./media-image";
import { PostCard } from "./post-card";
import { Price } from "./price";
import { SampleMark } from "./sample-mark";

// Trang bài viết (bản thiết kế `Article`, "Góc bếp"): một khung biên tập 1144px (cột chữ 720 +
// khoảng cách 64 + cột bên 360) cho tiêu đề, ảnh bìa, thân bài và "Đọc tiếp" — mọi khối thẳng một
// mép (mục 7 của `ui-design.md`). Thân bài, tác giả, danh mục, bản dịch, bình luận là dữ liệu thật;
// khối "Sản phẩm nhắc tới trong bài" là mẫu (core chưa có nhúng bản ghi, bước 51).

const AVATAR_TONES = ["#5B3FA6", "#1F6B4F", "#B4380F", "#2E4C7C", "#7C5133"];

export async function ArticleView({
  entry,
  locale,
  site,
  commentsCursor,
}: {
  entry: PublicEntry;
  locale: Locale;
  site: SiteIdentity;
  commentsCursor?: string | undefined;
}) {
  const t = await getTranslations({ locale, namespace: "article" });
  const tb = await getTranslations({ locale, namespace: "blog" });
  const { body, toc } = outline(entry.body);
  const category = entry.terms.find((term) => term.taxonomy === "category") ?? null;
  const tags = entry.terms.filter((term) => term.taxonomy === "tag");
  const author = entry.authors[0] ?? null;
  const sample = sampleDataEnabled();
  const mentioned = sample
    ? mentionedProducts(`${entry.title} ${nodeText(entry.body)}`, locale)
    : [];
  const more = (
    (await listPosts(locale, { limit: 4, ...(category ? { termId: category.id } : {}) }))?.data ??
    []
  )
    .filter((post) => post.id !== entry.id)
    .slice(0, 3);
  const readNext =
    more.length > 0
      ? more
      : ((await listPosts(locale, { limit: 4 }))?.data ?? [])
          .filter((p) => p.id !== entry.id)
          .slice(0, 3);
  const languages = [
    { locale: entry.locale, path: entry.path },
    ...entry.translations.filter((tr) => tr.locale !== entry.locale),
  ];
  const tone = TONES[pick(entry.id, TONES.length)] ?? "t1";
  const art = ART_NAMES[pick(entry.id, ART_NAMES.length)] ?? "pan";

  return (
    <main id="main" className="ar-pg">
      <header className="wrap ar-wrap ar-head rise">
        <Breadcrumbs
          items={[
            { label: site.blogName, href: routes.blog() },
            ...(category
              ? [{ label: category.name, href: routes.term("category", category.slug) }]
              : []),
            { label: entry.title },
          ]}
        />
        {category ? <span className="kick">{category.name}</span> : null}
        <h1 className="dsp ar-title">{entry.title}</h1>
        <div className="ar-meta">
          {author ? (
            <Link className="ar-author" href={routes.author(author.slug)}>
              <span
                className="ar-avatar"
                aria-hidden="true"
                style={{ background: AVATAR_TONES[pick(author.id, AVATAR_TONES.length)] }}
              >
                {initials(author.display_name)}
              </span>
              <span>
                <b>{author.display_name}</b>
                {entry.authors.length > 1
                  ? `, ${entry.authors
                      .slice(1)
                      .map((a) => a.display_name)
                      .join(", ")}`
                  : null}
              </span>
            </Link>
          ) : null}
          <span>
            <time dateTime={entry.first_published_at}>
              {formatDate(entry.first_published_at, locale)}
            </time>
            {entry.reading_time_minutes > 0
              ? ` · ${tb("readingTime", { minutes: entry.reading_time_minutes })}`
              : null}
          </span>
          <span className="ar-gap" />
          {languages.length > 1 ? (
            <nav className="ar-lang" aria-label={t("languages")}>
              {languages.map((language) =>
                language.locale === entry.locale ? (
                  <span
                    key={language.locale}
                    className="on"
                    aria-current="true"
                    lang={language.locale}
                  >
                    {language.locale.toUpperCase()}
                  </span>
                ) : (
                  <Link
                    key={language.locale}
                    href={language.path}
                    locale={language.locale as Locale}
                    lang={language.locale}
                    hrefLang={language.locale}
                  >
                    {language.locale.toUpperCase()}
                  </Link>
                ),
              )}
            </nav>
          ) : null}
        </div>
        {entry.ai_generated ? (
          <p className="ar-ai" role="note">
            <Icon name="sparkles" small />
            {entry.ai_reviewed ? t("aiReviewed") : t("aiNotice")}
          </p>
        ) : null}
        {toc.length > 0 ? (
          <details className="ar-tocm card">
            <summary>
              <Icon name="doc" small />
              {t("toc")}
              <span className="muted">{toc.length}</span>
              <Icon name="down" small className="ar-chev" />
            </summary>
            <nav aria-label={t("toc")}>
              {toc.map((item) => (
                <a key={item.id} href={`#${item.id}`}>
                  {item.text}
                </a>
              ))}
              <a href="#comments">{t("comments")}</a>
            </nav>
          </details>
        ) : null}
      </header>

      {entry.featured_media ? (
        <div className="wrap ar-wrap">
          <figure className="ar-cover rise d1">
            <MediaImage
              media={entry.featured_media}
              sizes="(min-width: 1200px) 1144px, 100vw"
              priority
            />
          </figure>
        </div>
      ) : (
        <div className="wrap ar-wrap">
          <div className={`thumb ar-cover ar-art rise d1 ${tone}`}>
            <Art name={art} />
          </div>
        </div>
      )}

      <div className="wrap ar-wrap ar-cols">
        <article className="ar-body">
          {entry.excerpt ? <p className="ar-lead">{entry.excerpt}</p> : null}
          <BodyView body={body} media={entry.body_media} locale={locale} />
          {tags.length > 0 ? (
            <ul className="ar-tags" aria-label={tb("tag")}>
              {tags.map((tag) => (
                <li key={tag.id}>
                  <Link className="chip" href={routes.term("tag", tag.slug)}>
                    #{tag.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <CommentsSection
            locale={locale}
            targetId={entry.id}
            cursor={commentsCursor}
            basePath={entry.path}
          />
        </article>
        <aside className="ar-side">
          {toc.length > 0 ? (
            <nav className="ar-tocside" aria-label={t("toc")}>
              <span className="kick">{t("tocShort")}</span>
              {toc.map((item) => (
                <a key={item.id} href={`#${item.id}`}>
                  {item.text}
                </a>
              ))}
              <a href="#comments">{t("comments")}</a>
            </nav>
          ) : null}
          {mentioned.length > 0 ? (
            <div className="card ar-products">
              <span className="ar-products-h">
                {t("mentioned")}
                <SampleMark endpoint="GET /api/v1/kernel/resources (nhúng bản ghi)" step="51" />
              </span>
              {mentioned.map((product) => {
                const variant = variantBySku(product.default_sku);
                return (
                  <Link
                    key={product.id}
                    className="ar-product"
                    href={routes.product(text(product.slugs, locale))}
                  >
                    <span className={`thumb ${product.tone}`}>
                      <Art name={product.art} />
                    </span>
                    <span className="ar-product-t">
                      <span>{keepUnits(text(product.names, locale))}</span>
                      <Price
                        money={{ amount: variant?.price ?? 0, currency: "VND" }}
                        locale={locale}
                      />
                    </span>
                  </Link>
                );
              })}
              <span className="muted ar-products-note">{t("mentionedNote")}</span>
            </div>
          ) : null}
        </aside>
      </div>

      {readNext.length > 0 ? (
        <section className="wrap ar-wrap ar-next" aria-labelledby="ar-next">
          <h2 id="ar-next" className="dsp">
            {t("readNext", { blog: site.blogName })}
          </h2>
          <div className={`g3 post-grid n${readNext.length}`}>
            {readNext.map((post) => (
              <PostCard key={post.id} post={post} locale={locale} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

/** Trang tĩnh (`kind: page`): tiêu đề và thân bài trong cột chữ, không bình luận. */
export async function PageView({ entry, locale }: { entry: PublicEntry; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "page" });
  const { body } = outline(entry.body);
  return (
    <main id="main" className="ar-pg static-pg">
      <header className="wrap ar-wrap ar-head">
        <Breadcrumbs items={[{ label: entry.title }]} />
        <h1 className="dsp ar-title">{entry.title}</h1>
        {entry.excerpt ? <p className="ar-lead">{entry.excerpt}</p> : null}
      </header>
      <div className="wrap ar-wrap">
        <article className="ar-body">
          <BodyView body={body} media={entry.body_media} locale={locale} />
          <p className="muted static-updated">
            {t("updated", { date: formatDate(entry.content_modified_at, locale) })}
          </p>
        </article>
      </div>
    </main>
  );
}
