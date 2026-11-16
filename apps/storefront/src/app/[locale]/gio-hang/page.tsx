import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CartGroups } from "@/components/buyer/cart-groups";
import { CheckoutSteps } from "@/components/buyer/checkout-steps";
import { CodeCard } from "@/components/buyer/code-card";
import { QuoteSummary } from "@/components/buyer/quote-summary";
import { Icon } from "@/components/icon";
import { Price } from "@/components/price";
import { SampleMark } from "@/components/sample-mark";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { siteIdentity } from "@/lib/site";
import { sampleDataEnabled, text } from "@/sample";
import { readBuyer, readCode } from "@/sample/buyer-server";
import { COUPON } from "@/sample/catalog";
import { buildQuote, checkCode } from "@/sample/checkout";
import { readCart, readStore } from "@/sample/server";

// Giỏ hàng (bước 1 của đặt hàng, bản thiết kế `Checkout`): dòng chia theo nơi bán, số lượng, mã giảm,
// tóm tắt tiền. Trang khép kín (`enclosed`): đầu trang không có ô tìm, danh mục, dải khuyến mại.
// Mẫu: giỏ trong cookie `sf_cart`; thay bằng `GET /api/v1/orders/carts/{id}` (bước 45).

export async function generateMetadata(props: PageProps<"/[locale]/gio-hang">): Promise<Metadata> {
  const locale = (await props.params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "cart" });
  return pageMetadata({ locale, path: routes.cart(), title: t("title"), noindex: true });
}

export default async function CartPage(props: PageProps<"/[locale]/gio-hang">) {
  const locale = (await props.params).locale as Locale;
  if (!sampleDataEnabled()) notFound();
  const t = await getTranslations({ locale, namespace: "cart" });
  const site = await siteIdentity(locale);
  const lines = await readCart();
  const code = await readCode();
  const buyer = await readBuyer();
  const quote = buildQuote({
    lines,
    code,
    store: await readStore(),
    delivery: "ship",
    province: null,
    points: 0,
    balance: buyer?.points ?? null,
    now: new Date(),
  });
  const empty = quote.groups.length === 0;
  return (
    <main id="main" className="wrap enclosed co-pg">
      <div className="co-top">
        <h1 className="dsp co-h1">
          {t("title")}
          <SampleMark endpoint="GET /api/v1/orders/carts/{id}" step="45" />
        </h1>
        <CheckoutSteps current="cart" />
        {empty ? null : <span className="co-nextlab muted">{t("next")}</span>}
      </div>
      {empty ? (
        <div className="co-empty card">
          <Icon name="bag" />
          <span className="dsp">{t("empty")}</span>
          <span className="muted">{t("emptyHint")}</span>
          <Link className="btn pri" href={routes.home()}>
            {t("shop")}
          </Link>
          <Link className="lnk" href={routes.orderLookup()}>
            {t("lookup")}
          </Link>
        </div>
      ) : (
        <div className="co-cols">
          <div className="co-main">
            <CartGroups groups={quote.groups} locale={locale} siteName={site.name} />
            <CodeCard
              locale={locale}
              offer={{
                code: COUPON.code,
                title: text(COUPON.title, locale),
                terms: text(COUPON.terms, locale),
                eligible: checkCode(COUPON.code, lines) === "applied",
              }}
              current={quote.code}
            />
            <div className="co-nav">
              <Link className="btn ghost" href={routes.home()} aria-label={t("continue")}>
                <Icon name="left" small />
                <span className="hide-mobile">{t("continue")}</span>
              </Link>
              <span className="only-mobile co-nav-total">
                <span className="muted">{t("total")}</span>
                <Price money={{ amount: quote.total, currency: "VND" }} locale={locale} />
              </span>
              <Link className="btn pri" href={routes.checkout()}>
                {t("checkout")}
              </Link>
            </div>
          </div>
          <aside className="card by-sum" aria-labelledby="co-sum-h">
            <h2 className="dsp" id="co-sum-h">
              {t("summary")}
            </h2>
            <QuoteSummary quote={quote} locale={locale} siteName={site.name} delivery="ship">
              <Link className="btn pri wide hide-mobile" href={routes.checkout()}>
                {t("checkout")}
              </Link>
            </QuoteSummary>
          </aside>
        </div>
      )}
    </main>
  );
}
