import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CheckoutForm } from "@/components/buyer/checkout-form";
import { Icon } from "@/components/icon";
import { SampleMark } from "@/components/sample-mark";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";
import { siteIdentity } from "@/lib/site";
import { sampleDataEnabled, text } from "@/sample";
import { SAMPLE_ADDRESSES } from "@/sample/account";
import { readBuyer, readCode } from "@/sample/buyer-server";
import { storeByCode } from "@/sample/catalog";
import { STORE_PICKUP } from "@/sample/checkout";
import { readCart, readStore } from "@/sample/server";

// Đặt hàng: người nhận, cách nhận, địa chỉ (bước 2) rồi điểm, cách trả, hoá đơn, đồng ý (bước 3), một
// form ở trình duyệt (`CheckoutForm`), đặt bằng Server Action. Trang khép kín, không vào chỉ mục.
// Mẫu; thay bằng `PUT /api/v1/orders/carts/{id}/delivery` + `POST /api/v1/orders/checkout` (bước 45).

export async function generateMetadata(
  props: PageProps<"/[locale]/thanh-toan">,
): Promise<Metadata> {
  const locale = (await props.params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "checkout" });
  return pageMetadata({ locale, path: routes.checkout(), title: t("title"), noindex: true });
}

export default async function CheckoutPage(props: PageProps<"/[locale]/thanh-toan">) {
  const locale = (await props.params).locale as Locale;
  if (!sampleDataEnabled()) notFound();
  const t = await getTranslations({ locale, namespace: "checkout" });
  const site = await siteIdentity(locale);
  const lines = await readCart();
  const buyer = await readBuyer();
  const tier = await getTranslations({ locale, namespace: "account.tier" });
  if (lines.length === 0) {
    return (
      <main id="main" className="wrap enclosed co-pg">
        <div className="co-empty card">
          <Icon name="bag" />
          <h1 className="dsp">{t("emptyTitle")}</h1>
          <span className="muted">{t("emptyHint")}</span>
          <Link className="btn pri" href={routes.home()}>
            {t("shop")}
          </Link>
        </div>
      </main>
    );
  }
  return (
    <main id="main" className="wrap enclosed co-pg">
      <p className="co-sample muted">
        <SampleMark endpoint="POST /api/v1/orders/checkout" step="45" />
        {t("sampleNote")}
      </p>
      <CheckoutForm
        locale={locale}
        siteName={site.name}
        lines={lines}
        code={await readCode()}
        store={await readStore()}
        buyer={
          buyer
            ? {
                name: buyer.name,
                phone: buyer.phone,
                points: buyer.points,
                tier: tier(buyer.tier),
                addresses:
                  buyer.kind === "sample"
                    ? SAMPLE_ADDRESSES.map((a) => ({
                        id: a.id,
                        label: text(a.label, locale),
                        street: a.street,
                        province: a.province,
                        ward: a.ward,
                      }))
                    : [],
              }
            : null
        }
        pickupStores={STORE_PICKUP.map((code) => {
          const store = storeByCode(code);
          return {
            code,
            name: text(store.name, locale),
            address: text(store.address, locale),
            hours: store.hours,
          };
        })}
        nowIso={new Date().toISOString()}
        idempotencyKey={randomUUID()}
      />
    </main>
  );
}
