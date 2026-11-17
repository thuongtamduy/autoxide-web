import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { TipHeading } from "@/components/help/info-tip";
import { IntroCard } from "@/components/help/intro-card";
import { ORDER_BADGE } from "@/components/orders/badges";
import { AskFilter, BulkForm, SaveViewDialog } from "@/components/orders/forms";
import { SampleBadge } from "@/components/sample-badge";
import { AutoFilter } from "@/components/ui/auto-filter";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { hintDismissed } from "@/help/flags";
import { myFlags } from "@/help/server";
import { loadAi } from "@/lib/content-server";
import { formatCount, formatMoney } from "@/lib/format";
import {
  CHANNELS,
  FLOWS,
  filterQuery,
  hasFilters,
  ORDER_STATUSES,
  ORDERS_MANAGE,
  type OrderFilters,
  ordersHref,
  PAYMENT_STATUSES,
  readFilters,
  without,
} from "@/lib/orders";
import { can } from "@/lib/viewer";
import { countOrders, listOrders, listViews } from "@/sample/orders";
import { ORDER_TABS, sellingNodes } from "../shared";

const GROUPS = {
  pending: "awaiting_acceptance,confirmed,preparing",
  undelivered: "confirmed,preparing,shipping,delivery_failed",
  delivered: "delivered,completed",
} as const;

