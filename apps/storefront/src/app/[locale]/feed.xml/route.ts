import { toApiError } from "@autoxide/sdk";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { publicClient, siteUrl } from "@/lib/core";
import { rss } from "@/lib/feeds";
import { siteIdentity } from "@/lib/site";
import { isUnknownShop } from "@/lib/tenant";

// RSS của mục bài viết: `/feed.xml` (tiếng Việt), `/en/feed.xml`. Core trả JSON
// (`GET /api/v1/content/public/feed`), website đổi thành RSS 2.0.
export async function GET(_: Request, context: RouteContext<"/[locale]/feed.xml">) {
  const { locale } = await context.params;
  if (!hasLocale(routing.locales, locale)) return new Response("Not found", { status: 404 });
  const site = await siteIdentity(locale);
  const t = await getTranslations({ locale, namespace: "blog" });
  let posts: Parameters<typeof rss>[0]["posts"] = [];
  try {
    const { data, error, response } = await publicClient(locale).GET(
      "/api/v1/content/public/feed",
      { params: { query: { locale, limit: 20 } } },
    );
    // Tên miền không thuộc cửa hàng nào (core nhiều khách): không có RSS, như trang (W-038).
    if (error !== undefined && isUnknownShop(response.status, toApiError(response, error).code)) {
      return new Response("Not found", { status: 404 });
    }
    posts = data?.data ?? [];
  } catch {
    return new Response("The content service is not answering.", { status: 503 });
  }
  return new Response(
    rss({
      site: await siteUrl(),
      title: `${site.blogName} · ${site.name}`,
      description: t("intro"),
      locale,
      posts,
    }),
    {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
