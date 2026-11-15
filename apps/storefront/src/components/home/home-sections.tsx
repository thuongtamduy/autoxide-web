import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { type Locale, localePath } from "@/i18n/routing";
import { keepUnits, vnd } from "@/lib/format";
import { routes } from "@/lib/routes";
import type { PublicEntry } from "@/lib/types";
import { text } from "@/sample";
import {
  CATEGORIES,
  CATEGORY_ID,
  COUPON,
  couponPrice,
  PRODUCTS,
  productBySku,
  productsInCategory,
  STORES,
  type StoreCode,
  storeByCode,
} from "@/sample/catalog";
import { MEALS, SELLERS, SITE } from "@/sample/site";
import { productCard } from "@/sample/view";
import { Art, Icon } from "../icon";
import { PostCard } from "../post-card";
import { Price } from "../price";
import { ProductCard } from "../product-card";
import { SampleMark } from "../sample-mark";
import { SectionHeader } from "../section-header";
import { CopyCode } from "./copy-code";
import { MealPlanner } from "./meal-planner";
import { StoreCards } from "./store-cards";

// Các khối của trang chủ (bản thiết kế `Main`). Khối thương mại dựng từ dữ liệu mẫu (W-026) và chỉ
// hiện khi bật dữ liệu mẫu; khối "Góc bếp" đọc bài viết thật của core.

const CATALOG = "GET /api/v1/catalog/public/products";

/** Lời mở đầu và cụm ảnh của cửa hàng mẫu. */
export function SampleHero({ locale }: { locale: string }) {
  const t = useTranslations("home.hero");
  const pan = productBySku("CG26");
  const knives = productBySku("DB3");
  const code = couponPrice("CG26");
  return (
    <section className="wrap home-hero">
      <div className="rise hero-text">
        <span className="kick">{text(SITE.hero.kicker, locale)}</span>
        <h1 className="dsp hero-title">{text(SITE.hero.title, locale)}</h1>
        <p className="hero-lead">{text(SITE.hero.lead, locale)}</p>
        <div className="hero-actions">
          <Link
            className="btn pri"
            href={routes.category(text(CATEGORIES[0]?.slugs ?? { vi: "", en: "" }, locale))}
          >
            {t("shop")}
            <Icon name="arrow" small />
          </Link>
          <a className="btn" href="#stores">
            {t("stores")}
          </a>
        </div>
        <ul className="hero-trust">
          {SITE.trust.map((line) => (
            <li key={line.vi}>
              <Icon name="check" small />
              {text(line, locale)}
            </li>
          ))}
        </ul>
      </div>
      <div className="rise d2 home-collage">
        {pan ? (
          <Link className="pcard hero-main" href={routes.product(text(pan.slugs, locale))}>
            <span className="thumb t1 herothumb">
              <Art name="pan" />
              <span className="herotag">
                <span className="herotag-name">
                  {keepUnits(`${text(pan.names, locale)} 26 cm`)}
                </span>
                <span className="price">{vnd(690_000, locale)}</span>
                {code !== null ? (
                  <span className="herotag-code">
                    <Price money={{ amount: code, currency: "VND" }} locale={locale} sale />{" "}
                    {t("withCode", { code: COUPON.code })}
                  </span>
                ) : null}
              </span>
            </span>
          </Link>
        ) : null}
        {knives ? (
          <Link
            className="pcard"
            href={routes.product(text(knives.slugs, locale))}
            aria-label={text(knives.names, locale)}
          >
            <span className="thumb t2">
              <Art name="knife" />
            </span>
          </Link>
        ) : null}
        <Link
          className="pcard"
          href={routes.marketplace()}
          aria-label={text(SITE.marketplace, locale)}
        >
          <span className="thumb t4">
            <Art name="bowl" />
            <span className="flag">
              <span className="badge b-plain hero-flag">{text(SITE.marketplace, locale)}</span>
            </span>
          </span>
        </Link>
      </div>
    </section>
  );
}

