import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ORDER_BADGE } from "@/components/orders/badges";
import { type PosStore, PosTerminal } from "@/components/orders/pos";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatMoney } from "@/lib/format";
import { NO_FILTERS } from "@/lib/orders";
import { can } from "@/lib/viewer";
import { listOrders } from "@/sample/orders";
import { openShiftAt, posCatalog } from "@/sample/stores";
import { ORDER_TABS, storeOptions } from "../../shared";

// Tab "Bán tại quầy": quầy bán (chọn cửa hàng, sản phẩm, cách trả; cần ca thu ngân đang mở) và các đơn
// tại quầy gần đây. Tạo đơn thì trừ tồn của cửa hàng, lập hoá đơn từ máy tính tiền, mở bản xem trước
// để in.
export default async function PosPage() {
  if (!(await can(ORDER_TABS.pos))) notFound();
  const [t, locale, stores] = await Promise.all([
    getTranslations("orders"),
    getLocale(),
    storeOptions(),
  ]);
  const [catalogs, shifts, recent] = await Promise.all([
    Promise.all(stores.map((s) => posCatalog(s.value, locale))),
    Promise.all(stores.map((s) => openShiftAt(s.value))),
    listOrders({ ...NO_FILTERS, channel: "pos" }, { limit: 10 }),
  ]);
  const data: PosStore[] = stores.map((s, i) => ({
    id: s.value,
    name: s.label,
    shift: shifts[i]
      ? {
          id: shifts[i].id,
          register: shifts[i].register_code,
          cashier: shifts[i].opened_by.name,
          since: shifts[i].opened_at,
        }
      : null,
    items: (catalogs[i]?.data ?? []).map((c) => ({
      sku: c.sku,
      name: c.name,
      barcode: c.barcode,
      category: c.category,
      price: Number(c.price.amount),
      vat: c.vat_percent,
      available: c.available,
    })),
  }));
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="pos-h">
        <div className="block-head">
          <h2 id="pos-h" className="h2">
            {t("pos.title")}
          </h2>
        </div>
        <p className="fhint">{t("pos.about")}</p>
        <PosTerminal stores={data} />
      </section>
      <section className="block" aria-labelledby="pos-recent-h">
        <div className="block-head">
          <h2 id="pos-recent-h" className="h2">
            {t("pos.recent")}
          </h2>
          <Link className="btn sm" href="/sales/orders?channel=pos">
            {t("pos.all")}
          </Link>
        </div>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("list.number")}</Th>
                <Th>{t("list.node")}</Th>
                <Th>{t("list.payment")}</Th>
                <Th>{t("list.status")}</Th>
                <Th className="text-right">{t("list.total")}</Th>
              </tr>
            </thead>
            <tbody>
              {recent.data.map((o) => (
                <tr key={o.id}>
                  <Td className="rt-title">
                    <span className="cell2">
                      <Link className="open mono" href={`/sales/orders/${o.id}`}>
                        {o.number}
                      </Link>
                      <span className="sub">
                        <Time value={o.placed_at} />
                      </span>
                    </span>
                  </Td>
                  <Td label={t("list.node")}>{o.org_name}</Td>
                  <Td label={t("list.payment")}>{t(`method.${o.payment_method}`)}</Td>
                  <Td label={t("list.status")}>
                    <span className={ORDER_BADGE[o.status]}>
                      <span className="dot" />
                      {t(`status.${o.status}`)}
                    </span>
                  </Td>
                  <Td label={t("list.total")} className="text-right num">
                    {money(o.total.amount)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>
    </div>
  );
}
