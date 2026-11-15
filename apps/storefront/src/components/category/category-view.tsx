import { getTranslations } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { groupDigits } from "@/lib/format";
import {
  applyListing,
  facetCounts,
  hasFilters,
  type ListingFilter,
  listingHref,
  PRICE_BANDS,
  paginate,
  RATING_STEPS,
  SELLER_KINDS,
  SORT_KEYS,
} from "@/lib/listing";
import { routes } from "@/lib/routes";
import { text } from "@/sample";
import {
  ALL_PRODUCTS,
  ATTRIBUTES,
  CATEGORIES,
  categoryById,
  listedInCategory,
  type SampleCategory,
  storeByCode,
} from "@/sample/catalog";
import { readStore } from "@/sample/server";
import { listingItem, productCard } from "@/sample/view";
import { Breadcrumbs, type Crumb } from "../breadcrumbs";
import { Art, Icon } from "../icon";
import { ProductCard } from "../product-card";
import { SampleMark } from "../sample-mark";
import { ListingShell, SortSelect } from "./listing-shell";

// Trang danh mục sản phẩm (bản thiết kế `Category`) và trang "Tất cả sản phẩm". Danh mục sản phẩm
// (`catalog`, `/danh-muc/<slug>`) khác danh mục bài viết (`content`, `/blog/category/<slug>`): hai
// module, hai cây, hai địa chỉ. Bộ lọc nằm trên địa chỉ (form GET), máy chủ lọc và chia trang —
// hôm nay trên dữ liệu mẫu (`lib/listing.ts`), khi có bước 41 thì core làm.

const FORM_ID = "cat-f";

/** Ô danh mục con: con của danh mục đang xem; danh mục lá thì các danh mục cùng cha. */
function subCategories(category: SampleCategory | null): {
  items: SampleCategory[];
  parent: SampleCategory | null;
} {
  if (!category) return { items: CATEGORIES.filter((c) => c.parent_id === null), parent: null };
  const children = CATEGORIES.filter((c) => c.parent_id === category.id);
  if (children.length > 0) return { items: children, parent: null };
  const parent = category.parent_id ? (categoryById(category.parent_id) ?? null) : null;
  return {
    items: parent ? CATEGORIES.filter((c) => c.parent_id === parent.id) : [],
    parent,
  };
}

