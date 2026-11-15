import type { Metadata } from "next";
import { ArticleView, PageView } from "@/components/article-view";
import type { Locale } from "@/i18n/routing";
import { entryAt, entryMetadata, joinPath } from "@/lib/entry-page";
import { siteIdentity } from "@/lib/site";

// Mọi địa chỉ khác của website: bài viết, trang tĩnh, địa chỉ cũ đã chuyển (core quyết qua
// `resolve`). Trang của website (blog, tìm kiếm…) có thư mục riêng nên được Next.js chọn trước.

export async function generateMetadata(props: PageProps<"/[locale]/[...path]">): Promise<Metadata> {
  const { locale, path } = await props.params;
  const entry = await entryAt(locale as Locale, joinPath(path));
  return entryMetadata(entry, locale as Locale);
}

export default async function EntryPage(props: PageProps<"/[locale]/[...path]">) {
  const { locale: raw, path } = await props.params;
  const locale = raw as Locale;
  const { cm } = await props.searchParams;
  const entry = await entryAt(locale, joinPath(path));
  if (entry.kind === "page") return <PageView entry={entry} locale={locale} />;
  return (
    <ArticleView
      entry={entry}
      locale={locale}
      site={await siteIdentity(locale)}
      commentsCursor={typeof cm === "string" ? cm.slice(0, 500) : undefined}
    />
  );
}
