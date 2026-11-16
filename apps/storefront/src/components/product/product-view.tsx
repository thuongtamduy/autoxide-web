import { getTranslations } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { siteUrl } from "@/lib/core";
import { formatDate, formatRating, groupDigits, keepUnits } from "@/lib/format";
import { averageOf, ratingDistribution, shortName } from "@/lib/reviews";
import { routes } from "@/lib/routes";
import type { SiteIdentity } from "@/lib/site";
import { text } from "@/sample";
import {
  ATTRIBUTES,
  availability,
  COUPON,
  categoryById,
  categoryTree,
  couponPrice,
  PRODUCTS,
  productBySku,
  type SampleProduct,
  STORES,
  type StoreCode,
  variantBySku,
} from "@/sample/catalog";
import { flashSale } from "@/sample/deals";
import {
  addonSkus,
  DELIVERY_ZONES,
  DISTRIBUTIONS,
  FREE_SHIPPING_FROM,
  PICKUP,
  productDetail,
  productQuestions,
  productReviews,
  RETURN_DAYS,
  reviewSummary,
  togetherKeys,
} from "@/sample/product-detail";
import { sellerProfile } from "@/sample/seller-profiles";
import { productCard } from "@/sample/view";
import { AddToCart } from "../add-to-cart";
import { Breadcrumbs, type Crumb } from "../breadcrumbs";
import { Art, type ArtName, Icon } from "../icon";
import { Price } from "../price";
import { ProductCard } from "../product-card";
import { SampleMark } from "../sample-mark";
import { BuyBox, type BuyVariant } from "./buy-box";
import { type DetailSection, DetailTabs } from "./detail-tabs";
import { Gallery, type Shot } from "./gallery";
import { Questions, type QuestionView } from "./questions";
import { Reviews, type ReviewView } from "./reviews";
import { SaveButton } from "./save-button";

// Trang sản phẩm (bản thiết kế `Product`). Máy chủ dựng mọi phần (SEO, đọc được khi chưa có
// JavaScript); phần tương tác (bộ ảnh, khối mua, tab, đánh giá, hỏi đáp) là Client Component nhận dữ
// liệu đã định dạng. Dữ liệu mẫu (W-029) tới khi core có catalog, tồn, khuyến mại, đánh giá, sàn
// (bước 41–46).

const DAY = 86_400_000;

function variantName(product: SampleProduct, sku: string, locale: string): string {
  const variant = product.variants.find((v) => v.sku === sku);
  const label = variant?.labels ? ` ${text(variant.labels, locale)}` : "";
  return keepUnits(`${text(product.names, locale)}${label}`);
}

/** "Có thể bạn thích": cùng nhánh danh mục gốc, thiếu thì thêm hàng bán chạy (luôn ba món). */
function similar(product: SampleProduct): SampleProduct[] {
  let root = categoryById(product.category_id);
  while (root?.parent_id) root = categoryById(root.parent_id);
  const branch = new Set(root ? categoryTree(root.id) : []);
  const near = PRODUCTS.filter((p) => p.id !== product.id && branch.has(p.category_id));
  const rest = PRODUCTS.filter((p) => p.id !== product.id && !near.includes(p));
  return [...near, ...rest].slice(0, 3);
}

function together(product: SampleProduct): SampleProduct[] {
  const keys = togetherKeys(product.key);
  const list = keys
    ? keys.flatMap((key) => PRODUCTS.filter((p) => p.key === key))
    : PRODUCTS.filter((p) => p.id !== product.id);
  return list.slice(0, 4);
}