export async function CategoryView({
  locale,
  category,
  filter,
}: {
  locale: Locale;
  category: SampleCategory | null;
  filter: ListingFilter;
}) {
  const t = await getTranslations({ locale, namespace: "listing" });
  const store = await readStore();
  const storeName = text(storeByCode(store).name, locale);
  const path = category ? routes.category(text(category.slugs, locale)) : routes.catalog();
  const action = getPathname({ href: path, locale });
  const products = category ? listedInCategory(category.id) : [...ALL_PRODUCTS];
  const rank = (id: string) => ALL_PRODUCTS.findIndex((p) => p.id === id);
  const items = products.map((p) => ({ ...listingItem(p, store, rank(p.id)), product: p }));
  const matched = applyListing(items, filter);
  const page = paginate(matched, filter.cursor);
  const title = category ? text(category.names, locale) : t("all");
  const { items: subs, parent } = subCategories(category);

  const crumbs: Crumb[] = [];
  if (category) {
    crumbs.push({ label: t("all"), href: routes.catalog() });
    const up = category.parent_id ? categoryById(category.parent_id) : undefined;
    if (up)
      crumbs.push({ label: text(up.names, locale), href: routes.category(text(up.slugs, locale)) });
  }
  crumbs.push({ label: title });

  const facet = {
    material: facetCounts(items, filter, "material"),
    stove: facetCounts(items, filter, "stove"),
    price: facetCounts(items, filter, "price"),
    rating: facetCounts(items, filter, "rating"),
    seller: facetCounts(items, filter, "seller"),
    inStore: facetCounts(items, filter, "inStore"),
  };
  const materials = Object.keys(ATTRIBUTES.material.options).filter(
    (code) => (facet.material.get(code) ?? 0) > 0 || filter.material.includes(code),
  ) as (keyof typeof ATTRIBUTES.material.options)[];
  const stoves = Object.keys(ATTRIBUTES.stove.options).filter(
    (code) => (facet.stove.get(code) ?? 0) > 0 || filter.stove.includes(code),
  ) as (keyof typeof ATTRIBUTES.stove.options)[];
  const priceLabel = (id: string) => {
    const band = PRICE_BANDS.find((b) => b.id === id);
    if (!band) return "";
    const k = (n: number) => groupDigits(n / 1000, locale);
    if (band.min === 0 && band.max !== null) return t("priceUnder", { max: k(band.max) });
    if (band.max === null) return t("priceOver", { min: k(band.min) });
    return t("priceBetween", { min: k(band.min), max: k(band.max) });
  };
  const ratingLabel = (step: number) =>
    t("ratingAtLeast", { score: String(step).replace(".", locale === "vi" ? "," : ".") });

  // Chip của bộ lọc đang bật: mỗi chip là link bỏ đúng giá trị đó.
  const active: { label: string; href: string }[] = [
    ...filter.material.map((code) => ({
      label: text(
        ATTRIBUTES.material.options[code as keyof typeof ATTRIBUTES.material.options] ?? {
          vi: code,
          en: code,
        },
        locale,
      ),
      href: listingHref(path, filter, { material: filter.material.filter((m) => m !== code) }),
    })),
    ...filter.stove.map((code) => ({
      label: text(
        ATTRIBUTES.stove.options[code as keyof typeof ATTRIBUTES.stove.options] ?? {
          vi: code,
          en: code,
        },
        locale,
      ),
      href: listingHref(path, filter, { stove: filter.stove.filter((s) => s !== code) }),
    })),
    ...(filter.price
      ? [{ label: priceLabel(filter.price), href: listingHref(path, filter, { price: null }) }]
      : []),
    ...(filter.rating !== null
      ? [{ label: ratingLabel(filter.rating), href: listingHref(path, filter, { rating: null }) }]
      : []),
    ...filter.seller.map((kind) => ({
      label: t(`seller_${kind}`),
      href: listingHref(path, filter, { seller: filter.seller.filter((s) => s !== kind) }),
    })),
    ...(filter.inStore
      ? [
          {
            label: t("inStoreChip", { store: storeName }),
            href: listingHref(path, filter, { inStore: false }),
          },
        ]
      : []),
  ];
  const reset = listingHref(path, filter, {
    material: [],
    stove: [],
    price: null,
    rating: null,
    seller: [],
    inStore: false,
  });

  const count = (n: number | undefined) => <span className="muted num cat-n">{n ?? 0}</span>;

  const filters = (
    <>
      <fieldset className="cat-fs">
        <legend className="lab">{text(ATTRIBUTES.material.names, locale)}</legend>
        {materials.map((code) => (
          <label className="cat-check" key={code}>
            <input
              type="checkbox"
              className="chk"
              name="material"
              value={code}
              defaultChecked={filter.material.includes(code)}
            />
            <span>{text(ATTRIBUTES.material.options[code], locale)}</span>
            {count(facet.material.get(code))}
          </label>
        ))}
      </fieldset>
      <fieldset className="cat-fs">
        <legend className="lab">{text(ATTRIBUTES.stove.names, locale)}</legend>
        {stoves.map((code) => (
          <label className="cat-check" key={code}>
            <input
              type="checkbox"
              className="chk"
              name="stove"
              value={code}
              defaultChecked={filter.stove.includes(code)}
            />
            <span>{text(ATTRIBUTES.stove.options[code], locale)}</span>
            {count(facet.stove.get(code))}
          </label>
        ))}
      </fieldset>
      <fieldset className="cat-fs">
        <legend className="lab">{t("rating")}</legend>
        <div className="cat-chips">
          <label className="chip cat-radio">
            <input type="radio" name="rating" value="" defaultChecked={filter.rating === null} />
            {t("any")}
          </label>
          {RATING_STEPS.map((step) => (
            <label className="chip cat-radio" key={step}>
              <input
                type="radio"
                name="rating"
                value={String(step)}
                defaultChecked={filter.rating === step}
              />
              <span className="stars" aria-hidden="true">
                ★
              </span>
              {ratingLabel(step)}
              {count(facet.rating.get(String(step)))}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="cat-fs">
        <legend className="lab">{t("price")}</legend>
        <div className="cat-chips">
          <label className="chip cat-radio">
            <input type="radio" name="price" value="" defaultChecked={filter.price === null} />
            {t("any")}
          </label>
          {PRICE_BANDS.map((band) => (
            <label className="chip cat-radio" key={band.id}>
              <input
                type="radio"
                name="price"
                value={band.id}
                defaultChecked={filter.price === band.id}
              />
              {priceLabel(band.id)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="cat-fs">
        <legend className="lab">{t("seller")}</legend>
        {SELLER_KINDS.map((kind) => (
          <label className="cat-check" key={kind}>
            <input
              type="checkbox"
              className="chk"
              name="seller"
              value={kind}
              defaultChecked={filter.seller.includes(kind)}
            />
            <span>{t(`seller_${kind}`)}</span>
            {count(facet.seller.get(kind))}
          </label>
        ))}
      </fieldset>
      <label className="cat-instore">
        <input
          type="checkbox"
          className="chk"
          name="in_store"
          value="1"
          defaultChecked={filter.inStore}
        />
        <span className="cat-instore-t">
          <span className="cat-instore-h">
            {t("inStore", { store: storeName })} {count(facet.inStore.get("1"))}
          </span>
          <span className="muted">{t("inStoreHint")}</span>
        </span>
      </label>
    </>
  );

  const bar = (
    <>
      <span className="cat-count" aria-live="polite">
        {t("count", { count: page.total })}
      </span>
      {active.map((chip) => (
        <Link
          key={chip.href + chip.label}
          className="chip cat-active"
          href={chip.href}
          scroll={false}
          aria-label={t("remove", { label: chip.label })}
        >
          {chip.label}
          <Icon name="x" small />
        </Link>
      ))}
      {active.length > 0 ? (
        <Link className="lnk cat-reset" href={reset} scroll={false}>
          {t("reset")}
        </Link>
      ) : null}
      <span className="cat-gap" />
      <span className="cat-sort">
        <span className="cat-sortlab" aria-hidden="true">
          {t("sort")}
        </span>
        <SortSelect
          formId={FORM_ID}
          value={filter.sort}
          label={t("sortLabel")}
          options={SORT_KEYS.map((key) => ({ value: key, label: t(`sort_${key}`) }))}
        />
      </span>
    </>
  );

  return (
    <main id="main" className="wrap cat-page">
      <Breadcrumbs items={crumbs} />
      <section className="rise cat-head">
        <div className="cat-intro">
          <h1 className="dsp cat-title">
            {title}
            <SampleMark endpoint="GET /api/v1/catalog/public/products" step="41" />
          </h1>
          <p className="cat-desc">{t(category ? "lead" : "leadAll", { name: title })}</p>
        </div>
        {subs.length > 0 ? (
          <nav className="cat-types" aria-label={t("subcategories")}>
            {parent ? (
              <Link className="chip" href={routes.category(text(parent.slugs, locale))}>
                {t("allOf", { name: text(parent.names, locale) })}
              </Link>
            ) : null}
            {subs.map((sub) => (
              <Link
                key={sub.id}
                className={`chip${sub.id === category?.id ? " on" : ""}`}
                href={routes.category(text(sub.slugs, locale))}
                aria-current={sub.id === category?.id ? "page" : undefined}
              >
                <span className={`cat-art ${sub.tone}`}>
                  <Art name={sub.art} />
                </span>
                {text(sub.names, locale)}
                <span className="num cat-n">{listedInCategory(sub.id).length}</span>
              </Link>
            ))}
          </nav>
        ) : null}
      </section>
      <ListingShell
        formId={FORM_ID}
        action={action}
        filters={filters}
        bar={bar}
        activeCount={active.length}
        labels={{
          title: t("filters"),
          open: t("filters"),
          close: t("closeFilters"),
          show: t("show", { count: page.total }),
          apply: t("apply"),
        }}
      >
        {page.items.length > 0 ? (
          <div className="pgrid g4 cat-grid">
            {page.items.map((item) => (
              <ProductCard
                key={item.id}
                product={productCard(item.product, store, locale)}
                locale={locale}
              />
            ))}
          </div>
        ) : (
          <div className="cat-empty">
            <h2 className="dsp">{t("emptyTitle")}</h2>
            <p className="muted">{t("emptyBody")}</p>
            <Link className="btn" href={reset} scroll={false}>
              {t("reset")}
            </Link>
          </div>
        )}
        {page.total > 0 && (page.next || filter.cursor) ? (
          <nav className="cat-pages" aria-label={t("pages")}>
            <span className="muted">
              {t("range", { from: page.from, to: page.to, total: page.total })}
            </span>
            {filter.cursor ? (
              <Link className="btn" href={listingHref(path, filter)}>
                {t("first")}
              </Link>
            ) : null}
            {page.next ? (
              <Link
                className="btn pri"
                href={listingHref(path, { ...filter, cursor: page.next }, { cursor: page.next })}
              >
                {t("next")}
                <Icon name="arrow" small />
              </Link>
            ) : null}
          </nav>
        ) : null}
      </ListingShell>
    </main>
  );
}

export function hasListingQuery(filter: ListingFilter): boolean {
  return hasFilters(filter) || filter.sort !== "best_selling" || filter.cursor !== null;
}
