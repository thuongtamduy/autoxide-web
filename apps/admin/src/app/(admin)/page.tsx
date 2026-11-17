import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Chips } from "@/components/engage/common";
import { PlanCard } from "@/components/plans/plan-card";
import { SampleBadge } from "@/components/sample-badge";
import { Icon } from "@/components/shell/icon";
import { ChangeFigure, Sparkline, TimeSeriesChart } from "@/components/ui/charts";
import { ToastProvider } from "@/components/ui/toast";
import { ActivityList } from "@/components/work/activity-list";
import { TaskList } from "@/components/work/task-list";
import {
  dayPoints,
  dayRange,
  formatChange,
  percentChange,
  periodWithPrevious,
  shiftDay,
} from "@/lib/chart";
import { formatCount, formatMoney } from "@/lib/format";
import { ORDERS_POS_SELL, ORDERS_READ } from "@/lib/orders";
import { enabledModuleNames } from "@/lib/plans-server";
import { getMe, getModules } from "@/lib/viewer";
import { visibleNav } from "@/nav/nav";
import { sampleDataEnabled } from "@/sample";
import { ordersState } from "@/sample/orders";
import { dayText, renderMessage } from "@/work/format";
import { readMetrics } from "@/work/metrics";
import { vietnamDayOf } from "@/work/registry";
import { lastRevenueDay, revenueByDay, revenueOn, revenueToday } from "@/work/revenue";
import { assignCandidates, recentActivity, waiting, workContext, workRows } from "@/work/server";
import { readSetup, SETUP_ENDPOINT } from "@/work/setup";
import type { MetricView } from "@/work/types";
import "@/components/engage/engage.css";
import "@/components/work/work.css";
import { TipHeading } from "@/components/help/info-tip";

/** Số việc gấp nhất hiện ở Tổng quan; đủ mọi việc ở màn Việc và hoạt động. */
const TOP = 8;
const VN = "Asia/Ho_Chi_Minh";
/** Kỳ chọn được của biểu đồ doanh thu (ngày); mặc định kỳ đầu. */
const REVENUE_PERIODS = [7, 30] as const;
/** Sparkline của ô "Doanh thu hôm nay": bấy nhiêu ngày gần nhất. */
const TILE_TREND_DAYS = 14;

