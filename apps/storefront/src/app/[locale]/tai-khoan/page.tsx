import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AddToCart } from "@/components/add-to-cart";
import { AccountGate } from "@/components/buyer/account-gate";
import { AddressBook } from "@/components/buyer/address-book";
import { CopyButton } from "@/components/buyer/copy-button";
import { formatDateTime } from "@/components/buyer/day-range";
import { OrderStatusBadge, OrderView } from "@/components/buyer/order-view";
import { PrivacyPanel } from "@/components/buyer/privacy-panel";
import { ReturnForm } from "@/components/buyer/return-form";
import { Art, Icon, type IconName } from "@/components/icon";
import { Price } from "@/components/price";
import { SampleMark } from "@/components/sample-mark";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatMoney, initials, keepUnits } from "@/lib/format";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { siteIdentity } from "@/lib/site";
import { sampleDataEnabled, text } from "@/sample";
import {
  type Buyer,
  SAMPLE_ADDRESSES,
  SAMPLE_CONSENTS,
  SAMPLE_DOCUMENTS,
  SAMPLE_POINTS,
  SAMPLE_SAVED,
  tierProgress,
} from "@/sample/account";
import { cancelOrder, signOut } from "@/sample/account-actions";
import { buyerOrders, readAccountState, readBuyer } from "@/sample/buyer-server";
import { availability, storeByCode } from "@/sample/catalog";
import { LOYALTY } from "@/sample/checkout";
import { sellerBySlug } from "@/sample/market";
import { offerBySku } from "@/sample/offers";
import { type BuyerOrder, cancellable, returnWindow } from "@/sample/orders";
import { readStore } from "@/sample/server";

// Tài khoản người mua (bản thiết kế `Account`): chưa đăng nhập thì form đăng nhập / tạo tài khoản bằng
// số điện thoại + OTP; đã đăng nhập thì các mục đơn hàng (mốc giao, vận đơn, huỷ, đổi trả), đã lưu,
// điểm và hạng, sổ địa chỉ, quyền riêng tư. Mục chọn bằng `?muc=` (link thật, quay lại được, không cần
// JavaScript). Toàn bộ là mẫu (W-030); endpoint thay thế ghi ở `src/sample/account.ts`, `orders.ts`.

const SECTIONS = ["don-hang", "da-luu", "diem", "dia-chi", "quyen-rieng-tu"] as const;
type Section = (typeof SECTIONS)[number];
const SECTION_ICON: Record<Section, IconName> = {
  "don-hang": "bag",
  "da-luu": "heart",
  diem: "gift",
  "dia-chi": "pin",
  "quyen-rieng-tu": "shield",
};
const SECTION_KEY: Record<Section, string> = {
  "don-hang": "orders",
  "da-luu": "saved",
  diem: "points",
  "dia-chi": "addresses",
  "quyen-rieng-tu": "privacy",
};

export async function generateMetadata(props: PageProps<"/[locale]/tai-khoan">): Promise<Metadata> {
  const locale = (await props.params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "account" });
  return pageMetadata({ locale, path: routes.account(), title: t("title"), noindex: true });
}

