import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { commerceGate } from "@/app/(admin)/catalog/gate";
import { PrintButton } from "@/components/orders/forms";
import { SampleBadge } from "@/components/sample-badge";
import { formatCount } from "@/lib/format";
import { ORDERS_MANAGE, readFilters } from "@/lib/orders";
import { getOrders, matchingIds } from "@/sample/orders";
import { ENDPOINTS_45 } from "../shared";
import "@/components/orders/orders.css";

// Phiếu giao của các đơn đã chọn (thao tác hàng loạt "In phiếu giao"): bản xem trước để in bằng trình
// duyệt. Khi core có, phiếu giao là tệp do job sinh (bước 51) hay phiếu của hãng vận chuyển (bước 44).
export default async function PrintPage(props: PageProps<"/sales/orders/print">) {
  const gate = await commerceGate(ORDERS_MANAGE);
  if (gate) return gate;
  const [params, t, locale] = await Promise.all([
    props.searchParams,
    getTranslations("orders.slips"),
    getLocale(),
  ]);
  const ids =
    params.all === "1"
      ? await matchingIds(readFilters(params))
      : (typeof params.ids === "string" ? params.ids.split(",") : []).slice(0, 200);
  const { data } = await getOrders(ids.slice(0, 200));
  return (
    <div className="page cat-page">
      <section className="phead no-print">
        <div className="phead-main">
          <Link className="crumb" href="/sales/orders">
            ← {t("back")}
          </Link>
          <h1 className="h1">{t("title")}</h1>
          <p className="pdesc">{t("description", { count: formatCount(data.length, locale) })}</p>
          <span className="cat-sample">
            <SampleBadge step="45" endpoint={`${ENDPOINTS_45}; kernel jobs (51)`} />
          </span>
        </div>
        <div className="headacts">
          {data.length > 0 ? <PrintButton label={t("print")} /> : null}
        </div>
      </section>
      {data.length === 0 ? <p className="empty">{t("empty")}</p> : null}
      {data.map((o) => (
        <article key={o.id} className="ord-paper wide ord-slip" aria-label={o.number}>
          <h2>{t("heading", { number: o.number })}</h2>
          <p>
            {t("from", { store: o.seller?.name ?? o.org_name })}
            <br />
            {o.ship_to
              ? t("to", {
                  name: o.buyer.name,
                  line: o.ship_to.line,
                  commune: o.ship_to.commune,
                  province: o.ship_to.province,
                })
              : o.pickup
                ? t("pickup", { name: o.buyer.name, store: o.pickup.org_name })
                : t("counter", { name: o.buyer.name })}
          </p>
          <table>
            <tbody>
              {o.lines.map((l) => (
                <tr key={l.id}>
                  <td className="mono">{l.sku}</td>
                  <td>{l.name}</td>
                  <td className="r">× {l.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">
            {o.payment_method === "cod"
              ? t("cod", { amount: formatCount(Number(o.total.amount), locale) })
              : t("prepaid")}
          </p>
        </article>
      ))}
    </div>
  );
}
