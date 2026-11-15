import { getTranslations } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { keepUnits } from "@/lib/format";
import { type NavItem, splitMainMenu } from "@/lib/menu";
import { loadMenu } from "@/lib/menus-server";
import { routes } from "@/lib/routes";
import type { SiteIdentity } from "@/lib/site";
import { sampleDataEnabled, text } from "@/sample";
import { cartCount } from "@/sample/cart";
import { CATEGORIES, productsInCategory, STORES } from "@/sample/catalog";
import { readCart, readStore } from "@/sample/server";
import { SITE } from "@/sample/site";
import { menuBadgeTone } from "./badge";
import { ART, Art, Icon } from "./icon";
import { NavAnchor } from "./nav-link";
import { Price } from "./price";
import { SampleMark } from "./sample-mark";
import { StorePicker } from "./store-picker";
import { ThemeToggle } from "./theme-toggle";

// Đầu trang của website: dải cam kết (mẫu), hàng chính (logo, ô tìm, cửa hàng, tài khoản, sáng /
// tối, giỏ), thanh danh mục từ menu `main` của core. Bảng xổ của danh mục mở bằng CSS (rê chuột hay
// bàn phím, từ 1024px, `shop.css`); màn hẹp hơn thanh danh mục là dải chip cuộn ngang.

/** Biểu tượng của mục menu: tên trong bộ của core, hoặc hình danh mục mẫu khi mục trỏ tới nó. */
function ItemIcon({ item }: { item: NavItem }) {
  if (item.icon) return <Icon name={item.icon} small />;
  const category =
    item.ref?.kind === "catalog.category" ? CATEGORIES.find((c) => c.id === item.ref?.id) : null;
  if (!category) return null;
  return (
    <svg className="ic s" viewBox="0 0 24 24" aria-hidden="true">
      <path d={ART[category.art]} />
    </svg>
  );
}

async function MegaPanel({ item, locale }: { item: NavItem; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "nav" });
  // "Bán chạy" của danh mục chỉ có với danh mục mẫu: core chưa có catalog (bước 41).
  const top =
    sampleDataEnabled() && item.ref?.kind === "catalog.category"
      ? productsInCategory(item.ref.id).slice(0, 2)
      : [];
  const groups = item.groups;
  const columns = Math.max(groups.length, 1) + (top.length > 0 ? 1 : 0) + (item.feature ? 1 : 0);
  if (groups.length === 0 && top.length === 0 && !item.feature) return null;
  return (
    <div className="mega">
      <div className="wrap mega-in" style={{ "--cols": columns } as React.CSSProperties}>
        {(groups.length > 0 ? groups : [{ heading: null, links: [] }]).map((group, index) => (
          <div className="mega-col" key={group.heading ?? `g${index}`}>
            <span className="mega-k">{group.heading ?? t("groups")}</span>
            {group.links.map((link) => (
              <NavAnchor key={link.href + link.label} link={link} />
            ))}
            {index === 0 && item.link ? (
              <NavAnchor className="mega-h" link={item.link}>
                {t("seeAll", { label: item.label })}
              </NavAnchor>
            ) : null}
          </div>
        ))}
        {top.length > 0 ? (
          <div className="mega-top">
            <span className="mega-k">
              {t("bestSellers")}
              <SampleMark endpoint="GET /api/v1/catalog/public/products" step="41" />
            </span>
            {top.map((product) => {
              const variant = product.variants.find((v) => v.sku === product.default_sku);
              return (
                <Link
                  key={product.id}
                  className="mega-p"
                  href={routes.product(text(product.slugs, locale))}
                >
                  <span className={`thumb ${product.tone}`}>
                    <Art name={product.art} />
                  </span>
                  <span className="mega-pt">
                    <span>{keepUnits(text(product.names, locale))}</span>
                    <Price
                      money={{ amount: variant?.price ?? 0, currency: "VND" }}
                      locale={locale}
                    />
                  </span>
                </Link>
              );
            })}
          </div>
        ) : null}
        {item.feature ? (
          item.feature.link ? (
            <NavAnchor className="mega-promo" link={item.feature.link}>
              <span className="kick">{t("suggestion")}</span>
              <b className="dsp">{item.feature.title}</b>
              <span className="muted">{item.feature.summary}</span>
            </NavAnchor>
          ) : (
            <span className="mega-promo">
              <span className="kick">{t("suggestion")}</span>
              <b className="dsp">{item.feature.title}</b>
              <span className="muted">{item.feature.summary}</span>
            </span>
          )
        ) : null}
      </div>
    </div>
  );
}