// Tab "Đơn hàng": view đã lưu (của hệ thống, của nút, của tôi) với số đếm thật; lọc theo trạng thái,
// kênh, nút bán, dòng tiền, thanh toán, ngày đặt; "Hỏi bằng lời" khi AI bật; chọn nhiều đơn để xác
// nhận hay in phiếu giao. Bộ lọc nằm trên địa chỉ trang: sao chép liên kết là chia sẻ đúng bộ lọc.
export default async function OrdersPage(props: PageProps<"/sales/orders">) {
  if (!(await can(ORDER_TABS.orders))) {
    for (const tab of ["returns", "pos", "carts"] as const) {
      if (await can(ORDER_TABS[tab])) redirect(`/sales/orders/${tab}`);
    }
  }
  const [t, locale, params] = await Promise.all([
    getTranslations("orders"),
    getLocale(),
    props.searchParams,
  ]);
  const filters = readFilters(params);
  const cursor = typeof params.cursor === "string" ? params.cursor : null;
  const query = filterQuery(filters);
  const [page, matching, views, nodes, ai, manage, flags] = await Promise.all([
    listOrders(filters, { cursor }),
    countOrders(filters),
    listViews(),
    sellingNodes(t("market")),
    loadAi(),
    can(ORDERS_MANAGE),
    myFlags(),
  ]);
  const counted = await Promise.all(
    views.data.map(async (v) => ({
      ...v,
      count: await countOrders(readFilters(Object.fromEntries(new URLSearchParams(v.query)))),
    })),
  );
  const active = counted.find((v) => v.query === query) ?? null;
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  const statusLabel = (list: readonly string[]) => {
    const joined = list.join(",");
    const group = Object.entries(GROUPS).find(([, v]) => v === joined);
    return group ? t(`groups.${group[0]}`) : list.map((s) => t(`status.${s}`)).join(", ");
  };
  const nodeName = (id: string) => nodes.find((n) => n.value === id)?.label ?? id;
  const applied: [keyof OrderFilters, string][] = [];
  if (filters.status.length > 0) applied.push(["status", statusLabel(filters.status)]);
  if (filters.channel) applied.push(["channel", t(`channel.${filters.channel}`)]);
  if (filters.org) applied.push(["org", nodeName(filters.org)]);
  if (filters.flow) applied.push(["flow", t(`flow.${filters.flow}`)]);
  if (filters.pay) applied.push(["pay", t(`pay.${filters.pay}`)]);
  if (filters.from) applied.push(["from", t("list.fromChip", { day: filters.from })]);
  if (filters.q) applied.push(["q", `“${filters.q}”`]);
  const statusValue = filters.status.join(",");
  const statusOptions: { value: string; label: string }[] = [
    ...Object.entries(GROUPS).map(([k, v]) => ({ value: v, label: t(`groups.${k}`) })),
    ...ORDER_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
  ];
  if (statusValue && !statusOptions.some((o) => o.value === statusValue)) {
    statusOptions.unshift({ value: statusValue, label: statusLabel(filters.status) });
  }
  return (
    <div className="blocks">
      {hintDismissed(flags, "saved_views") ? null : <IntroCard id="saved_views" />}
      <section className="block" aria-labelledby="views-h">
        <div className="block-head">
          <TipHeading id="views-h" tip="saved_views">
            {t("views.title")}
          </TipHeading>
          {hasFilters(filters) && !active ? <SaveViewDialog query={query} /> : null}
        </div>
        <nav className="chips ord-views" aria-label={t("views.title")}>
          {counted.map((v) => (
            <Link
              key={v.id}
              className={active?.id === v.id ? "chip on" : "chip"}
              href={v.query ? `/sales/orders?${v.query}` : "/sales/orders"}
              aria-current={active?.id === v.id ? "page" : undefined}
              title={t(`views.scopes.${v.scope}`)}
            >
              {v.key ? t(`views.system.${v.key}`) : v.name}
              {v.scope !== "system" ? (
                <span className="scope">· {t(`views.short.${v.scope}`)}</span>
              ) : null}{" "}
              <span className="cnt">{formatCount(v.count, locale)}</span>
            </Link>
          ))}
          {active ? null : (
            <span className="chip on" aria-current="page">
              {t("views.custom")} <span className="cnt">{formatCount(matching, locale)}</span>
            </span>
          )}
        </nav>
      </section>

      <AskFilter enabled={ai.enabled} orgs={nodes} />

      <section className="block" aria-labelledby="orders-h">
        <div className="block-head">
          <h2 id="orders-h" className="h2">
            {t("list.title")}
          </h2>
          <a
            className="btn sm"
            href={`/sales/orders/export.csv${query ? `?${query}` : ""}`}
            download
          >
            {t("list.export")}
          </a>
        </div>
        <search aria-label={t("list.filters")}>
          <form className="filters" action="/sales/orders">
            <AutoFilter />
            <div className="fld">
              <label className="lab" htmlFor="f-status">
                {t("list.status")}
              </label>
              <select id="f-status" className="inp" name="status" defaultValue={statusValue}>
                <option value="">{t("list.any")}</option>
                {statusOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label className="lab" htmlFor="f-channel">
                {t("list.channel")}
              </label>
              <select
                id="f-channel"
                className="inp"
                name="channel"
                defaultValue={filters.channel ?? ""}
              >
                <option value="">{t("list.anyChannel")}</option>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {t(`channel.${c}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label className="lab" htmlFor="f-org">
                {t("list.node")}
              </label>
              <select id="f-org" className="inp" name="org" defaultValue={filters.org ?? ""}>
                <option value="">{t("list.anyNode")}</option>
                {nodes.map((n) => (
                  <option key={n.value} value={n.value}>
                    {n.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label className="lab" htmlFor="f-flow">
                {t("list.flow")}
              </label>
              <select id="f-flow" className="inp" name="flow" defaultValue={filters.flow ?? ""}>
                <option value="">{t("list.any")}</option>
                {FLOWS.map((f) => (
                  <option key={f} value={f}>
                    {t(`flow.${f}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label className="lab" htmlFor="f-pay">
                {t("list.payment")}
              </label>
              <select id="f-pay" className="inp" name="pay" defaultValue={filters.pay ?? ""}>
                <option value="">{t("list.any")}</option>
                {PAYMENT_STATUSES.map((p) => (
                  <option key={p} value={p}>
                    {t(`pay.${p}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label className="lab" htmlFor="f-from">
                {t("list.from")}
              </label>
              <input
                id="f-from"
                className="inp"
                type="date"
                name="from"
                defaultValue={filters.from ?? ""}
              />
            </div>
            <div className="fld grow">
              <label className="lab" htmlFor="f-q">
                {t("list.search")}
              </label>
              <input
                id="f-q"
                className="inp"
                type="search"
                name="q"
                maxLength={60}
                defaultValue={filters.q}
                placeholder={t("list.searchHint")}
              />
            </div>
            <div className="filters-acts">
              <button type="submit" className="btn">
                {t("list.filter")}
              </button>
            </div>
          </form>
        </search>
        {applied.length > 0 ? (
          <div className="ord-applied">
            <span>{t("list.applied")}</span>
            {applied.map(([key, label]) => (
              <Link
                key={key}
                className="chip"
                href={ordersHref(without(filters, key))}
                aria-label={t("list.removeFilter", { name: label })}
              >
                {label} <span aria-hidden="true">×</span>
              </Link>
            ))}
            <Link className="btn ghost sm" href="/sales/orders">
              {t("list.clear")}
            </Link>
          </div>
        ) : null}
        <p className="fhint" aria-live="polite">
          {t("list.count", {
            shown: formatCount(page.data.length, locale),
            total: formatCount(matching, locale),
          })}{" "}
          · {t("list.sorted")}
        </p>
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">{t("list.empty")}</p>
          ) : (
            <BulkForm query={query} matching={matching}>
              <Table cards className="ord-table">
                <thead>
                  <tr>
                    <Th className="ord-check">
                      {manage ? (
                        <input type="checkbox" data-all aria-label={t("bulk.page")} />
                      ) : null}
                    </Th>
                    <Th>{t("list.number")}</Th>
                    <Th>{t("list.buyer")}</Th>
                    <Th>{t("list.node")}</Th>
                    <Th>{t("list.channel")}</Th>
                    <Th>{t("list.payment")}</Th>
                    <Th>{t("list.status")}</Th>
                    <Th className="ord-total">{t("list.total")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {page.data.map((o) => (
                    <tr key={o.id}>
                      <Td className="ord-check">
                        {manage ? (
                          <label>
                            <input
                              type="checkbox"
                              name="ids"
                              value={o.id}
                              aria-label={t("bulk.one", { number: o.number })}
                            />
                          </label>
                        ) : null}
                      </Td>
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
                      <Td className="ord-m">
                        {o.buyer.name} · {o.seller?.name ?? o.org_name}
                      </Td>
                      <Td className="ord-d" label={t("list.buyer")}>
                        {o.buyer.name}
                      </Td>
                      <Td className="ord-d" label={t("list.node")}>
                        <span className="cell2">
                          <span>{o.org_name}</span>
                          {o.seller ? <span className="sub">{o.seller.name}</span> : null}
                        </span>
                      </Td>
                      <Td className="ord-d" label={t("list.channel")}>
                        {t(`channel.${o.channel}`)}
                      </Td>
                      <Td className="ord-d" label={t("list.payment")}>
                        <span className="cell2">
                          <span>{t(`method.${o.payment_method}`)}</span>
                          <span className="sub">{t(`flow.${o.flow}`)}</span>
                        </span>
                      </Td>
                      <Td className="ord-status" label={t("list.status")}>
                        <span className={ORDER_BADGE[o.status]}>
                          <span className="dot" />
                          {t(`status.${o.status}`)}
                        </span>
                      </Td>
                      <Td className="ord-total num" label={t("list.total")}>
                        {money(o.total.amount)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </BulkForm>
          )}
        </div>
        {page.pagination.next_cursor ? (
          <p>
            <Link
              className="btn"
              href={ordersHref(filters, { cursor: page.pagination.next_cursor })}
            >
              {t("list.more")}
            </Link>
          </p>
        ) : null}
        <p className="fhint">
          <SampleBadge
            step="52"
            endpoint="POST /api/v1/ai/filters/parse, GET/POST /api/v1/kernel/views"
          />{" "}
          {t("list.viewsNote")}
        </p>
      </section>
    </div>
  );
}
