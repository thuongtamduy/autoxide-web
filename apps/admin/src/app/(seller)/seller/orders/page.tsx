import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { DisputeBadge } from "@/components/market/common";
import { AutoFilter } from "@/components/ui/auto-filter";
import { ConfirmAction } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatCount, formatMoney } from "@/lib/format";
import { ORDER_BADGE } from "@/lib/market";
import { sellerContext } from "@/lib/seller";
import { listSellerOrders, MARKET_ORDER_STATUSES, sellerOrderStats } from "@/sample/market";
import { shipOrderAction } from "../actions";

// Đơn của tôi: đơn của người mua đã tách theo người bán (bước 45 tách giỏ theo người bán); tiền của
// đơn nằm ở đối tác thu hộ tới khi hết hạn đổi trả. Chip lọc theo trạng thái (có số), tìm theo mã đơn
// hay tên người mua, việc kế tiếp ngay trên dòng (như Shopee / TikTok Seller Center). Thay bằng
// `GET /api/v1/orders?seller=me` khi có.
export default async function SellerOrders(props: PageProps<"/seller/orders">) {
  const ctx = await sellerContext();
  if (!ctx) return null;
  const [t, tm, locale, params] = await Promise.all([
    getTranslations("seller.orders"),
    getTranslations("market"),
    getLocale(),
    props.searchParams,
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const status = MARKET_ORDER_STATUSES.find((s) => s === one("status"));
  const q = one("q").slice(0, 100);
  const org = ctx.seller.org_id;
  const [{ data: orders }, { data: stats }] = await Promise.all([
    listSellerOrders(org, { ...(status ? { status } : {}), q }),
    sellerOrderStats(org),
  ]);
  const all = Object.values(stats.by_status).reduce((a, b) => a + b, 0);
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ status: status ?? "", q, ...change })) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/seller/orders?${query}` : "/seller/orders";
  };
  const chip = (value: string | null, label: string, count: number) => {
    const current = (value ?? "") === (status ?? "");
    return (
      <Link
        key={value ?? "all"}
        className={current ? "chip on" : "chip"}
        href={href({ status: value })}
        aria-current={current ? "page" : undefined}
      >
        {label} <span className="cnt">{formatCount(count, locale)}</span>
      </Link>
    );
  };
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="sl-orders-h">
        <h2 id="sl-orders-h" className="h2">
          {t("listTitle")}
        </h2>
        <p className="fhint">{t("about")}</p>
        <nav className="chips" aria-label={t("byStatus")}>
          {chip(null, t("all"), all)}
          {MARKET_ORDER_STATUSES.map((s) => chip(s, t(`chip.${s}`), stats.by_status[s]))}
        </nav>
        <search aria-label={t("search")}>
          <form className="filters" action="/seller/orders">
            <AutoFilter />
            {status ? <input type="hidden" name="status" value={status} /> : null}
            <div className="fld grow">
              <label className="lab" htmlFor="sl-orders-q">
                {t("search")}
              </label>
              <input
                id="sl-orders-q"
                className="inp"
                type="search"
                name="q"
                defaultValue={q}
                placeholder={t("searchHint")}
                maxLength={100}
              />
            </div>
            <div className="filters-acts">
              <button type="submit" className="btn">
                {t("filter")}
              </button>
              {q ? (
                <Link className="btn ghost" href={href({ q: null })}>
                  {t("clear")}
                </Link>
              ) : null}
            </div>
          </form>
        </search>
        <div className="card tcard">
          {orders.length === 0 ? (
            all === 0 ? (
              <EmptyState icon="bag" title={t("empty")}>
                {t("emptyBody")}
              </EmptyState>
            ) : (
              <EmptyState
                icon="search"
                title={t("noMatch")}
                actions={
                  <Link className="btn sm" href="/seller/orders">
                    {t("clear")}
                  </Link>
                }
              >
                {t("noMatchBody")}
              </EmptyState>
            )
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("order")}</Th>
                  <Th>{t("placed")}</Th>
                  <Th className="text-right">{t("total")}</Th>
                  <Th>{t("status")}</Th>
                  <Th>{t("money")}</Th>
                  <Th>
                    <span className="vh">{tm("actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b className="mono">{o.number}</b>
                        <span className="sub">
                          {o.buyer_name} · {t("items", { count: o.items })}
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
                        <span className={ORDER_BADGE[o.status]}>
                          <span className="dot" />
                          {t(`orderStatus.${o.status}`)}
                        </span>
                        {o.dispute ? <DisputeBadge status={o.dispute} /> : null}
                      </span>
                    </Td>
                    <Td label={t("money")}>
                      <span className="sub">
                        {o.settlement ? tm(`settlementStatus.${o.settlement}`) : "—"}
                      </span>
                    </Td>
                    <Td className="rt-acts">
                      <span className="row-acts">
                        {o.status === "paid" ? (
                          <ConfirmAction
                            action={shipOrderAction}
                            id={o.id}
                            label={t("ship")}
                            title={t("shipTitle", { number: o.number })}
                            points={[t("shipPoint1"), t("shipPoint2")]}
                            submit={t("shipSubmit")}
                            done={t("shipped", { number: o.number })}
                            danger={false}
                          />
                        ) : null}
                        {o.dispute === "open" ? (
                          <Link className="btn sm" href="/seller/orders/disputes">
                            {t("answer")}
                          </Link>
                        ) : null}
                      </span>
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