export default async function AccountPage(props: PageProps<"/[locale]/tai-khoan">) {
  const locale = (await props.params).locale as Locale;
  if (!sampleDataEnabled()) notFound();
  const site = await siteIdentity(locale);
  const buyer = await readBuyer();
  if (!buyer) {
    return (
      <main id="main" className="wrap ac-page">
        <AccountGate locale={locale} siteName={site.name} />
      </main>
    );
  }
  const t = await getTranslations({ locale, namespace: "account" });
  const { muc } = await props.searchParams;
  const section: Section = (SECTIONS as readonly string[]).includes(String(muc))
    ? (muc as Section)
    : "don-hang";
  const orders = await buyerOrders(buyer);
  const sectionLabel = t(`nav.${SECTION_KEY[section]}`);
  return (
    <main id="main" className="wrap acx">
      <div className="acx-head rise">
        <span className="dsp acx-avatar" aria-hidden="true">
          {initials(buyer.name)}
        </span>
        <span className="acx-hello">
          <h1 className="dsp acx-h1">{t("hello", { name: buyer.name })}</h1>
          <span className="muted">
            {t("since", {
              name: site.name,
              since: `${buyer.since.slice(5, 7)}/${buyer.since.slice(0, 4)}`,
            })}{" "}
            <SampleMark endpoint="GET /api/v1/customers/me" step="47" />
          </span>
        </span>
        <form action={signOut}>
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="btn ghost sm">
            {t("signOut")}
          </button>
        </form>
      </div>
      <div className="acx-cols">
        <nav className="card accnav acx-nav" aria-label={t("navLabel")}>
          {SECTIONS.map((key) => (
            <Link
              key={key}
              href={routes.accountSection(key)}
              className={`acx-nav-a${key === section ? " on" : ""}`}
              aria-current={key === section ? "page" : undefined}
            >
              <Icon name={SECTION_ICON[key]} small />
              <span>{t(`nav.${SECTION_KEY[key]}`)}</span>
            </Link>
          ))}
        </nav>
        <section className="acx-main" aria-labelledby="acx-sec">
          <h2 className="dsp acx-sec-h" id="acx-sec">
            {sectionLabel}
          </h2>
          {section === "don-hang" ? (
            <OrdersSection orders={orders} locale={locale} siteName={site.name} />
          ) : section === "da-luu" ? (
            <SavedSection locale={locale} />
          ) : section === "diem" ? (
            <PointsSection buyer={buyer} locale={locale} siteName={site.name} />
          ) : section === "dia-chi" ? (
            <AddressBook
              initial={buyer.kind === "sample" ? SAMPLE_ADDRESSES : []}
              locale={locale}
            />
          ) : (
            <PrivacyPanel
              consents={
                buyer.kind === "sample"
                  ? SAMPLE_CONSENTS
                  : SAMPLE_CONSENTS.map((c) => ({ ...c, granted: false, days_ago: null }))
              }
              documents={SAMPLE_DOCUMENTS.map((doc) => ({
                title: t(`privacy.documents.${doc.kind}`),
                version: doc.version,
                effective: `${doc.effective.slice(8, 10)}/${doc.effective.slice(5, 7)}/${doc.effective.slice(0, 4)}`,
              }))}
              openOrders={orders
                .filter((o) => !["completed", "cancelled"].includes(o.status))
                .map((o) => o.number)}
              siteName={site.name}
            />
          )}
        </section>
      </div>
    </main>
  );
}

async function OrdersSection({
  orders,
  locale,
  siteName,
}: {
  orders: BuyerOrder[];
  locale: Locale;
  siteName: string;
}) {
  const t = await getTranslations({ locale, namespace: "account.orders" });
  const state = await readAccountState();
  const now = new Date();
  if (orders.length === 0) {
    return (
      <div className="card co-empty">
        <Icon name="bag" />
        <span className="dsp">{t("empty")}</span>
        <Link className="btn pri" href={routes.home()}>
          {t("shop")}
        </Link>
      </div>
    );
  }
  return (
    <div className="acx-orders">
      {orders.map((order, index) => {
        const span = returnWindow(order, now);
        const returned = state.returns.includes(order.number);
        const seller = order.seller ? (sellerBySlug(order.seller)?.display_name ?? "") : siteName;
        return (
          <details className="card acx-order" key={order.number} open={index === 0}>
            <summary className="acx-ohead">
              <span className="acx-oinfo">
                <span className="num">{order.number}</span>
                <span className="muted">
                  {seller} · {formatDateTime(order.placed_at, locale)}
                </span>
              </span>
              <OrderStatusBadge status={order.status} />
              <Price money={{ amount: order.total, currency: "VND" }} locale={locale} />
              <Icon name="down" small className="acx-chev" />
            </summary>
            <OrderView order={order} locale={locale} siteName={siteName} head={false}>
              {returned ? (
                <p className="acx-retl wait">
                  <Icon name="ret" small />
                  {t("returnWaiting")}
                </p>
              ) : span ? (
                span.days_left > 0 ? (
                  <>
                    <p className="acx-retl">
                      <Icon name="ret" small />
                      {t("returnLeft", {
                        days: span.days_left,
                        until: formatDateTime(span.until, locale),
                      })}
                    </p>
                    <ReturnForm
                      number={order.number}
                      lines={order.lines}
                      locale={locale}
                      daysLeft={span.days_left}
                    />
                  </>
                ) : (
                  <p className="acx-retl off">
                    <Icon name="clock" small />
                    {t("returnClosed")}
                  </p>
                )
              ) : null}
              {cancellable(order) ? (
                <form action={cancelOrder}>
                  <input type="hidden" name="number" value={order.number} />
                  <button type="submit" className="btn sm ghost">
                    {t("cancel")}
                  </button>
                </form>
              ) : null}
              {order.seller && order.status !== "cancelled" ? (
                <span className="muted acx-held">{t("held")}</span>
              ) : null}
            </OrderView>
          </details>
        );
      })}
    </div>
  );
}