export async function ProductView({
  locale,
  product,
  sku,
  site,
  store,
  now,
}: {
  locale: Locale;
  product: SampleProduct;
  sku: string | null;
  site: SiteIdentity;
  store: StoreCode;
  now: number;
}) {
  const t = await getTranslations({ locale, namespace: "pdp" });
  const tc = await getTranslations({ locale, namespace: "product" });
  const name = keepUnits(text(product.names, locale));
  const detail = productDetail(product.key);
  const seller = product.seller ? sellerProfile(product.seller) : undefined;
  const initial = product.variants.find((v) => v.sku === sku) ?? variantBySku(product.default_sku);
  const flash = flashSale(now);
  const hasCoupon = product.variants.some((v) => couponPrice(v.sku) !== null);
  const [cy, cm, cd] = COUPON.ends_on.split("-");
  const couponEnds =
    locale === "vi" ? `${cd}/${cm}/${cy}` : formatDate(`${COUPON.ends_on}T12:00:00Z`, locale);

  // ---- Đường dẫn
  const category = categoryById(product.category_id);
  const parent = category?.parent_id ? categoryById(category.parent_id) : undefined;
  const crumbs: Crumb[] = [];
  if (parent)
    crumbs.push({
      label: text(parent.names, locale),
      href: routes.category(text(parent.slugs, locale)),
    });
  if (category) {
    crumbs.push({
      label: text(category.names, locale),
      href: routes.category(text(category.slugs, locale)),
    });
  }
  crumbs.push({ label: name });

  // ---- Khối mua
  const variants: BuyVariant[] = product.variants.map((v) => {
    const item = flash.items.find((f) => f.sku === v.sku);
    return {
      sku: v.sku,
      label: v.labels ? text(v.labels, locale) : null,
      price: v.price,
      couponPrice: couponPrice(v.sku),
      serves: v.serves ? `${v.serves[0]}–${v.serves[1]}` : null,
      stock: Object.fromEntries(STORES.map((s) => [s.code, availability(v.sku, s.code)])),
      flash: item
        ? {
            sale: item.sale,
            reference: item.reference,
            starts: flash.starts_at,
            ends: flash.ends_at,
            left: item.limit - item.used,
          }
        : null,
    };
  });
  const addons = addonSkus(
    product.key,
    product.variants.map((v) => v.sku),
  ).flatMap((addonSku) => {
    const owner = productBySku(addonSku);
    const variant = variantBySku(addonSku);
    if (!owner || !variant) return [];
    return [
      {
        sku: addonSku,
        name: variantName(owner, addonSku, locale),
        price: variant.price,
        art: owner.art,
        tone: owner.tone,
      },
    ];
  });
  const perks = [
    {
      icon: "ret" as const,
      title: t("perkReturns", { days: RETURN_DAYS }),
      text: t("perkReturnsText"),
    },
    product.warranty_months
      ? {
          icon: "shield" as const,
          title: t("perkWarranty", { months: product.warranty_months }),
          text: t("perkWarrantyText"),
        }
      : { icon: "shield" as const, title: t("perkGenuine"), text: t("perkGenuineText") },
    { icon: "card" as const, title: t("perkPay"), text: t("perkPayText") },
  ];

  // ---- Ảnh
  const shots: Shot[] =
    product.key === "castIronPan"
      ? [
          { art: "pan", tone: "t1", label: t("gallery.top") },
          { art: "pan", tone: "t3", label: t("gallery.base") },
          { art: "wok", tone: "t4", label: t("gallery.cooking") },
          { art: "plate", tone: "t5", label: t("gallery.sizes") },
        ]
      : [
          { art: product.art, tone: product.tone, label: t("gallery.main") },
          {
            art: product.art,
            tone: product.tone === "t3" ? "t2" : "t3",
            label: t("gallery.detail"),
          },
          { art: "plate", tone: "t5", label: t("gallery.inUse") },
        ];

  // ---- Đánh giá
  const distribution =
    DISTRIBUTIONS[product.key] ?? ratingDistribution(product.rating, product.reviews);
  const rating = averageOf(distribution) || product.rating;
  const summary = reviewSummary(product.key);
  const reviews: ReviewView[] = productReviews(product.key).map((review) => ({
    id: review.id,
    stars: review.stars,
    author: review.author,
    sku: review.sku,
    date: new Date(now - review.days_ago * DAY).toISOString().slice(0, 10),
    body: review.body,
    photos: review.photos.length,
    helpful: review.helpful,
    shown: shortName(review.author),
    dateText: formatDate(new Date(now - review.days_ago * DAY).toISOString(), locale),
    variantLabel:
      product.variants.length > 1
        ? (() => {
            const v = product.variants.find((x) => x.sku === review.sku);
            return v?.labels ? text(v.labels, locale) : null;
          })()
        : null,
    photoArts: review.photos,
    reply: review.reply,
  }));
  const questions: QuestionView[] = productQuestions(product.key).map((question) => ({
    id: question.id,
    body: question.body,
    who: shortName(question.author),
    when: formatDate(new Date(now - question.days_ago * DAY).toISOString(), locale),
    age: question.days_ago,
    helpfulTotal: question.answers.reduce((sum, a) => sum + a.helpful, 0),
    answers: question.answers.map((answer) => ({
      name: answer.role === "shop" ? site.name : shortName(answer.name),
      role: answer.role,
      when: formatDate(new Date(now - answer.days_ago * DAY).toISOString(), locale),
      body: answer.body,
      helpful: answer.helpful,
    })),
  }));

  // ---- Thông số và nhãn hàng hoá: dòng theo biến thể thành cột khi có nhiều biến thể.
  const many = product.variants.length > 1;
  const list = <T extends string>(
    values: readonly T[] | undefined,
    labels: Record<T, { vi: string; en: string }>,
  ) => (values && values.length > 0 ? values.map((v) => text(labels[v], locale)).join(", ") : null);
  const kg = (grams: number) =>
    `${(grams / 1000).toFixed(1).replace(".", locale === "vi" ? "," : ".")} kg`;
  const perVariant: { key: string; label: string; values: string[] }[] = [
    { key: "sku", label: t("spec.sku"), values: product.variants.map((v) => v.sku) },
    ...(product.variants.some((v) => v.barcode)
      ? [
          {
            key: "gtin",
            label: t("spec.barcode"),
            values: product.variants.map((v) => v.barcode ?? "—"),
          },
        ]
      : []),
    ...(product.variants.some((v) => v.serves)
      ? [
          {
            key: "serves",
            label: t("spec.serves"),
            values: product.variants.map((v) =>
              v.serves ? t("buy.serves", { range: `${v.serves[0]}–${v.serves[1]}` }) : "—",
            ),
          },
        ]
      : []),
    { key: "weight", label: t("spec.weight"), values: product.variants.map((v) => kg(v.grams)) },
    {
      key: "dims",
      label: t("spec.package"),
      values: product.variants.map(
        (v) => `${v.dims.map((mm) => groupDigits(Math.round(mm / 10), locale)).join(" × ")} cm`,
      ),
    },
  ];
  const fixed: { label: string; value: string }[] = [
    {
      label: text(ATTRIBUTES.material.names, locale),
      value: list(product.attrs.material, ATTRIBUTES.material.options),
    },
    {
      label: text(ATTRIBUTES.stove.names, locale),
      value: list(product.attrs.stove, ATTRIBUTES.stove.options),
    },
    {
      label: text(ATTRIBUTES.origin.names, locale),
      value: product.attrs.origin
        ? text(ATTRIBUTES.origin.options[product.attrs.origin], locale)
        : t("spec.missing"),
    },
    {
      label: t("spec.responsible"),
      value: product.responsible ?? t("spec.responsiblePlaceholder"),
    },
    {
      label: t("spec.warranty"),
      value: product.warranty_months
        ? t("spec.warrantyMonths", { months: product.warranty_months })
        : t("spec.noWarranty"),
    },
    ...(detail.dishwasher_safe !== null
      ? [
          {
            label: t("spec.dishwasher"),
            value: detail.dishwasher_safe ? t("spec.yes") : t("spec.no"),
          },
        ]
      : []),
    { label: t("spec.manual"), value: t("spec.manualValue") },
    { label: t("spec.tax"), value: t("spec.taxValue") },
  ].filter((row): row is { label: string; value: string } => row.value !== null);

  const sections: DetailSection[] = [
    {
      id: "desc",
      label: t("tabs.desc"),
      short: t("tabs.descShort"),
      meta: text(detail.summary, locale),
      content: (
        <div className="pp-desc">
          <div className="pp-desc-t">
            {detail.body.map((p) => (
              <p key={p.vi}>{text(p, locale)}</p>
            ))}
            <Link className="lnk" href={routes.search(text(product.names, locale))}>
              {t("readMore", { blog: site.blogName })}
            </Link>
          </div>
          {detail.highlights.length > 0 ? (
            <div className="pp-hl">
              <b>{t("highlights")}</b>
              <ul>
                {detail.highlights.map((h) => (
                  <li key={h.vi}>{text(h, locale)}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: "specs",
      label: t("tabs.specs"),
      short: t("tabs.specsShort"),
      meta: t("tabs.specsMeta"),
      content: (
        <div className="card pp-spec">
          <table>
            {many ? (
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">{t("spec.attribute")}</span>
                  </th>
                  {product.variants.map((v) => (
                    <th scope="col" key={v.sku}>
                      {v.labels ? text(v.labels, locale) : v.sku}
                    </th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {perVariant.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.label}</th>
                  {row.values.map((value, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: cột theo thứ tự biến thể, cố định
                    <td key={i} className="num">
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
              {fixed.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td colSpan={many ? product.variants.length : 1}>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted pp-small pp-specnote">{t("spec.note")}</p>
        </div>
      ),
    },
    ...(detail.care.length > 0 || detail.avoid.length > 0
      ? [
          {
            id: "care",
            label: t("tabs.care"),
            short: t("tabs.careShort"),
            meta: t("tabs.careMeta"),
            content: (
              <div className="pp-care">
                <ol className="pp-steps">
                  {detail.care.map((step) => (
                    <li key={step.title.vi}>
                      <b>{text(step.title, locale)}</b>
                      <span>{text(step.text, locale)}</span>
                    </li>
                  ))}
                </ol>
                {detail.avoid.length > 0 ? (
                  <div className="pp-avoid">
                    <b>{t("avoid")}</b>
                    <ul>
                      {detail.avoid.map((a) => (
                        <li key={a.vi}>{text(a, locale)}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ),
          },
        ]
      : []),
    ...(detail.in_box.length > 0
      ? [
          {
            id: "box",
            label: t("tabs.box"),
            short: t("tabs.boxShort"),
            meta: detail.in_box.map((x) => text(x.name, locale)).join(", "),
            content: (
              <div className="pp-box">
                <ul className="pp-inbox">
                  {detail.in_box.map((item, i) => (
                    <li key={item.name.vi}>
                      <span className={`thumb ${i === 0 ? product.tone : "t2"}`}>
                        {i === 0 ? <Art name={product.art} /> : <Icon name="box" />}
                      </span>
                      <span>
                        <b>
                          {item.quantity} × {text(item.name, locale)}
                        </b>
                      </span>
                    </li>
                  ))}
                </ul>
                {detail.not_included.length > 0 ? (
                  <p>
                    <b>{t("notIncluded")}</b>{" "}
                    {detail.not_included.map((x) => text(x, locale)).join(", ")}
                  </p>
                ) : null}
              </div>
            ),
          },
        ]
      : []),
    {
      id: "reviews",
      label: t("tabs.reviews", { count: product.reviews }),
      short: t("tabs.reviews", { count: product.reviews }),
      meta: t("tabs.reviewsMeta", { score: formatRating(rating, locale), count: product.reviews }),
      content: (
        <>
          <p className="pp-mark">
            <SampleMark endpoint="GET /api/v1/orders/public/products/{id}/reviews" step="45" />
          </p>
          <Reviews
            rating={rating}
            total={product.reviews}
            distribution={distribution}
            reviews={reviews}
            summary={summary ? text(summary.body, locale) : null}
            topics={(summary?.topics ?? []).map((x) => ({
              label: text(x.label, locale),
              count: x.count,
              keyword: x.keyword,
            }))}
            variants={
              many
                ? product.variants.map((v) => ({
                    sku: v.sku,
                    label: v.labels ? text(v.labels, locale) : v.sku,
                  }))
                : []
            }
            shopName={seller?.name ?? site.name}
            locale={locale}
          />
        </>
      ),
    },
    {
      id: "qa",
      label: t("tabs.qa", { count: questions.length }),
      short: t("tabs.qa", { count: questions.length }),
      meta: t("tabs.qaMeta", { count: questions.length }),
      content: (
        <>
          <p className="pp-mark">
            <SampleMark
              endpoint="GET /api/v1/comments/public/threads?target_type=catalog.product"
              step="41"
            />
          </p>
          <Questions product={name} questions={questions} />
        </>
      ),
    },
  ];

  // ---- Người bán và thông tin pháp lý
  const sellerName = seller?.name ?? site.name;
  const sold = seller
    ? t("soldBySeller", { seller: seller.name, market: site.marketplace ?? site.name })
    : t("soldByShop", { shop: site.name });

  // ---- JSON-LD `Product` kèm `Offer` từng biến thể (giá không cần mã, Google Search Central).
  const url = `${await siteUrl()}${getPathname({ href: routes.product(text(product.slugs, locale)), locale })}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description: text(detail.summary, locale),
    sku: initial?.sku,
    ...(initial?.barcode ? { gtin13: initial.barcode } : {}),
    brand: { "@type": "Brand", name: sellerName },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: Number(rating.toFixed(1)),
      reviewCount: product.reviews,
    },
    offers: product.variants.map((v) => {
      const level = availability(v.sku, store);
      return {
        "@type": "Offer",
        sku: v.sku,
        url: many ? `${url}?sku=${encodeURIComponent(v.sku)}` : url,
        price: v.price,
        priceCurrency: "VND",
        availability:
          level.kind === "out" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
        seller: { "@type": "Organization", name: sellerName },
      };
    }),
  };

  const alts = similar(product);
  const related = together(product);

  return (
    <main id="main" className="wrap pp pad-buybar">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD phải là chữ thô; `<` đã thoát nên không đóng được thẻ script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Breadcrumbs items={crumbs} />
      <div className="pp-top">
        <Gallery
          shots={shots}
          badge={hasCoupon ? tc("flagCoupon") : product.flag === "new" ? tc("flagNew") : null}
        />
        <section className="pp-info" aria-labelledby="pp-title">
          <div className="pp-head">
            <span className="kick">
              {sold}
              <SampleMark endpoint="GET /api/v1/catalog/public/products/by-slug/{slug}" step="41" />
            </span>
            <div className="pp-titlerow">
              <h1 id="pp-title" className="dsp pp-title">
                {name}
              </h1>
              <SaveButton
                id={product.id}
                labels={{ save: t("save"), unsave: t("unsave"), saved: t("savedHere") }}
              />
            </div>
            <a className="pp-stars" href="#reviews">
              <span className="stars" aria-hidden="true">
                ★★★★★
              </span>
              <span className="num pp-score">{formatRating(rating, locale)}</span>
              <span className="pp-revlink">{t("reviewsLink", { count: product.reviews })}</span>
            </a>
            <p className="muted pp-summary">{text(detail.summary, locale)}</p>
          </div>
          <BuyBox
            name={name}
            locale={locale}
            optionName={product.option ? text(product.option, locale) : null}
            variants={variants}
            initialSku={initial?.sku ?? product.default_sku}
            store={store}
            stores={STORES.map((s) => ({
              code: s.code,
              name: text(s.name, locale),
              hours: s.hours,
              pickup: s.pickup,
            }))}
            coupon={
              hasCoupon
                ? {
                    code: COUPON.code,
                    endsOn: couponEnds,
                    remaining: COUPON.remaining,
                    terms: text(COUPON.terms, locale),
                  }
                : null
            }
            zones={DELIVERY_ZONES.map((z) => ({
              code: z.code,
              name: text(z.name, locale),
              fee: z.fee,
              days: z.days,
            }))}
            freeFrom={FREE_SHIPPING_FROM}
            pickup={{ readyHours: PICKUP.ready_hours, holdDays: PICKUP.hold_days }}
            sellerShips={Boolean(seller)}
            addons={addons}
            perks={perks}
            now={now}
            checkoutPath={routes.checkout()}
          />
        </section>
      </div>

      <DetailTabs sections={sections} label={t("details")} />

      <section className="pp-legal" aria-labelledby="pp-legal-h">
        <h2 id="pp-legal-h" className="dsp pp-h2">
          {t("legal.title")}
          <SampleMark
            endpoint={
              seller
                ? "GET /api/v1/marketplace/public/sellers/{slug}"
                : "GET /api/v1/org/public/profile"
            }
            step={seller ? "46" : "34"}
          />
        </h2>
        <div className="pp-legal-g">
          <div className="card pp-sellercard">
            <span className="kick">{seller ? t("legal.seller") : t("legal.shop")}</span>
            <b className="pp-sellername">{sellerName}</b>
            {seller ? (
              <span className="pp-badges">
                {seller.verified ? (
                  <span className="badge b-ok">
                    <Icon name="check" small />
                    {t("legal.verified")}
                  </span>
                ) : null}
                <span className="badge b-plain">{t(`legal.type_${seller.type}`)}</span>
                {seller.rating ? (
                  <span className="muted pp-small">
                    ★ {formatRating(seller.rating.value, locale)} ·{" "}
                    {t("legal.sellerReviews", { count: seller.rating.count })}
                  </span>
                ) : null}
              </span>
            ) : null}
            <dl className="pp-dl">
              <div>
                <dt>{t("legal.taxCode")}</dt>
                <dd>{seller ? seller.tax_code : t("legal.shopTaxCode")}</dd>
              </div>
              <div>
                <dt>{t("legal.address")}</dt>
                <dd>{seller ? seller.address : t("legal.shopAddress")}</dd>
              </div>
              <div>
                <dt>{t("legal.phone")}</dt>
                <dd>{seller ? seller.phone : t("legal.shopPhone")}</dd>
              </div>
              {seller ? (
                <div>
                  <dt>{t("legal.fulfilment")}</dt>
                  <dd>
                    {seller.fulfillment === "platform"
                      ? t("legal.byPlatform", { market: site.marketplace ?? site.name })
                      : t("legal.bySeller")}
                  </dd>
                </div>
              ) : null}
            </dl>
            {seller ? (
              <Link className="lnk" href={routes.seller(seller.slug)}>
                {t("legal.visitSeller", { seller: seller.name })}
              </Link>
            ) : null}
          </div>
          <ul className="pp-terms">
            <li>
              <Icon name="ret" small />
              <span>
                <b>{t("legal.returnsTitle", { days: RETURN_DAYS })}</b>
                <span className="muted">
                  {seller
                    ? t("legal.returnsSeller", { seller: seller.name })
                    : t("legal.returnsShop")}
                </span>
              </span>
            </li>
            <li>
              <Icon name="shield" small />
              <span>
                <b>
                  {product.warranty_months
                    ? t("legal.warrantyTitle", { months: product.warranty_months })
                    : t("legal.noWarrantyTitle")}
                </b>
                <span className="muted">{t("legal.warrantyText")}</span>
              </span>
            </li>
            <li>
              <Icon name="card" small />
              <span>
                <b>{t("legal.payTitle")}</b>
                <span className="muted">{seller ? t("legal.payMarket") : t("legal.payShop")}</span>
              </span>
            </li>
            <li>
              <Icon name="flag" small />
              <span>
                <b>{t("legal.reportTitle")}</b>
                <span className="muted">{t("legal.reportText")}</span>
              </span>
            </li>
          </ul>
        </div>
      </section>

      <section className="pp-related" aria-labelledby="pp-together-h">
        <h2 id="pp-together-h" className="dsp pp-h2">
          {t("together")}
          <SampleMark
            endpoint="GET /api/v1/catalog/public/products/{id}/frequently-bought-together"
            step="41"
          />
        </h2>
        <div className="pgrid g4 pp-together">
          {related.map((p) => (
            <ProductCard key={p.id} product={productCard(p, store, locale)} locale={locale} />
          ))}
        </div>
      </section>

      <section className="pp-related" aria-labelledby="pp-alts-h">
        <div className="pp-alts-head">
          <h2 id="pp-alts-h" className="dsp pp-h2">
            {t("similar")}
          </h2>
          <span className="muted">{t("similarSub")}</span>
        </div>
        <ul className="pp-alts">
          {alts.map((p) => {
            const card = productCard(p, store, locale);
            return (
              <li className="pp-alt" key={p.id}>
                <Link
                  href={card.href}
                  className={`thumb ${p.tone}`}
                  aria-label={card.name}
                  tabIndex={-1}
                >
                  <Art name={p.art as ArtName} />
                </Link>
                <div className="pp-alt-b">
                  <Link href={card.href}>{card.name}</Link>
                  <span className="pp-alt-r">
                    ★ {formatRating(p.rating, locale)} · {t("reviewsLink", { count: p.reviews })}
                  </span>
                  <span className="pp-alt-p">
                    <Price money={card.price} locale={locale} />
                    {card.coupon ? (
                      <span className="pc-code">
                        <Price money={card.coupon.price} locale={locale} sale />{" "}
                        {tc("withCode", { code: card.coupon.code })}
                      </span>
                    ) : null}
                  </span>
                  <span className="pp-alt-d">{text(productDetail(p.key).summary, locale)}</span>
                  {card.quickAdd.length > 0 ? (
                    <AddToCart
                      skus={card.quickAdd}
                      className="btn sm"
                      label={tc("addNamed", { name: card.name })}
                      done={tc("added", { name: card.name })}
                    >
                      {t("buy.addToCart")}
                    </AddToCart>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
