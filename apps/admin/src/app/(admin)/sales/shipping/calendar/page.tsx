import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { commerceGate } from "@/app/(admin)/catalog/gate";
import { calendarHref, MonthCalendar } from "@/components/shipping/calendar";
import { CalendarForm, HolidayDialog } from "@/components/shipping/forms";
import { Table, Td, Th } from "@/components/ui/table";
import { SHIPPING_SETTINGS_MANAGE, vnDate } from "@/lib/shipping";
import {
  addDays,
  dayInfo,
  dayPlan,
  fullDay,
  isDay,
  isMonth,
  longDay,
  monthGrid,
  ruleAt,
  shortDay,
} from "@/lib/shipping-calendar";
import { can } from "@/lib/viewer";
import { getCalendar } from "@/sample/shipping";
import { TAB_PERMISSIONS, unitOptions } from "../shared";

const WEEKDAY_SETS: Record<string, number[]> = {
  mon_sat: [1, 2, 3, 4, 5, 6],
  mon_fri: [1, 2, 3, 4, 5],
  all: [0, 1, 2, 3, 4, 5, 6],
};

const KIND_TONE = { pickup: "b-ok", holiday: "b-bad", off: "b-arch" } as const;

// Tab "Lịch giao": ngày giao dự kiến báo cho người mua tính từ giờ chốt, ngày làm việc và ngày nghỉ
// (D-201 của core). Lịch là dữ liệu có ngày hiệu lực: đổi lịch thêm một phiên bản áp từ một ngày sau
// hôm nay, nên ngày dự kiến của đơn đã đặt không đổi. Màn chính là một lịch tháng (`?month=`), bấm
// một ngày (`?day=`) để xem đơn đặt ngày đó giao khi nào, đặt ngày nghỉ hay đổi lịch từ ngày đó.
export default async function CalendarPage(props: PageProps<"/sales/shipping/calendar">) {
  const gate = await commerceGate(TAB_PERMISSIONS.calendar);
  if (gate) return gate;
  const [t, locale, params] = await Promise.all([
    getTranslations("shipping"),
    getLocale(),
    props.searchParams,
  ]);
  const [{ data }, manage, orgs] = await Promise.all([
    getCalendar(),
    can(SHIPPING_SETTINGS_MANAGE),
    unitOptions(),
  ]);
  const today = vnDate(Date.now());
  const tomorrow = addDays(today, 1);
  const dayParam = typeof params.day === "string" && isDay(params.day) ? params.day : null;
  const monthParam =
    typeof params.month === "string" && isMonth(params.month) ? params.month : null;
  const month = monthParam ?? dayParam?.slice(0, 7) ?? today.slice(0, 7);
  const selected =
    dayParam?.startsWith(month) === true
      ? dayParam
      : today.startsWith(month)
        ? today
        : `${month}-01`;

  const setName = (days: readonly number[]) =>
    Object.entries(WEEKDAY_SETS).find(([, v]) => v.join() === days.join())?.[0] ?? "mon_sat";
  const daysText = (days: readonly number[]) => t(`calendar.days.${setName(days)}`);
  const orgName = (id: string | null) =>
    id === null ? t("calendar.allChain") : (orgs.find((o) => o.value === id)?.label ?? id);
  const range = (eta: { eta_from: string; eta_to: string }) =>
    eta.eta_from === eta.eta_to
      ? shortDay(eta.eta_from, locale)
      : `${shortDay(eta.eta_from, locale)} – ${shortDay(eta.eta_to, locale)}`;

  const current = data.current;
  const cutoff = current?.cutoff ?? "16:00";
  const upcoming = data.versions
    .filter((v) => v.effective_from > today)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from))[0];
  const todayPlan = dayPlan(today, data.versions, data.holidays);
  const weeks = monthGrid(month, data.versions, data.holidays, today);
  const info = dayInfo(selected, data.versions, data.holidays, today);
  const plan = dayPlan(selected, data.versions, data.holidays);
  const formFrom = selected > today ? selected : tomorrow;
  const formRule = ruleAt(data.versions, formFrom) ?? current;

  return (
    <div className="blocks">
      <section className="card sc-summary" aria-labelledby="sc-sum-h">
        <div className="sc-sum-main">
          <span className="badge b-ok">
            <span className="dot" />
            {t("calendar.inForce")}
          </span>
          <h2 id="sc-sum-h" className="sc-sum-title">
            {t("calendar.summary", { cutoff })}
          </h2>
          <p className="sc-sum-text">
            {t("calendar.summaryMore", { cutoff, days: daysText(current?.workdays ?? []) })}
          </p>
        </div>
        <dl className="sc-sum-eg">
          {todayPlan.before ? (
            <div>
              <dt>{t("calendar.egBefore", { cutoff })}</dt>
              <dd>{range(todayPlan.before)}</dd>
            </div>
          ) : null}
          {todayPlan.after ? (
            <div>
              <dt>
                {todayPlan.before ? t("calendar.egAfter", { cutoff }) : t("calendar.egNoPickup")}
              </dt>
              <dd>{range(todayPlan.after)}</dd>
            </div>
          ) : null}
        </dl>
        <p className="fhint sc-sum-foot">
          {upcoming
            ? `${t("calendar.nextVersion", {
                day: fullDay(upcoming.effective_from, locale),
                cutoff: upcoming.cutoff,
                days: daysText(upcoming.workdays),
              })} `
            : ""}
          {t("calendar.about")}
        </p>
      </section>

      <section className="block sc-layout" aria-label={t("calendar.calendarLabel")}>
        <MonthCalendar month={month} selected={selected} weeks={weeks} today={today} />
        <div className="sc-side">
          <section className="card padded sc-dayp" aria-labelledby="sc-day-h" aria-live="polite">
            <h3 id="sc-day-h" className="h2">
              {longDay(selected, locale)}
            </h3>
            <span className={`badge ${KIND_TONE[info.kind]}`}>
              <span className="dot" />
              {info.kind === "holiday"
                ? t("calendar.kindHoliday", { name: info.holidays.join(", ") })
                : info.kind === "pickup"
                  ? t("calendar.kindPickup", { cutoff: info.cutoff ?? "" })
                  : t("calendar.kindOff")}
            </span>
            <ul className="sc-plan">
              {plan.before ? (
                <li>
                  <span className="sub">
                    {t("calendar.dayBefore", { cutoff: plan.cutoff ?? "" })}
                  </span>
                  <b>{range(plan.before)}</b>
                  <span className="sub">
                    {t("calendar.pickupOn", { day: shortDay(plan.before.pickup_date, locale) })}
                  </span>
                </li>
              ) : null}
              {plan.after ? (
                <li>
                  <span className="sub">
                    {plan.before
                      ? t("calendar.dayAfter", { cutoff: plan.cutoff ?? "" })
                      : t("calendar.dayAny")}
                  </span>
                  <b>{range(plan.after)}</b>
                  <span className="sub">
                    {t("calendar.pickupOn", { day: shortDay(plan.after.pickup_date, locale) })}
                  </span>
                </li>
              ) : null}
            </ul>
            {plan.before || plan.after ? <p className="fhint">{t("calendar.planFoot")}</p> : null}
            {info.local.map((h) => (
              <p key={h.id} className="note">
                {t("calendar.dayLocal", { org: orgName(h.org_id), name: h.name })}
              </p>
            ))}
            {info.starts ? (
              <p className="note">
                {t("calendar.dayStarts", {
                  cutoff: info.starts.cutoff,
                  days: daysText(info.starts.workdays),
                })}
              </p>
            ) : null}
            {info.isPast ? <p className="fhint">{t("calendar.pastDay")}</p> : null}
            {manage && !info.isPast ? (
              <div className="row-acts sc-day-acts">
                <HolidayDialog
                  orgs={orgs}
                  day={selected}
                  label={t("calendar.markHoliday")}
                  primary={false}
                />
              </div>
            ) : null}
          </section>
          {manage ? (
            <CalendarForm
              cutoff={formRule?.cutoff ?? cutoff}
              workdays={setName(formRule?.workdays ?? [1, 2, 3, 4, 5, 6])}
              from={formFrom}
              picked={selected > today}
            />
          ) : null}
        </div>
      </section>

      <section className="block" aria-labelledby="holidays-h">
        <div className="block-head">
          <h2 id="holidays-h" className="h2">
            {t("holiday.list")}
          </h2>
          {manage ? <HolidayDialog orgs={orgs} /> : null}
        </div>
        <p className="fhint">{t("holiday.about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("holiday.date")}</Th>
                <Th>{t("holiday.name")}</Th>
                <Th>{t("holiday.scope")}</Th>
                <Th>{t("calendar.state")}</Th>
                <Th>
                  <span className="vh">{t("rates.actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {data.holidays.map((h) => (
                <tr key={h.id}>
                  <Td className="rt-title">
                    {h.from && h.to ? (
                      <Link
                        href={calendarHref(h.from.slice(0, 7), h.from)}
                        scroll={false}
                        className="num"
                      >
                        {h.from === h.to
                          ? fullDay(h.from, locale)
                          : `${fullDay(h.from, locale)} – ${fullDay(h.to, locale)}`}
                      </Link>
                    ) : (
                      t("holiday.awaitingDate")
                    )}
                  </Td>
                  <Td label={t("holiday.name")}>{h.name}</Td>
                  <Td label={t("holiday.scope")}>{orgName(h.org_id)}</Td>
                  <Td label={t("calendar.state")}>
                    <span className={h.status === "confirmed" ? "badge b-sched" : "badge b-warn"}>
                      <span className="dot" />
                      {t(`holiday.status.${h.status}`)}
                    </span>
                  </Td>
                  <Td className="rt-acts">
                    {manage && h.status === "awaiting_notice" ? (
                      <HolidayDialog orgs={orgs} label={t("holiday.enter")} />
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        {data.holidays.some((h) => h.status === "awaiting_notice") ? (
          <p className="note warn">{t("holiday.awaitingNote")}</p>
        ) : null}
      </section>

      <section className="block" aria-labelledby="versions-h">
        <div className="block-head">
          <h2 id="versions-h" className="h2">
            {t("calendar.versions")}
          </h2>
        </div>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("calendar.from")}</Th>
                <Th>{t("calendar.cutoff")}</Th>
                <Th>{t("calendar.workdays")}</Th>
                <Th>{t("calendar.state")}</Th>
              </tr>
            </thead>
            <tbody>
              {data.versions.map((v) => (
                <tr key={v.id}>
                  <Td className="rt-title num">{fullDay(v.effective_from, locale)}</Td>
                  <Td label={t("calendar.cutoff")} className="num">
                    {v.cutoff}
                  </Td>
                  <Td label={t("calendar.workdays")}>{daysText(v.workdays)}</Td>
                  <Td label={t("calendar.state")}>
                    {v.id === current?.id ? (
                      <span className="badge b-ok">
                        <span className="dot" />
                        {t("calendar.inForce")}
                      </span>
                    ) : v.effective_from > today ? (
                      <span className="badge b-sched">
                        <span className="dot" />
                        {t("calendar.upcoming")}
                      </span>
                    ) : (
                      <span className="badge b-arch">
                        <span className="dot" />
                        {t("calendar.past")}
                      </span>
                    )}
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
