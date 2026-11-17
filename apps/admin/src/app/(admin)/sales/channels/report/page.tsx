import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Chips } from "@/components/engage/common";
import {
  BlockHead,
  Cell2,
  DetailRow,
  hrefWith,
  Kpis,
  Lines,
  OpenLink,
  param,
} from "@/components/growth/blocks";
import { SampleBadge } from "@/components/sample-badge";
import { AutoFilter } from "@/components/ui/auto-filter";
import { TimeSeriesChart } from "@/components/ui/charts";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDay } from "@/lib/catalog";
import { dayPoints, presetRange } from "@/lib/chart";
import { formatCount, formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import {
  CHANNEL_COLORS,
  channelDaily,
  channelReport,
  DAILY_CHANNELS,
  defaultReportRange,
  settlementSummary,
} from "@/sample/channels";
import { CHANNEL_TABS } from "../shared";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Mốc chọn nhanh của kỳ báo cáo (ngày, kết thúc hôm nay). */
const PRESETS = [7, 30, 90] as const;

// Tab "Báo cáo": doanh thu, số đơn, tỉ lệ huỷ hoặc trả theo kênh, tính theo ngày đặt; phí kênh và thực nhận
// lấy từ bảng kê có kỳ nằm trong khoảng đã chọn. Cần `channels.read` và `orders.reports.read`. Đơn của
// người bán trên sàn là doanh thu của người bán, xem ở phân hệ Sàn.
export default async function ReportPage(props: PageProps<"/sales/channels/report">) {
  if (!(await can(CHANNEL_TABS.report))) notFound();
  const [t, tc, locale, params] = await Promise.all([
    getTranslations("channels"),
    getTranslations("charts"),
    getLocale(),
    props.searchParams,
  ]);
  const fallback = defaultReportRange();
  const from = DAY.test(param(params, "from")) ? param(params, "from") : fallback.from;
  const toRaw = DAY.test(param(params, "to")) ? param(params, "to") : fallback.to;
  // Ngày dạng YYYY-MM-DD so được như chuỗi; ngày cuối không trước ngày đầu.
  const to = [toRaw, from].sort().at(-1) ?? from;
  const open = param(params, "open");
  const [report, summary, daily] = await Promise.all([
    channelReport(from, to),
    settlementSummary(),
    channelDaily(from, to),
  ]);
  const money = (amount: string | number) => formatMoney(amount, "VND", locale);
  const total = report.rows.reduce((s, r) => s + Number(r.revenue.amount), 0);
  const orders = report.rows.reduce((s, r) => s + r.orders, 0);
  const external = report.rows.filter((r) => r.account_id !== null);
  const extRevenue = external.reduce((s, r) => s + Number(r.revenue.amount), 0);
  const fees = external.reduce((s, r) => s + Number(r.fees?.amount ?? 0), 0);
  const cancelled = report.rows.reduce((s, r) => s + r.cancelled_or_returned, 0);
  const pct = (n: number, d: number) =>
    d
      ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format((n / d) * 100)}%`
      : "0%";
  const base = { from, to };
  const label = (r: (typeof report.rows)[number]) =>
    r.account_id ? t(`kinds.${r.channel}`) : t(`report.own.${r.channel}`);
  const presets = PRESETS.map((days) => ({ days, ...presetRange(fallback.to, days) }));
  // Kênh không có doanh thu trong kỳ thì không vẽ đường; màu theo kênh nên kênh còn lại giữ màu.
  const lines = DAILY_CHANNELS.flatMap((channel) => {
    const values = daily.series.get(channel) ?? [];
    if (!values.some((v) => v !== 0)) return [];
    const own = channel === "web" || channel === "pos";
    return [
      {
        id: channel,
        label: own ? t(`report.own.${channel}`) : t(`kinds.${channel}`),
        values,
        color: CHANNEL_COLORS[channel],
      },
    ];
  });
  return (
    <div className="blocks">
      <form className="filters" action="/sales/channels/report" aria-label={t("report.period")}>
        <AutoFilter />
        <div className="fld">
          <label className="lab" htmlFor="rep-from">
            {t("report.from")}
          </label>
          <input id="rep-from" className="inp" type="date" name="from" defaultValue={from} />
        </div>
        <div className="fld">
          <label className="lab" htmlFor="rep-to">
            {t("report.to")}
          </label>
          <input id="rep-to" className="inp" type="date" name="to" defaultValue={to} />
        </div>
        <div className="filters-acts">
          <button type="submit" className="btn">
            {t("report.apply")}
          </button>
        </div>
      </form>
      <Chips
        label={tc("channels.presets")}
        chips={presets.map((p) => ({
          href: hrefWith("/sales/channels/report", { from: p.from, to: p.to }, {}),
          label: tc("channels.days", { days: p.days }),
          on: p.from === from && p.to === to,
        }))}
      />
      <Kpis
        label={t("report.kpis")}
        items={[
          {
            label: t("report.kpiRevenue"),
            value: money(total),
            sub: t("report.kpiRevenueSub", {
              n: formatCount(orders, locale),
              from: formatDay(from, locale),
              to: formatDay(to, locale),
            }),
          },
          {
            label: t("report.kpiExternal"),
            value: money(extRevenue),
            sub: t("report.kpiExternalSub", { pct: pct(extRevenue, total) }),
          },
          { label: t("report.kpiFees"), value: money(fees), sub: t("report.kpiFeesSub") },
          {
            label: t("report.kpiCancel"),
            value: pct(cancelled, orders),
            sub: t("report.kpiCancelSub", { n: cancelled, total: orders }),
          },
        ]}
      />
      <section className="block" aria-labelledby="daily-h">
        <div className="block-head">
          <h2 id="daily-h" className="h2">
            {tc("channels.title")}
          </h2>
          <SampleBadge step="45" endpoint="GET /api/v1/orders/reports/daily?group=channel" />
        </div>
        <div className="card padded">
          {lines.length === 0 ? (
            <p className="empty">{tc("channels.empty")}</p>
          ) : (
            <TimeSeriesChart
              label={tc("channels.title")}
              summary={tc("channels.summary", { count: lines.length, total: money(total) })}
              x={dayPoints(daily.days, locale)}
              series={lines}
              unit="money"
              locale={locale}
              height={240}
              text={{
                data: tc("viewData"),
                x: tc("day"),
                hint: tc("hintDays", { title: tc("channels.title") }),
              }}
            />
          )}
        </div>
        <p className="fhint">{tc("channels.about")}</p>
      </section>
      <section className="block" aria-labelledby="report-h">
        <BlockHead id="report-h" title={t("report.title")} about={t("report.about")} />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("report.channel")}</Th>
                <Th className="text-right">{t("report.orders")}</Th>
                <Th className="text-right">{t("report.revenue")}</Th>
                <Th className="text-right">{t("report.fees")}</Th>
                <Th className="text-right">{t("report.net")}</Th>
                <Th className="text-right">{t("report.cancel")}</Th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => {
                const isOpen = open === r.key;
                return [
                  <tr key={r.key} data-current={isOpen ? "" : undefined}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <OpenLink
                          open={isOpen}
                          href={hrefWith(
                            "/sales/channels/report",
                            base,
                            { open: r.key },
                            "#report-h",
                          )}
                          closeHref={hrefWith("/sales/channels/report", base, {})}
                        >
                          {label(r)}
                        </OpenLink>
                        <span className="sub">{r.label || t("report.allStores")}</span>
                      </span>
                    </Td>
                    <Td label={t("report.orders")} className="text-right num">
                      {formatCount(r.orders, locale)}
                    </Td>
                    <Td label={t("report.revenue")} className="text-right num">
                      {money(r.revenue.amount)}
                    </Td>
                    <Td label={t("report.fees")} className="text-right">
                      <Cell2
                        main={r.fees ? money(r.fees.amount) : "—"}
                        sub={r.fees ? t("report.fromStatements") : t("report.noChannel")}
                      />
                    </Td>
                    <Td label={t("report.net")} className="text-right">
                      <Cell2
                        main={r.net ? money(r.net.amount) : "—"}
                        sub={
                          r.account_id
                            ? t("report.awaiting", { n: r.awaiting_statement })
                            : t(`report.ownFlow.${r.channel}`)
                        }
                      />
                    </Td>
                    <Td label={t("report.cancel")} className="text-right">
                      <Cell2
                        main={pct(r.cancelled_or_returned, r.orders)}
                        sub={t("report.cancelN", { n: r.cancelled_or_returned })}
                      />
                    </Td>
                  </tr>,
                  isOpen ? (
                    <DetailRow key={`${r.key}-open`} cols={6}>
                      <h3 className="h2">
                        {label(r)} · {r.label || t("report.allStores")}
                      </h3>
                      <Lines
                        total
                        items={[
                          [t("report.ordersIn", { n: r.orders }), money(r.revenue.amount)],
                          [t("report.cancelN", { n: r.cancelled_or_returned }), "—"],
                          ...(r.fees
                            ? [[t("report.feesIn"), `−${money(r.fees.amount)}`] as const]
                            : []),
                          ...(r.net ? [[t("report.netIn"), money(r.net.amount)] as const] : []),
                          ...(r.account_id
                            ? [
                                [
                                  t("report.awaitingLine", { n: r.awaiting_statement }),
                                  "…",
                                ] as const,
                              ]
                            : []),
                        ]}
                      />
                      <p className="fhint">
                        {r.account_id ? t("report.extNote") : t("report.ownNote")}
                      </p>
                    </DetailRow>
                  ) : null,
                ];
              })}
            </tbody>
          </Table>
        </div>
        <p className="fhint">{t("report.foot", { n: report.marketplace_orders })}</p>
      </section>
      <section className="block half" aria-labelledby="share-h">
        <BlockHead id="share-h" title={t("report.shareTitle")} />
        <div className="card padded meters">
          {report.rows
            .filter((r) => Number(r.revenue.amount) > 0)
            .map((r) => {
              const v = Number(r.revenue.amount);
              return (
                <div key={r.key} className="meter">
                  <div className="meter-head">
                    <span>
                      {label(r)}
                      {r.account_id ? ` · ${r.label}` : ""}
                    </span>
                    <span className="num">
                      {money(v)} · {pct(v, total)}
                    </span>
                  </div>
                  <progress className="bar" max={total || 1} value={v} aria-label={label(r)} />
                </div>
              );
            })}
        </div>
      </section>
      <section className="block half" aria-labelledby="ledgermatch-h">
        <BlockHead
          id="ledgermatch-h"
          title={t("report.ledgerTitle")}
          about={t("report.ledgerAbout")}
        />
        <Lines
          total
          items={[
            [t("report.collected"), money(summary.collected.amount)],
            [t("report.posted"), `−${money(summary.posted.amount)}`],
            [t("report.receivable"), money(summary.receivable.amount)],
            [
              t("report.diff"),
              money(
                Number(summary.collected.amount) -
                  Number(summary.posted.amount) -
                  Number(summary.receivable.amount),
              ),
            ],
          ]}
        />
      </section>
    </div>
  );
}
