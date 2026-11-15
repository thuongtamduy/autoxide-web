import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { commerceGate } from "@/app/(admin)/catalog/gate";
import { PrintButton } from "@/components/orders/forms";
import { SampleBadge } from "@/components/sample-badge";
import { formatMoney } from "@/lib/format";
import { ORDERS_POS_SELL, ORDERS_READ } from "@/lib/orders";
import { getOrder } from "@/sample/orders";
import { ENDPOINTS_45 } from "../../shared";
import "@/components/orders/orders.css";

// Bản xem trước hoá đơn của đơn tại quầy (hoá đơn khởi tạo từ máy tính tiền, NĐ 123/2020 sửa bởi NĐ
// 70/2025 — cần đối chiếu văn bản gốc). Bản in thật do bộ nối hoá đơn điện tử của bước 36 lập; ở đây chỉ
// dựng trang để in thử bằng trình duyệt. Ký hiệu, số hoá đơn, mã số thuế là mẫu.
export default async function ReceiptPage(props: PageProps<"/sales/orders/[id]/receipt">) {
  const gate = await commerceGate([ORDERS_READ, ORDERS_POS_SELL]);
  if (gate) return gate;
  const [{ id }, search, t, locale] = await Promise.all([
    props.params,
    props.searchParams,
    getTranslations("orders.receipt"),
    getLocale(),
  ]);
  const found = await getOrder(id);
  if (!found) notFound();
  const o = found.data;
  const money = (amount: string | number) => formatMoney(amount, "VND", locale);
  const vat = o.lines.reduce(
    (s, l) => s + l.taxes.reduce((x, y) => x + Number(y.amount.amount), 0),
    0,
  );
  const fresh = search.new === "1";
  return (
    <div className="page cat-page">
      <section className="phead no-print">
        <div className="phead-main">
          <Link className="crumb" href={`/sales/orders/${o.id}`}>
            ← {o.number}
          </Link>
          <h1 className="h1">{t("title")}</h1>
          <p className="pdesc">
            {fresh ? t("created", { number: o.number, store: o.org_name }) : t("description")}
          </p>
          <span className="cat-sample">
            <SampleBadge step="45" endpoint={`${ENDPOINTS_45}; invoices (36)`} />
          </span>
        </div>
        <div className="headacts">
          <PrintButton label={t("print")} />
          <Link className="btn" href="/sales/orders/pos">
            {t("again")}
          </Link>
        </div>
      </section>
      <article className="ord-paper" aria-label={t("title")}>
        <h2>{t("heading")}</h2>
        <p className="muted">
          {t("seller", { store: o.org_name })}
          <br />
          {t("taxCode")}
        </p>
        <p>
          {o.invoice
            ? t("series", { series: o.invoice.series, number: o.invoice.number })
            : t("noInvoice")}
          <br />
          {t("order", { number: o.number })} ·{" "}
          {new Intl.DateTimeFormat(locale, {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: "Asia/Ho_Chi_Minh",
          }).format(new Date(o.placed_at))}
        </p>
        <hr />
        <table>
          <tbody>
            {o.lines.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.name}
                  <br />
                  <span className="muted">
                    {l.quantity} × {money(l.unit_price.amount)}
                    {l.taxes[0]
                      ? ` · ${t("vatRate", { rate: Number(l.taxes[0].rate) * 100 })}`
                      : ""}
                    {Number(l.discount.amount) > 0 ? ` · −${money(l.discount.amount)}` : ""}
                  </span>
                </td>
                <td className="r">{money(l.net.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr />
        <table>
          <tbody>
            <tr>
              <th>{t("total")}</th>
              <th className="r">{money(o.total.amount)}</th>
            </tr>
            <tr>
              <td className="muted">{t("vatIncluded")}</td>
              <td className="r muted">{money(vat)}</td>
            </tr>
            <tr>
              <td>{t("paidBy", { method: t(`methods.${o.payment_method}`) })}</td>
              <td className="r">{money(o.paid.amount)}</td>
            </tr>
          </tbody>
        </table>
        <hr />
        <p className="muted">{t("footer")}</p>
      </article>
    </div>
  );
}