export async function SiteHeader({ locale, site }: { locale: Locale; site: SiteIdentity }) {
  const t = await getTranslations({ locale, namespace: "header" });
  const tn = await getTranslations({ locale, namespace: "nav" });
  const sample = sampleDataEnabled();
  const main = await loadMenu("main", locale);
  const { categories, specials } = splitMainMenu(main.menu?.items ?? []);
  const count = sample ? cartCount(await readCart()) : 0;
  const store = await readStore();
  const searchAction = getPathname({ href: routes.search(), locale });

  return (
    <>
      {sample ? (
        <div className="strip">
          <div className="wrap strip-in">
            {SITE.strip.map((line) => (
              <span key={line.vi}>{text(line, locale)}</span>
            ))}
          </div>
        </div>
      ) : null}
      <header className="hdr">
        <div className="wrap hdr-row">
          <Link className="logo" href="/" aria-label={t("home", { name: site.name })}>
            <span className="mark">
              <Icon name="leaf" />
            </span>
            <span className="dsp logo-name">{site.name}</span>
          </Link>
          <span className="hdr-secure">
            <Icon name="lock" small />
            <span className="sec-a">{t("secure")}</span>
            <span className="sec-b">{t("secureShort")}</span>
          </span>
          <search className="hdr-search">
            <form action={searchAction} method="get">
              <label className="hs-field">
                <Icon name="search" className="hs-ic" />
                <input
                  className="inp"
                  type="search"
                  name="q"
                  maxLength={200}
                  placeholder={t("searchPlaceholder")}
                  aria-label={t("searchLabel")}
                />
              </label>
            </form>
          </search>
          <div className="hdr-gap" />
          {sample ? (
            <StorePicker
              value={store}
              label={t("store")}
              options={STORES.map((s) => ({ code: s.code, name: text(s.name, locale) }))}
            />
          ) : null}
          {sample ? (
            <Link className="iconbtn hdr-acc" href={routes.account()} aria-label={t("account")}>
              <Icon name="user" />
            </Link>
          ) : null}
          <ThemeToggle label={t("theme")} />
          {sample ? (
            <Link
              className="iconbtn hdr-cart"
              href={routes.cart()}
              aria-label={count > 0 ? t("cartCount", { count }) : t("cart")}
            >
              <Icon name="bag" />
              <span className="hide-mobile">{t("cart")}</span>
              {count > 0 ? (
                <span className="bubble" aria-hidden="true">
                  {count}
                </span>
              ) : null}
            </Link>
          ) : null}
        </div>
        {categories.length + specials.length > 0 ? (
          <nav className="wrap catnav" aria-label={tn("categories")}>
            {categories.length > 1 ? (
              <div className={`cn-item cn-all${sample ? "" : " cn-desk"}`}>
                {sample ? (
                  <Link className="cat-a" href={routes.catalog()}>
                    <Icon name="grid" small />
                    {tn("all")}
                  </Link>
                ) : (
                  <button type="button" className="cat-a">
                    <Icon name="grid" small />
                    {tn("all")}
                  </button>
                )}
                <div className="mega">
                  <div className="wrap mega-in mega-allgrid">
                    {categories.map((item) => (
                      <div className="mega-col" key={item.label}>
                        {item.link ? (
                          <NavAnchor className="mega-h" link={item.link} />
                        ) : (
                          <span className="mega-h">{item.label}</span>
                        )}
                        {item.groups
                          .flatMap((g) => g.links)
                          .map((link) => (
                            <NavAnchor key={link.href + link.label} link={link} />
                          ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
            {categories.map((item) => (
              <div className="cn-item" key={item.label}>
                {item.link ? (
                  <NavAnchor className="cat-a" link={item.link}>
                    <ItemIcon item={item} />
                    {item.label}
                  </NavAnchor>
                ) : (
                  <button type="button" className="cat-a">
                    <ItemIcon item={item} />
                    {item.label}
                  </button>
                )}
                <MegaPanel item={item} locale={locale} />
              </div>
            ))}
            <span className="cn-gap" aria-hidden="true" />
            {specials.map((item) =>
              item.link ? (
                <NavAnchor
                  key={item.label}
                  className={`cat-a cat-sp sp-${item.highlight}`}
                  link={item.link}
                >
                  <ItemIcon item={item} />
                  {item.label}
                  {item.badge ? (
                    <span className={`badge b-${menuBadgeTone(item.badge.tone)} nav-badge`}>
                      {item.badge.text}
                    </span>
                  ) : null}
                </NavAnchor>
              ) : null,
            )}
            {main.sample ? <SampleMark note={tn("sampleMenu", { key: "main" })} /> : null}
          </nav>
        ) : null}
      </header>
    </>
  );
}
