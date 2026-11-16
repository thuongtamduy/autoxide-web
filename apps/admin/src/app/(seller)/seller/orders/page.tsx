import { getLocale, getTranslations } from "next-intl/server";
import { DisputeBadge } from "@/components/market/common";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatCount, formatMoney } from "@/lib/format";
import { SETTLEMENT_BADGE } from "@/lib/market";
import { sellerContext } from "@/lib/seller";
import { listSellerOrders } from "@/sample/market";

// Đơn của tôi: đơn của người mua đã tách theo người bán (bước 45 tách giỏ theo người bán); tiền của
// đơn nằm ở đối tác thu hộ tới khi hết hạn đổi trả. Thay bằng `GET /api/v1/orders?seller=me` khi có.
export default async function SellerOrders() {
  const ctx = await sellerContext();
  if (!ctx) return null;
  const [t, tm, locale] = await Promise.all([
    getTranslations("seller.orders"),
    getTranslations("market"),
    getLocale(),
  ]);
  const { data: orders } = await listSellerOrders(ctx.seller.org_id);
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="sl-orders-h">
        <h2 id="sl-orders-h" className="h2">
          {t("listTitle")}
        </h2>
        <p className="fhint">{t("about")}</p>
        <div className="card tcard">
          {orders.length === 0 ? (
            <p className="empty">{t("empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("order")}</Th>
                  <Th>{t("placed")}</Th>
                  <Th className="text-right">{t("total")}</Th>
                  <Th>{t("status")}</Th>
                  <Th>{t("money")}</Th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <span className="mono">{o.number}</span>
                        <span className="sub">
                          {t("items", { count: formatCount(o.items, locale) })}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("placed")}>
                      <Time value={o.placed_at} />
                    </Td>
                    <Td label={t("total")} className="text-right num">
                      {formatMoney(o.total.amount, o.total.currency, locale)}
                    </Td>
                    <Td label={t("status")}>
                      <span className="cell2">
                        <span>{t(`orderStatus.${o.status}`)}</span>
                        {o.dispute ? <DisputeBadge status={o.dispute} /> : null}
                      </span>
                    </Td>
                    <Td label={t("money")}>
                      {o.settlement ? (
                        <span className={SETTLEMENT_BADGE[o.settlement]}>
                          <span className="dot" />
                          {tm(`settlementStatus.${o.settlement}`)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