async function SavedSection({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "account.saved" });
  const store = await readStore();
  const storeName = text(storeByCode(store).name, locale);
  return (
    <div className="card acx-card">
      {SAMPLE_SAVED.map((item) => {
        const offer = offerBySku(item.sku);
        if (!offer) return null;
        const name = keepUnits(
          offer.option
            ? `${text(offer.names, locale)} · ${text(offer.option, locale)}`
            : text(offer.names, locale),
        );
        const stock = offer.seller === null ? availability(item.sku, store) : null;
        const out = stock?.kind === "out";
        return (
          <div className="acx-row" key={item.sku}>
            <span className={`thumb ${offer.tone} acx-thumb`}>
              <Art name={offer.art} />
            </span>
            <span className="acx-rbody">
              <span>{name}</span>
              <span className="muted">
                <Price money={{ amount: offer.price, currency: "VND" }} locale={locale} />
                {" · "}
                {offer.seller
                  ? t("bySeller", { seller: sellerBySlug(offer.seller)?.display_name ?? "" })
                  : out
                    ? t("out", { store: storeName })
                    : t("inStock", { store: storeName })}
              </span>
            </span>
            <span className="acx-rside">
              {out && item.notify ? <span className="badge b-warn">{t("notify")}</span> : null}
              {!out && offer.sellable ? (
                <AddToCart
                  skus={[item.sku]}
                  className="btn sm"
                  label={t("addNamed", { name })}
                  done={t("added", { name })}
                >
                  {t("add")}
                </AddToCart>
              ) : null}
            </span>
          </div>
        );
      })}
      <p className="muted">{t("note")}</p>
    </div>
  );
}

async function PointsSection({
  buyer,
  locale,
  siteName,
}: {
  buyer: Buyer;
  locale: Locale;
  siteName: string;
}) {
  const t = await getTranslations({ locale, namespace: "account.points" });
  const tier = await getTranslations({ locale, namespace: "account.tier" });
  const money = (amount: number) => formatMoney({ amount, currency: "VND" }, locale);
  const progress = tierProgress(buyer);
  const history = buyer.kind === "sample" ? SAMPLE_POINTS : [];
  return (
    <>
      <div className="card acx-card acx-points">
        <span className="acx-points-head">
          <b className="dsp num">{t("balance", { points: buyer.points })}</b>
          <span className="muted">
            {t("tier", { tier: tier(buyer.tier) })} ·{" "}
            {t("value", { value: money(buyer.points * LOYALTY.point_value) })}
          </span>
        </span>
        <span
          className="by-free-bar"
          role="progressbar"
          aria-label={t("progress")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <span style={{ width: `${progress}%` }} />
        </span>
        <span className="muted">
          {buyer.next_tier_at
            ? t("next", {
                amount: money(Math.max(0, buyer.next_tier_at - buyer.spent_12m)),
                tier: tier(buyer.tier === "member" ? "silver" : "gold"),
              })
            : t("top")}{" "}
          {t("rule", { name: siteName, value: money(LOYALTY.point_value) })}
        </span>
      </div>
      <div className="card acx-card">
        {history.length === 0 ? <p className="muted">{t("empty")}</p> : null}
        {history.map((entry) => (
          <div className="acx-row" key={`${entry.reference}-${entry.points}`}>
            <Icon name="gift" small />
            <span className="acx-rbody">
              <span>
                {t(`reason.${entry.reason}`, { points: entry.points, reference: entry.reference })}
              </span>
              <span className="muted">
                {entry.status === "pending"
                  ? t("pendingIn", { days: Math.abs(entry.days_ago) })
                  : t("daysAgo", { days: entry.days_ago })}
              </span>
            </span>
            <span
              className={`badge ${entry.status === "pending" ? "b-warn" : entry.status === "used" ? "b-plain" : "b-ok"}`}
            >
              {t(`status.${entry.status}`)}
            </span>
          </div>
        ))}
        {buyer.kind === "sample" ? (
          <div className="acx-row">
            <Icon name="user" small />
            <span className="acx-rbody">
              <span>{t("referral")}</span>
              <span className="muted">{t("referralText", { code: "LANCHI50" })}</span>
            </span>
            <CopyButton value="LANCHI50" label={t("copyReferral")} done={t("copied")}>
              {t("copy")}
            </CopyButton>
          </div>
        ) : null}
      </div>
    </>
  );
}