/** Lời mở đầu khi tắt dữ liệu mẫu: chỉ tên website và lối vào bài viết. */
export function PlainHero({ name, blogName }: { name: string; blogName: string }) {
  const t = useTranslations("home.plain");
  return (
    <section className="wrap home-hero plain-hero">
      <div className="rise hero-text">
        <h1 className="dsp hero-title">{name}</h1>
        <p className="hero-lead">{t("lead")}</p>
        <div className="hero-actions">
          <Link className="btn pri" href={routes.blog()}>
            {t("read", { blog: blogName })}
            <Icon name="arrow" small />
          </Link>
        </div>
      </div>
    </section>
  );
}

/** "Mua theo danh mục": năm danh mục và "Tất cả sản phẩm" — 6 ô, lưới 6 / 3 / 2 cột. */
export function CategoryTiles({ locale }: { locale: string }) {
  const t = useTranslations("home");
  const ids = [
    CATEGORY_ID.kitchen,
    CATEGORY_ID.knives,
    CATEGORY_ID.tableware,
    CATEGORY_ID.storage,
    CATEGORY_ID.textiles,
  ];
  const tiles = ids.flatMap((id) => {
    const category = CATEGORIES.find((c) => c.id === id);
    return category
      ? [
          {
            key: id,
            label: text(category.names, locale),
            href: routes.category(text(category.slugs, locale)),
            count: productsInCategory(id).length,
            art: category.art,
            tone: category.tone,
          },
        ]
      : [];
  });
  tiles.push({
    key: "all",
    label: t("allProducts"),
    href: routes.catalog(),
    count: PRODUCTS.length,
    art: "basket",
    tone: "t3",
  });
  return (
    <section className="wrap home-sec" aria-labelledby="home-cats">
      <SectionHeader
        id="home-cats"
        title={t("categories")}
        mark={<SampleMark endpoint="GET /api/v1/catalog/public/categories" step="41" />}
        more={{ href: routes.catalog(), label: t("allProducts") }}
      />
      <div className="pgrid g6 home-cats">
        {tiles.map((tile) => (
          <Link className="pcard" href={tile.href} key={tile.key}>
            <span className={`thumb cat-thumb ${tile.tone}`}>
              <Art name={tile.art} />
            </span>
            <span className="cat-label">
              <span>{tile.label}</span>
              <span className="muted">{t("productCount", { count: tile.count })}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Dải mã giảm giá đang chạy (khuyến mại, bước 43). */
export function CouponBand({ locale }: { locale: string }) {
  const t = useTranslations("home.coupon");
  const [year, month, day] = COUPON.ends_on.split("-");
  return (
    <section className="wrap" aria-label={t("label")}>
      <div className="coupon">
        <div className="coupon-text">
          <span className="coupon-kick">
            {t("until", { date: `${day}/${month}/${year}` })}
            <SampleMark endpoint="GET /api/v1/promotions/public/codes" step="43" />
          </span>
          <span className="dsp coupon-title">{text(COUPON.title, locale)}</span>
          <span className="coupon-terms">
            {text(COUPON.terms, locale)} {t("left", { count: COUPON.remaining })}
          </span>
        </div>
        <CopyCode code={COUPON.code} />
      </div>
    </section>
  );
}

/** "Bán chạy tuần này": 8 sản phẩm, lưới 4 / 2 cột, tình trạng hàng theo cửa hàng đang chọn. */
export function BestSellers({ locale, store }: { locale: string; store: StoreCode }) {
  const t = useTranslations("home");
  const products = PRODUCTS.slice(0, 8).map((p) => productCard(p, store, locale));
  return (
    <section className="wrap home-sec" aria-labelledby="home-best">
      <SectionHeader
        id="home-best"
        title={t("best")}
        mark={<SampleMark endpoint={CATALOG} step="41" />}
        sub={t("bestSub", { store: text(storeByCode(store).name, locale) })}
        more={{ href: routes.catalog(), label: t("more") }}
      />
      <div className="pgrid g4 best-grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} locale={locale} />
        ))}
      </div>
    </section>
  );
}

/** "Hôm nay nấu gì?": món → dụng cụ → giỏ. */
export function MealSection({ locale }: { locale: string }) {
  const t = useTranslations("home.meal");
  const meals = MEALS.map((meal) => ({
    id: meal.id,
    name: text(meal.name, locale),
    time: t("time", { minutes: meal.minutes, people: meal.people }),
    blurb: text(meal.blurb, locale),
    art: meal.art,
    tone: meal.tone,
    postHref: localePath(locale as Locale, routes.search(meal.query)),
    tools: meal.tools.flatMap((sku) => {
      const product = productBySku(sku);
      const variant = product?.variants.find((v) => v.sku === sku);
      if (!product || !variant) return [];
      return [
        {
          sku,
          name: keepUnits(
            `${text(product.names, locale)}${variant.labels ? ` ${text(variant.labels, locale)}` : ""}`,
          ),
          note: couponPrice(sku) !== null ? t("noteCoupon", { code: COUPON.code }) : t("noteShop"),
          price: variant.price,
          art: product.art,
          tone: product.tone,
        },
      ];
    }),
  }));
  return (
    <section className="wrap meal home-sec" aria-labelledby="meal-h">
      <SectionHeader
        id="meal-h"
        title={t("title")}
        sub={t("sub")}
        mark={<SampleMark endpoint={CATALOG} step="41" />}
      />
      <MealPlanner meals={meals} />
    </section>
  );
}

/** "Hệ thống cửa hàng" (hồ sơ công khai của cửa hàng, bước 34). */
export function StoresSection({ locale, store }: { locale: string; store: StoreCode }) {
  const t = useTranslations("home.stores");
  return (
    <section id="stores" className="wrap home-sec" aria-labelledby="home-stores">
      <SectionHeader
        id="home-stores"
        title={t("title")}
        sub={t("sub")}
        mark={<SampleMark endpoint="GET /api/v1/org/public/stores" step="34" />}
      />
      <StoreCards
        current={store}
        stores={STORES.map((s) => ({
          code: s.code,
          name: text(s.name, locale),
          address: text(s.address, locale),
          hours: s.hours,
          pickup: s.pickup ? t("pickup") : null,
        }))}
      />
    </section>
  );
}

/** Dải giới thiệu sàn và ba người bán (sàn, bước 46). */
export function MarketplaceBand({ locale }: { locale: string }) {
  const t = useTranslations("home.market");
  return (
    <section className="wrap" aria-labelledby="home-market">
      <div className="market">
        <div className="market-text">
          <span className="kick">
            {text(SITE.marketplace, locale)}
            <SampleMark endpoint="GET /api/v1/marketplace/public/sellers" step="46" />
          </span>
          <h2 id="home-market" className="dsp market-title">
            {t("title")}
          </h2>
          <p className="market-lead">{t("lead", { count: SITE.verifiedSellers })}</p>
          <Link className="btn" href={routes.marketplace()}>
            {t("enter", { name: text(SITE.marketplace, locale) })}
          </Link>
        </div>
        <div className="sgrid">
          {SELLERS.map((seller) => (
            <Link className="card" href={routes.seller(seller.slug)} key={seller.slug}>
              <span className={`thumb seller-thumb ${seller.tone}`}>
                <Art name={seller.art} />
              </span>
              <span className="sbody">
                <span className="seller-name">{seller.name}</span>
                <span className="seller-meta">
                  <span className="badge b-ok seller-badge">
                    <Icon name="check" />
                    {t("verified")}
                  </span>
                  <span className="muted">
                    {t("meta", {
                      rating: String(seller.rating).replace(".", locale === "vi" ? "," : "."),
                      count: seller.products,
                    })}
                  </span>
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Bài viết mới nhất (core thật): ba bài, lưới 3 / 1 cột. */
export function PostsSection({
  locale,
  posts,
  blogName,
}: {
  locale: string;
  posts: PublicEntry[];
  blogName: string;
}) {
  const t = useTranslations("home");
  if (posts.length === 0) return null;
  return (
    <section className="wrap home-sec" aria-labelledby="home-posts">
      <SectionHeader
        id="home-posts"
        title={blogName}
        more={{ href: routes.blog(), label: t("allPosts") }}
      />
      <div className={`g3 post-grid n${posts.length}`}>
        {posts.map((post) => (
          <PostCard key={post.id} post={post} locale={locale} />
        ))}
      </div>
    </section>
  );
}
