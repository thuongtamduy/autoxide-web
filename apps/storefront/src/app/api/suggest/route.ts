import { NextResponse } from "next/server";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { localePath, routing } from "@/i18n/routing";
import { searchContent } from "@/lib/content";
import { fold, matches } from "@/lib/fold";
import { formatMoney } from "@/lib/format";
import { routes } from "@/lib/routes";
import { compactGroups, keywordsFrom, matchCategory, type SuggestGroup } from "@/lib/suggest";
import { sampleDataEnabled, text } from "@/sample";
import { CATEGORIES, STORES, searchProducts, variantBySku } from "@/sample/catalog";

// Gợi ý tìm cho ô tìm ở đầu trang: `GET /api/suggest?q=&locale=`. Chạy trên máy chủ website (bài viết
// đọc từ core như mọi trang; trình duyệt không gọi core). Không có gì riêng tư: cache ngắn ở trình duyệt.

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const raw = url.searchParams.get("locale") ?? "";
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  if (!fold(q)) return NextResponse.json({ groups: [] });
  const t = await getTranslations({ locale, namespace: "suggest" });
  const href = (path: string) => localePath(locale, path);
  const groups: SuggestGroup[] = [];

  if (sampleDataEnabled()) {
    const products = searchProducts(q, locale, 6);
    const names = products.map((p) => text(p.names, locale));
    const category = matchCategory(
      q,
      CATEGORIES.map((c) => ({ name: text(c.names, locale), slug: text(c.slugs, locale) })),
    );
    groups.push({
      key: "words",
      label: t("words"),
      items: [
        ...keywordsFrom(names).map((word) => ({
          label: word,
          sub: "",
          href: href(routes.search(word)),
        })),
        ...(category
          ? [
              {
                label: `“${q}”`,
                sub: t("inCategory", { category: category.name }),
                href: href(routes.category(category.slug)),
              },
            ]
          : []),
      ],
    });
    groups.push({
      key: "products",
      label: t("products"),
      items: products.slice(0, 4).map((p) => ({
        label: text(p.names, locale),
        sub: formatMoney(
          { amount: variantBySku(p.default_sku)?.price ?? 0, currency: "VND" },
          locale,
        ),
        href: href(routes.product(text(p.slugs, locale))),
      })),
    });
    groups.push({
      key: "stores",
      label: t("stores"),
      items: STORES.filter((s) =>
        matches(`${text(s.name, locale)} ${text(s.address, locale)}`, q),
      ).map((s) => ({
        label: text(s.name, locale),
        sub: t("storeSub"),
        href: href(routes.stores()),
      })),
    });
  }

  // Bài viết: core thật. Core lỗi thì bỏ nhóm này, các nhóm khác vẫn hiện.
  try {
    const hits = await searchContent(locale, q);
    groups.push({
      key: "posts",
      label: t("posts"),
      items: hits.slice(0, 2).map((hit) => ({ label: hit.title, sub: "", href: href(hit.path) })),
    });
  } catch {
    // Bỏ qua: gợi ý không làm hỏng ô tìm.
  }

  return NextResponse.json(
    { groups: compactGroups(groups) },
    { headers: { "Cache-Control": "private, max-age=30" } },
  );
}
