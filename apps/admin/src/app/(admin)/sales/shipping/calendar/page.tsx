import { getLocale, getTranslations } from "next-intl/server";
import { commerceGate } from "@/app/(admin)/catalog/gate";
import { CalendarForm, HolidayDialog } from "@/components/shipping/forms";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDay } from "@/lib/catalog";
import { vnTime } from "@/lib/promotions";
import { SHIPPING_SETTINGS_MANAGE, vnDate } from "@/lib/shipping";
import { can } from "@/lib/viewer";
import { etaExample, getCalendar } from "@/sample/shipping";
import { TAB_PERMISSIONS, unitOptions } from "../shared";

const WEEKDAY_SETS: Record<string, number[]> = {
  mon_sat: [1, 2, 3, 4, 5, 6],
  mon_fri: [1, 2, 3, 4, 5],
  all: [0, 1, 2, 3, 4, 5, 6],
};

// Tab "Lịch giao": ngày giao dự kiến báo cho người mua tính từ giờ chốt, ngày làm việc và ngày nghỉ
// (D-201 của core). Lịch là dữ liệu có ngày hiệu lực: đổi lịch thêm một phiên bản áp từ một ngày sau
// hôm nay, nên ngày dự kiến của đơn đã đặt không đổi.
export default async function CalendarPage() {
  const gate = await commerceGate(TAB_PERMISSIONS.calendar);
  if (gate) return gate;
  const [t, locale] = await Promise.all([getTranslations("shipping"), getLocale()]);
  const [{ data }, manage, orgs] = await Promise.all([
    getCalendar(),
    can(SHIPPING_SETTINGS_MANAGE),
    unitOptions(),
  ]);
  const today = vnDate(Date.now());
  const at = (hh: number, mm: number) =>
    Date.parse(`${today}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+07:00`);
  const cutoff = data.current?.cutoff ?? "16:00";
  const [hh, mm] = cutoff.split(":").map(Number);
  const before = at(hh ?? 16, Math.max(0, (mm ?? 0) - 20));
  const after = at(hh ?? 16, Math.min(59, (mm ?? 0) + 20));
  const [early, late] = await Promise.all([etaExample(before, 1, 2), etaExample(after, 1, 2)]);
  const day = (d: string) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      timeZone: "UTC",
    }).format(new Date(`${d}T00:00:00Z`));
  const time = (ms: number) => vnTime(new Date(ms).toISOString(), locale);
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  const setName = (days: number[]) =>
    Object.entries(WEEKDAY_SETS).find(([, v]) => v.join() === days.join())?.[0] ?? "mon_sat";
  const orgName = (id: string | null) =>
    id === null ? t("calendar.allChain") : (orgs.find((o) => o.value === id)?.label ?? id);
  return (
    <div className="blocks">
      <p className="fhint">{t("calendar.about")}</p>
      <section className="block" aria-label={t("calendar.formTitle")}>
        <div className="pm-pair">
          {manage ? (
            <CalendarForm
              cutoff={cutoff}
              workdays={setName(data.current?.workdays ?? [1, 2, 3, 4, 5, 6])}
              from={tomorrow}
            />
          ) : (
            <p className="note">
              {t("calendar.current", {
                cutoff,
                days: t(`calendar.days.${setName(data.current?.workdays ?? [])}`),
              })}
            </p>
          )}
          <div className="pm-tiles">
            {[
              { ordered: before, eta: early },
              { ordered: after, eta: late },
            ].map(({ ordered, eta }) => (
              <div key={ordered} className="card pm-tile">
                <span className="sub">
                  {t("calendar.orderedAt", { time: time(ordered), day: day(today) })}
                </span>
                <b className="big">
                  {day(eta.eta_from)} – {day(eta.eta_to)}
                </b>
                <span>
                  {eta.order_by
                    ? t("calendar.inTime", { pickup: day(eta.pickup_date) })
                    : t("calendar.late", { pickup: day(eta.pickup_date) })}
                </span>
                <span className="sub">{t("calendar.tileFoot")}</span>
              </div>
            ))}
          </div>
        </div>
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
                  <Td className="rt-title">{formatDay(v.effective_from, locale)}</Td>
                  <Td label={t("calendar.cutoff")} className="num">
                    {v.cutoff}
                  </Td>
                  <Td label={t("calendar.workdays")}>
                    {t(`calendar.days.${setName(v.workdays)}`)}
                  </Td>
                  <Td label={t("calendar.state")}>
                    {v.id === data.current?.id ? (
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
                    {h.from && h.to
                      ? h.from === h.to
                        ? formatDay(h.from, locale)
                        : `${formatDay(h.from, locale)} – ${formatDay(h.to, locale)}`
                      : t("holiday.awaitingDate")}
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
    </div>
  );
}
