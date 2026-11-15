import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CheckoutSteps } from "@/components/buyer/checkout-steps";
import { CopyButton } from "@/components/buyer/copy-button";
import { formatDateTime } from "@/components/buyer/day-range";
import { OrderView } from "@/components/buyer/order-view";
import { Icon } from "@/components/icon";
import { SampleMark } from "@/components/sample-mark";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatMoney } from "@/lib/format";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { siteIdentity } from "@/lib/site";
import { sampleDataEnabled } from "@/sample";
import { parseNumbers, readBuyer, readPlacedNumbers } from "@/sample/buyer-server";
import { confirmPayment } from "@/sample/checkout-actions";
import { placedOrder } from "@/sample/order-store";
import type { BuyerOrder } from "@/sample/orders";

// "Đặt hàng thành công" (bước 4 của bản thiết kế `Checkout`): các đơn vừa tạo (mỗi nơi bán một đơn),
// cách trả tiếp theo (VietQR của đối tác thu hộ, trang thẻ của cổng thanh toán, hay trả khi nhận), gợi
// ý lưu vào tài khoản. Chỉ hiện đơn đặt trên trình duyệt này (cookie `sf_orders`, như token xem đơn
// của core). Mẫu; thay bằng kết quả của `POST /api/v1/orders/checkout` (`orders[]`,
// `payment_actions[]`) và `GET /api/v1/orders/public/payments/{token}` (bước 45).

export async function generateMetadata(
  props: PageProps<"/[locale]/thanh-toan/xong">,
): Promise<Metadata> {
  const locale = (await props.params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "placed" });
  return pageMetadata({ locale, path: "/thanh-toan/xong", title: t("title"), noindex: true });
}

