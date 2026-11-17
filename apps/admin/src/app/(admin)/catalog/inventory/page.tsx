import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { STOCK_BADGE } from "@/components/catalog/badges";
import { AdjustDialog, ReorderDialog, TransferDialog } from "@/components/inventory/forms";
import { AutoFilter } from "@/components/ui/auto-filter";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { INVENTORY_ADJUST, INVENTORY_SETTINGS, INVENTORY_TRANSFER, signed } from "@/lib/catalog";
import { formatCount, formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import {
  getLevel,
  inventoryStats,
  listLevels,
  type StockStatus,
  warehouses,
} from "@/sample/inventory";

const FILTERS: (StockStatus | "below")[] = ["low", "out", "out_backorder"];

// Tab "Tồn kho": tồn theo biến thể × kho. "Có" là hàng trong kho (`on_hand`), "giữ" là phần đã hứa
// cho đơn chưa xuất, "sẵn bán" là phần còn bán được (`available`). Mở một dòng để xem chỗ giữ, lô,
// serial, biến động gần đây và điều chỉnh / chuyển / đổi mức tối thiểu.
export default async function LevelsPage(props: PageProps<"/catalog/inventory">) {
  const [t, locale, params] = await Promise.all([
    getTranslations("inventory"),
    getLocale(),
    props.searchParams,
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const status = FILTERS.find((s) => s === one("status"));
  const org = one("org");
  const q = one("q").slice(0, 200);
  const open = one("open");
  const [units, page, { data: stats }, detail, adjust, transfer, settings] = await Promise.all([
    warehouses(),
    listLevels({
      locale,
      ...(status ? { status } : {}),
      ...(org ? { org_id: org } : {}),
      q,
      cursor: one("cursor") || null,
    }),
    inventoryStats(),
    open ? getLevel(open, locale) : Promise.resolve(null),
    can(INVENTORY_ADJUST),
    can(INVENTORY_TRANSFER),
    can(INVENTORY_SETTINGS),
  ]);
  const options = units.map((u) => ({ value: u.id, label: u.name }));
  const money = (amount: string, currency: string) => formatMoney(amount, currency, locale);
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = { status: status ?? "", org, q, ...change };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/catalog/inventory?${query}` : "/catalog/inventory";
  };
  const max = Math.max(1, ...stats.by_org.map((o) => Number(o.value.amount)));

  return (
    <div className="blocks">
      <section className="block" aria-label={t("levels.kpis")}>
        <div className="kpis">
          <div className="card kpi">
            <span className="kpi-label">{t("levels.kpiValue")}</span>
            <b className="kpi-value">{money(stats.value.amount, stats.value.currency)}</b>
            <span className="kpi-sub">{t("levels.kpiValueSub")}</span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("levels.kpiLow")}</span>
            <b className="kpi-value">{formatCount(stats.low, locale)}</b>
            <span className="kpi-sub">
              {stats.low_by_org.map((x) => `${x.org_name} ${x.count}`).join(" · ") || "—"}
            </span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("levels.kpiOut")}</span>
            <b className="kpi-value">{formatCount(stats.out, locale)}</b>
            <span className="kpi-sub">{t("levels.kpiOutSub")}</span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("levels.kpiTransit")}</span>
            <b className="kpi-value">{t("levels.transfers", { count: stats.in_transit })}</b>
            <span className="kpi-sub">
              <Link className="open" href="/catalog/inventory/transfers?status=in_transit">
                {t("levels.kpiTransitSub")}
              </Link>
            </span>
          </div>
        </div>
      </section>

      <section className="block" aria-labelledby="levels-h">
        <div className="block-head">
          <h2 id="levels-h" className="h2">
            {t("levels.title")}
          </h2>
        </div>
        <p className="fhint">{t("levels.about")}</p>
        <nav className="chips" aria-label={t("levels.byStatus")}>
          <Link
            className={status ? "chip" : "chip on"}
            href={href({ status: null, cursor: null })}
            aria-current={status ? undefined : "page"}
          >
            {t("levels.all")}
          </Link>
          {FILTERS.map((s) => (
            <Link
              key={s}
              className={status === s ? "chip on" : "chip"}
              href={href({ status: s, cursor: null })}
              aria-current={status === s ? "page" : undefined}
            >
              {t(`stock.${s}`)}
            </Link>
          ))}
        </nav>
        <search aria-label={t("levels.search")}>
          <form className="filters" action="/catalog/inventory">
            <AutoFilter />
            {status ? <input type="hidden" name="status" value={status} /> : null}
            <div className="fld grow">
              <label className="lab" htmlFor="inv-q">
                {t("levels.search")}
              </label>
              <input
                id="inv-q"
                className="inp"
                type="search"
                name="q"
                defaultValue={q}
                placeholder={t("levels.searchHint")}
                maxLength={200}
              />
            </div>
            <div className="fld">
              <label className="lab" htmlFor="inv-org">
                {t("levels.warehouse")}
              </label>
              <select id="inv-org" className="inp" name="org" defaultValue={org}>
                <option value="">{t("levels.allWarehouses")}</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="filters-acts">
              <button type="submit" className="btn">
                {t("levels.filter")}
              </button>
            </div>
          </form>
        </search>
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">{t("levels.empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("levels.variant")}</Th>
                  <Th>{t("levels.warehouse")}</Th>
                  <Th className="text-right">{t("levels.available")}</Th>
                  <Th>{t("levels.state")}</Th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((row) => {
                  const isOpen = open === row.id;
                  const level = isOpen ? detail?.data.level : undefined;
                  return [
                    <tr key={row.id} data-current={isOpen ? "" : undefined}>
                      <Td className="rt-title">
                        <span className="cell2">
                          <Link
                            className="open"
                            href={
                              isOpen ? href({ open: null }) : `${href({ open: row.id })}#levels-h`
                            }
                            scroll={false}
                            aria-expanded={isOpen}
                          >
                            {row.name}
                            {row.variant_label ? ` · ${row.variant_label}` : ""}
                          </Link>
                          <span className="sub mono">{row.sku}</span>
                        </span>
                      </Td>
                      <Td label={t("levels.warehouse")}>{row.org_name}</Td>
                      <Td label={t("levels.available")} className="text-right">
                        <span className="cell2">
                          <b>
                            {formatCount(row.available, locale)} /{" "}
                            {row.reorder_point === null
                              ? "—"
                              : formatCount(row.reorder_point, locale)}
                          </b>
                          <span className="sub">
                            {t("levels.onHand", { onHand: row.on_hand, reserved: row.reserved })}
                          </span>
                        </span>
                      </Td>
                      <Td label={t("levels.state")}>
                        <span className={STOCK_BADGE[row.status]}>
                          <span className="dot" />
                          {t(`stock.${row.status}`)}
                        </span>
                      </Td>
                    </tr>,
                    isOpen && level && detail ? (
                      <tr key={`${row.id}-open`} className="cat-detail-row">
                        <td colSpan={4}>
                          <div className="cat-detail">
                            <h3 className="h2">
                              {level.name} · {level.org_name}
                            </h3>
                            <dl className="kv cat-kv">
                              <dt>{t("levels.onHandLong")}</dt>
                              <dd>{formatCount(level.on_hand, locale)}</dd>
                              <dt>{t("levels.reservedLong")}</dt>
                              <dd>
                                {formatCount(level.reserved, locale)}
                                {detail.data.reservations.length > 0
                                  ? ` · ${detail.data.reservations.map((r) => `${r.order_number} (${r.quantity})`).join(", ")}`
                                  : ""}
                              </dd>
                              <dt>{t("levels.availableLong")}</dt>
                              <dd>{formatCount(level.available, locale)}</dd>
                              <dt>{t("levels.incoming")}</dt>
                              <dd>{formatCount(level.incoming, locale)}</dd>
                              <dt>{t("levels.reorder")}</dt>
                              <dd>{level.reorder_point ?? "—"}</dd>
                              <dt>{t("levels.cost")}</dt>
                              <dd>
                                {money(level.average_cost.amount, level.average_cost.currency)}
                              </dd>
                              <dt>{t("levels.backorder")}</dt>
                              <dd>{level.allow_negative ? t("levels.yes") : t("levels.no")}</dd>
                              <dt>{t("levels.tracking")}</dt>
                              <dd>
                                {level.lot_tracked
                                  ? t("levels.lots", {
                                      list:
                                        detail.data.lots
                                          .map((l) => `${l.lot_code} (${l.on_hand})`)
                                          .join(", ") || "—",
                                    })
                                  : level.serial_tracked
                                    ? t("levels.serials", {
                                        list:
                                          detail.data.serials.map((x) => x.serial).join(", ") ||
                                          "—",
                                      })
                                    : t("levels.none")}
                              </dd>
                            </dl>
                            <p className="fhint">{t("levels.ledgerNote")}</p>
                            <ol className="timeline">
                              {detail.data.movements.map((m) => (
                                <li key={m.id}>
                                  <span className="sub">
                                    <Time value={m.created_at} /> ·{" "}
                                    {m.actor?.name ?? t("moves.system")}
                                  </span>
                                  {t(`moveKinds.${m.kind}`)} {signed(m.quantity, locale)}
                                  {m.source_label ? ` · ${m.source_label}` : ""}
                                  {m.reason_code ? ` · ${t(`reasons.${m.reason_code}`)}` : ""}
                                </li>
                              ))}
                            </ol>
                            <span className="row-acts start">
                              <Link
                                className="btn sm"
                                href={`/catalog/inventory/moves?level=${level.id}`}
                              >
                                {t("levels.viewLedger")}
                              </Link>
                              {adjust ? (
                                <AdjustDialog
                                  warehouses={options}
                                  org={level.org_id}
                                  code={level.sku}
                                  primary
                                />
                              ) : null}
                              {transfer ? (
                                <TransferDialog
                                  warehouses={options}
                                  to={level.org_id}
                                  from={options.find((o) => o.value !== level.org_id)?.value ?? ""}
                                  lines={`${level.sku} × ${Math.max(1, (level.reorder_point ?? 0) - level.available)}`}
                                />
                              ) : null}
                              {settings ? (
                                <ReorderDialog
                                  id={level.id}
                                  current={
                                    level.reorder_point === null ? "" : String(level.reorder_point)
                                  }
                                />
                              ) : null}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </Table>
          )}
        </div>
        <div className="pager">
          <span className="fhint">
            {t("levels.foot", { shown: page.data.length, low: stats.low })}
          </span>
          {page.pagination.next_cursor ? (
            <Link className="btn sm" href={href({ cursor: page.pagination.next_cursor })}>
              {t("levels.next")}
            </Link>
          ) : null}
        </div>
      </section>

      <section className="block half" aria-labelledby="value-h">
        <h2 id="value-h" className="h2">
          {t("levels.valueTitle")}
        </h2>
        <p className="fhint">{t("levels.valueAbout")}</p>
        <div className="card padded meters">
          {stats.by_org.map((o) => (
            <div className="meter" key={o.org_id}>
              <div className="meter-head">
                <span>{o.org_name}</span>
                <b>{money(o.value.amount, o.value.currency)}</b>
              </div>
              <progress
                className="bar"
                max={max}
                value={Number(o.value.amount)}
                aria-label={o.org_name}
              />
            </div>
          ))}
        </div>
      </section>
      <section className="block half" aria-labelledby="oversell-h">
        <h2 id="oversell-h" className="h2">
          {t("levels.oversellTitle")}
        </h2>
        <p className="note">
          <b>{t("levels.oversellStrong")}</b> {t("levels.oversell")}
        </p>
      </section>
    </div>
  );
}