// Tổng quan (W-020): lời chào, số liệu của các phân hệ đã bật (mỗi ô ghi nguồn: API thật hay dữ liệu
// mẫu), hộp việc rút gọn, việc thiết lập theo mô hình, doanh thu hôm nay theo nút, hoạt động gần đây và
// lối vào các phân hệ. Mọi khối theo permission của người xem; số và việc gom từ sổ nguồn ở `src/work/`
// (bước 51 của core: `kernel/summary`, `kernel/work`, `kernel/setup`, `audit/activity`).
export default async function DashboardPage(props: PageProps<"/">) {
  const [t, w, nav, locale, me, installed, ctx, params, tc] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("work"),
    getTranslations("nav"),
    getLocale(),
    getMe(),
    getModules(),
    workContext(),
    props.searchParams,
    getTranslations("charts"),
  ]);
  const period = REVENUE_PERIODS.find((days) => String(days) === params.rev) ?? REVENUE_PERIODS[0];
  const sample = sampleDataEnabled();
  // Module gói của khách bật: lối vào các phân hệ không mời vào phần core sẽ từ chối.
  const modules = await enabledModuleNames(installed);
  const [{ rows, incomplete, now }, metrics, setup, activity, candidates, orders] =
    await Promise.all([
      workRows(),
      readMetrics(ctx),
      sample ? readSetup(ctx) : Promise.resolve([]),
      recentActivity(6),
      sample ? assignCandidates() : Promise.resolve([]),
      sample && ctx.can(ORDERS_READ)
        ? ordersState().then(({ orders }) => orders)
        : Promise.resolve(null),
    ]);
  const todayDay = vietnamDayOf(ctx.now);
  const revenue = orders
    ? (() => {
        const today = revenueToday(orders, ctx.now);
        // Hôm nay chưa thu: hiện ngày gần nhất có thu, ghi rõ ngày đó.
        const last = today.total > 0 ? null : lastRevenueDay(orders, todayDay);
        return last ? { ...revenueOn(orders, last), day: last } : { ...today, day: null };
      })()
    : null;
  // Biểu đồ doanh thu: kỳ đang chọn và kỳ liền trước cùng độ dài (dữ liệu mẫu, W-006).
  const trend = orders
    ? (() => {
        const { current, previous } = periodWithPrevious(todayDay, period);
        const values = revenueByDay(orders, current);
        const before = revenueByDay(orders, previous);
        const total = values.reduce((a, b) => a + b, 0);
        const change = percentChange(
          total,
          before.reduce((a, b) => a + b, 0),
        );
        return { current, values, before, total, change };
      })()
    : null;
  const tileTrend = orders
    ? revenueByDay(orders, dayRange(shiftDay(todayDay, -(TILE_TREND_DAYS - 1)), todayDay))
    : null;
  const open = waiting(rows);
  const groups = visibleNav({
    allPermissions: me.all_permissions,
    permissions: me.permissions,
    modules,
    sample,
  }).filter((group) => group.id !== "home");

  // Giờ của cửa hàng (giờ Việt Nam): "hôm nay" của doanh thu cũng tính theo giờ này.
  const hour = Number(
    new Intl.DateTimeFormat("en", { hour: "numeric", hourCycle: "h23", timeZone: VN }).format(now),
  );
  const part = hour < 11 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const today = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: VN,
  }).format(now);
  const say = (message: Parameters<typeof renderMessage>[1]) =>
    renderMessage((key, values) => w(key, values), message, locale);
  const sourceName = (id: string) => {
    const key = `sources.${id.replace(".", "_")}`;
    return w.has(key) ? w(key) : id;
  };
  const value = (metric: MetricView) =>
    metric.value.kind === "money"
      ? formatMoney(metric.value.value.amount, metric.value.value.currency, locale)
      : metric.value.kind === "count"
        ? formatCount(metric.value.value, locale)
        : `${metric.value.numerator} / ${metric.value.denominator}`;
  const contentInstalled = modules === null || modules.includes("content");
  const quick = [
    ...(contentInstalled && ctx.can("content.write")
      ? [{ href: "/content/new", label: t("quick.post") }]
      : []),
    ...(sample && ctx.can(ORDERS_POS_SELL)
      ? [{ href: "/sales/orders/pos", label: t("quick.pos") }]
      : []),
  ];
  const done = setup.filter((step) => step.done).length;
  const blocked = setup.some((step) => !step.done && step.blocking);

  return (
    <ToastProvider>
      <div className="page dash">
        <section className="phead">
          <div className="phead-main">
            <span className="crumb">{t("today", { date: today })}</span>
            <h1 className="h1">{t(`greeting.${part}`, { name: me.name || me.email })}</h1>
          </div>
          {quick.length > 0 ? (
            <div className="headacts">
              {quick.map((q, index) => (
                <Link
                  key={q.href}
                  className={index === quick.length - 1 ? "btn pri" : "btn"}
                  href={q.href}
                >
                  <Icon name="plus" />
                  {q.label}
                </Link>
              ))}
            </div>
          ) : null}
        </section>

        {metrics.data.length > 0 ? (
          <section className="dash-tiles" aria-label={t("metrics")}>
            {metrics.data.map((metric) => (
              <Link key={metric.id} href={metric.href} className="card dash-tile">
                <span className="dash-tile-label">
                  {w(`metrics.labels.${metric.id.replace(".", "_")}`)}
                </span>
                <span className="dash-tile-value num">{value(metric)}</span>
                {metric.id === "orders.revenue_today" && tileTrend ? (
                  <Sparkline
                    values={tileTrend}
                    label={tc("trend", {
                      label: tc("dashboard.tileTrend"),
                      first: formatMoney(tileTrend[0] ?? 0, "VND", locale),
                      last: formatMoney(tileTrend.at(-1) ?? 0, "VND", locale),
                    })}
                  />
                ) : null}
                {metric.note ? <span className="dash-tile-note">{say(metric.note)}</span> : null}
                <span className="dash-tile-src">
                  {metric.sample ? (
                    <SampleBadge step={metric.sample.step} endpoint={metric.sample.endpoint} />
                  ) : (
                    <span className="badge b-ok" title={w("metrics.realTitle")}>
                      {w("metrics.real", { module: metric.module ?? "" })}
                    </span>
                  )}
                </span>
              </Link>
            ))}
          </section>
        ) : null}

        {trend ? (
          <section className="card dash-card dash-chart" aria-labelledby="dash-chart-h">
            <div className="dash-head">
              <h2 id="dash-chart-h" className="h2">
                {tc("dashboard.title")}
              </h2>
              <SampleBadge
                step="45"
                endpoint="GET /api/v1/kernel/summary?group=sales (doanh thu theo ngày, kỳ trước)"
              />
              <Chips
                label={tc("dashboard.period")}
                chips={REVENUE_PERIODS.map((days) => ({
                  href: `/?rev=${days}#dash-chart-h`,
                  label: tc("dashboard.days", { days }),
                  on: days === period,
                }))}
              />
            </div>
            <ChangeFigure
              value={formatMoney(trend.total, "VND", locale)}
              change={trend.change}
              changeText={trend.change === null ? "" : formatChange(trend.change, locale)}
              note={trend.change === null ? tc("noPrevious") : tc("vsPrevious", { days: period })}
            />
            <TimeSeriesChart
              label={tc("dashboard.title")}
              summary={tc("dashboard.summary", {
                total: formatMoney(trend.total, "VND", locale),
                change:
                  trend.change === null
                    ? tc("noPrevious")
                    : `${formatChange(trend.change, locale)} ${tc("vsPrevious", { days: period })}`,
              })}
              x={dayPoints(trend.current, locale)}
              series={[
                {
                  id: "current",
                  label: tc("dashboard.current", { days: period }),
                  values: trend.values,
                  color: 1,
                },
                // Kỳ trước không có số liệu (bằng 0 cả kỳ) thì không vẽ đường phẳng gây hiểu lầm.
                ...(trend.change === null
                  ? []
                  : [
                      {
                        id: "previous",
                        label: tc("dashboard.previous", { days: period }),
                        values: trend.before,
                        previous: true,
                      },
                    ]),
              ]}
              area
              unit="money"
              locale={locale}
              text={{
                data: tc("viewData"),
                x: tc("day"),
                hint: tc("hintDays", { title: tc("dashboard.title") }),
              }}
            />
            <p className="dash-hint">{tc("dashboard.about")}</p>
          </section>
        ) : null}

        <div className="dash-grid">
          <section className="card dash-tasks" aria-labelledby="dash-tasks-h">
            <div className="dash-head">
              <TipHeading id="dash-tasks-h" tip="tasks">
                {t("tasks.title")}
              </TipHeading>
              <span className="cnt hot">{open.length}</span>
              <span className="dash-hint">{t("tasks.hint")}</span>
            </div>
            {incomplete.length > 0 ? (
              <p className="note warn" role="status">
                {w("box.incomplete", {
                  count: incomplete.length,
                  names: incomplete.map(sourceName).join(", "),
                })}
              </p>
            ) : null}
            {open.length === 0 ? (
              <p className="empty">{t("tasks.empty")}</p>
            ) : (
              <TaskList
                rows={open.slice(0, TOP)}
                now={now}
                candidates={candidates}
                actions={sample}
              />
            )}
            {open.length > 0 ? (
              <Link className="btn ghost sm dash-more" href="/work">
                {open.length > TOP ? t("tasks.more", { count: open.length }) : t("tasks.all")}
              </Link>
            ) : null}
          </section>

          <div className="dash-side">
            {setup.length > 0 ? (
              <section className="card dash-card" aria-labelledby="dash-setup-h">
                <div className="dash-head">
                  <TipHeading id="dash-setup-h" tip="setup">
                    {t("setup.title")}
                  </TipHeading>
                  <span className="num dash-count">
                    {t("setup.done", { done, total: setup.length })}
                  </span>
                </div>
                <p className="dash-hint">{t("setup.about")}</p>
                <progress
                  className={blocked ? "bar hi" : "bar"}
                  max={setup.length}
                  value={done}
                  aria-label={t("setup.progress")}
                />
                <ul className="dash-steps">
                  {setup.map((step) => (
                    <li key={step.id} className={step.done ? "dash-step done" : "dash-step"}>
                      <span
                        className={`sq-ic ${step.done ? "ok" : step.blocking ? "bad" : "warn"} dash-step-ic`}
                      >
                        <Icon name={step.done ? "check" : "plus"} />
                      </span>
                      <span className="wk-main">
                        <span>{w(`setup.steps.${step.id}`)}</span>
                        <span className="wk-meta">
                          {!step.done && step.blocking ? (
                            <span className="badge b-bad">{w("setup.blocking")}</span>
                          ) : null}
                          {step.note ? <span>{say(step.note)}</span> : null}
                        </span>
                      </span>
                      {!step.done ? (
                        <Link
                          className="btn sm"
                          href={step.href}
                          aria-label={w("setup.doLabel", { step: w(`setup.steps.${step.id}`) })}
                        >
                          {w("setup.do")}
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <p className="dash-foot">
                  <SampleBadge step="51" endpoint={SETUP_ENDPOINT} /> {w("setup.basis")}
                </p>
              </section>
            ) : null}

            {revenue ? (
              <section className="card dash-card" aria-labelledby="dash-rev-h">
                <div className="dash-head">
                  <h2 id="dash-rev-h" className="h2">
                    {t("revenue.title")}
                  </h2>
                  <SampleBadge
                    step="45"
                    endpoint="GET /api/v1/kernel/summary?group=sales (orders.revenue_today theo nút)"
                  />
                </div>
                <p className="dash-hint">{t("revenue.about")}</p>
                {revenue.day ? (
                  <p className="note">
                    {t("revenue.lastDay", { date: dayText(revenue.day, locale) })}
                  </p>
                ) : null}
                {revenue.by_org.length === 0 ? (
                  <p className="empty">{t("revenue.none")}</p>
                ) : (
                  <ul className="dash-rev">
                    {revenue.by_org.map((row) => (
                      <li key={row.org_id}>
                        <span className="dash-rev-head">
                          <span className="ell">{row.org_name}</span>
                          <b className="num">{formatMoney(row.amount, "VND", locale)}</b>
                        </span>
                        <progress
                          className="bar"
                          max={Math.max(revenue.total, 1)}
                          value={row.amount}
                          aria-label={row.org_name}
                        />
                        <span className="dash-hint">
                          {t("revenue.orders", { count: row.orders })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}

            <PlanCard />

            <section className="card dash-card" aria-labelledby="dash-act-h">
              <div className="dash-head">
                <h2 id="dash-act-h" className="h2">
                  {t("activity.title")}
                </h2>
                {activity ? (
                  <Link className="btn ghost sm" href="/work/activity">
                    {t("activity.all")}
                  </Link>
                ) : null}
              </div>
              {activity ? (
                <ActivityList lines={activity.lines} names={activity.names} />
              ) : (
                <p className="dash-hint">{w("activity.forbidden", { permission: "audit.read" })}</p>
              )}
            </section>
          </div>
        </div>

        <section className="grid gap-3" aria-labelledby="areas">
          <h2 id="areas" className="cap">
            {t("areas")}
          </h2>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]">
            {groups.map((group) =>
              group.pages.map((page) => (
                <Link
                  key={`${group.id}/${page.id}`}
                  href={page.href}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 no-underline hover:bg-muted"
                >
                  <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-accent text-primary">
                    <Icon name={group.icon} />
                  </span>
                  <span className="grid gap-1">
                    <b>
                      {nav(`groups.${group.id}`)} › {nav(`pages.${page.id}`)}
                    </b>
                    <span className="text-[13px] text-muted-foreground">
                      {nav(`about.${page.id}`)}
                    </span>
                  </span>
                </Link>
              )),
            )}
          </div>
          {groups.length === 0 ? <p className="text-muted-foreground">{t("nothing")}</p> : null}
        </section>
      </div>
    </ToastProvider>
  );
}