function QrArt() {
  // Hình đứng thay mã QR thật (đối tác thu hộ sinh mã): ô vuông cố định, ghi rõ "mẫu" bên cạnh.
  const cells = [
    "M2 2h7v7H2z M15 2h7v7h-7z M2 15h7v7H2z",
    "M11 2h2v2h-2z M11 6h2v3h-2z M15 11h2v2h-2z M19 11h3v2h-3z M11 11h3v2h-3z M2 11h3v2H2z M6 11h3v2H6z M11 15h2v3h-2z M15 15h3v2h-3z M19 17h3v5h-3z M11 20h6v2h-6z",
  ];
  return (
    <svg className="pl-qr" viewBox="0 0 24 24" aria-hidden="true">
      {cells.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export default async function PlacedPage(props: PageProps<"/[locale]/thanh-toan/xong">) {
  const locale = (await props.params).locale as Locale;
  if (!sampleDataEnabled()) notFound();
  const t = await getTranslations({ locale, namespace: "placed" });
  const site = await siteIdentity(locale);
  const { ma } = await props.searchParams;
  const mine = await readPlacedNumbers();
  const asked = parseNumbers(typeof ma === "string" ? ma : "");
  const orders = asked
    .filter((number) => mine.includes(number))
    .map(placedOrder)
    .filter((o): o is BuyerOrder => o !== null);
  const buyer = await readBuyer();
  const money = (amount: number) => formatMoney({ amount, currency: "VND" }, locale);

  if (orders.length === 0) {
    return (
      <main id="main" className="wrap enclosed co-pg">
        <div className="co-empty card">
          <Icon name="search" />
          <h1 className="dsp">{t("missingTitle")}</h1>
          <span className="muted">{t("missingHint")}</span>
          <Link className="btn pri" href={routes.orderLookup()}>
            {t("lookup")}
          </Link>
        </div>
      </main>
    );
  }

  const first = orders[0] as BuyerOrder;
  const total = orders.reduce((sum, o) => sum + o.total, 0);
  const pending = orders.some((o) => o.status === "pending_payment");
  const contact = first.contact;
  return (
    <main id="main" className="wrap enclosed co-pg">
      <div className="co-top">
        <h1 className="dsp co-h1">{t("thanks")}</h1>
        <CheckoutSteps current="done" />
      </div>
      <section className="card pl-done rise" aria-labelledby="pl-h">
        <span className="pl-ok" aria-hidden="true">
          <Icon name="check" />
        </span>
        <h2 className="dsp" id="pl-h">
          {t("title")}
          <SampleMark endpoint="POST /api/v1/orders/checkout" step="45" />
        </h2>
        <p>
          {orders.length > 1
            ? t("split", { count: orders.length })
            : t("single", { number: first.number })}{" "}
          {contact.email ? t("byEmail", { email: contact.email }) : t("bySms")}
        </p>

        {first.payment_method === "vietqr" ? (
          <div className="pl-pay">
            <QrArt />
            <div className="pl-pay-body">
              <span className="pl-pay-head">
                <b>{t("qr.title", { amount: money(total) })}</b>
                <span className={`badge ${pending ? "b-warn" : "b-ok"}`}>
                  {pending ? t("qr.waiting") : t("qr.received")}
                </span>
              </span>
              {pending ? (
                <>
                  <span className="muted">
                    {t("qr.note", {
                      until: first.pay_until ? formatDateTime(first.pay_until, locale) : "",
                    })}
                  </span>
                  <span className="pl-acct">
                    <span className="muted">{t("qr.account")}</span>
                    <b className="num">{t("qr.accountValue")}</b>
                  </span>
                  <span className="pl-acct">
                    <span className="muted">{t("qr.memo")}</span>
                    <b className="num">{first.payment_ref}</b>
                    <CopyButton
                      value={first.payment_ref ?? ""}
                      label={t("qr.copyMemo")}
                      done={t("qr.copied")}
                    >
                      {t("qr.copy")}
                    </CopyButton>
                  </span>
                  <form action={confirmPayment} className="pl-btns">
                    <input type="hidden" name="number" value={first.number} />
                    <button type="submit" className="btn sm">
                      {t("qr.paid")}
                    </button>
                    <span className="muted">{t("qr.paidNote")}</span>
                  </form>
                </>
              ) : (
                <span className="muted">{t("qr.done")}</span>
              )}
            </div>
          </div>
        ) : first.payment_method === "card" ? (
          <div className="pl-pay">
            <Icon name="card" />
            <div className="pl-pay-body">
              <span className="pl-pay-head">
                <b>{t("card.title", { amount: money(total) })}</b>
                <span className={`badge ${pending ? "b-warn" : "b-ok"}`}>
                  {pending ? t("card.waiting") : t("card.received")}
                </span>
              </span>
              <span className="muted">{pending ? t("card.note") : t("card.done")}</span>
              {pending ? (
                <form action={confirmPayment} className="pl-btns">
                  <input type="hidden" name="number" value={first.number} />
                  <button type="submit" className="btn sm pri">
                    {t("card.partner")}
                  </button>
                  <span className="muted">{t("card.partnerNote")}</span>
                </form>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="pl-pay">
            <Icon name="cash" />
            <div className="pl-pay-body">
              <b>{t("cod.title", { amount: money(total) })}</b>
              <span className="muted">{t("cod.note")}</span>
            </div>
          </div>
        )}

        <h3 className="dsp pl-orders-h">{t("orders", { count: orders.length })}</h3>
        <div className="pl-orders">
          {orders.map((order) => (
            <div className="card pl-order" key={order.number}>
              <OrderView order={order} locale={locale} siteName={site.name} compact />
            </div>
          ))}
        </div>

        {buyer ? null : (
          <div className="pl-save">
            <Icon name="key" />
            <span>
              <b>{t("save.title")}</b>
              <span className="muted">{t("save.text")}</span>
            </span>
            <Link className="btn sm" href={routes.account()}>
              {t("save.cta")}
            </Link>
          </div>
        )}
        <div className="pl-btns">
          <Link
            className="btn pri"
            href={buyer ? routes.accountSection("don-hang") : routes.orderLookup()}
          >
            {t("track")}
          </Link>
          <Link className="btn" href={routes.home()}>
            {t("home")}
          </Link>
        </div>
      </section>
    </main>
  );
}
