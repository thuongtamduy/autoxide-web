import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CloseShiftDialog } from "@/components/orders/forms";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatCount, formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import { listShifts, type Shift } from "@/sample/stores";
import { vietnamDay } from "@/sample/tax";
import { STORE_TABS } from "../../orders/shared";

const CHIPS = ["open", "closed", "diff"] as const;

// Tab "Ca thu ngân": mỗi quầy một ca mở. Tiền mặt dự kiến = tiền đầu ca + tiền mặt thu − tiền mặt hoàn
// trong ca (thẻ, VietQR không vào két). Đóng ca đếm tiền trong két; lệch thì phải ghi lý do.
export default async function ShiftsPage(props: PageProps<"/sales/stores/shifts">) {
  if (!(await can(STORE_TABS.shifts))) notFound();
  const [t, locale, params, shifts] = await Promise.all([
    getTranslations("stores"),
    getLocale(),
    props.searchParams,
    listShifts(),
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const chip = CHIPS.find((c) => c === one("chip"));
  const open = one("open");
  const money = (amount: string | number) => formatMoney(amount, "VND", locale);
  const lagging = (x: Shift) => x.difference !== null && Number(x.difference.amount) !== 0;
  const month = vietnamDay().slice(0, 7);
  const opened = shifts.data.filter((x) => x.status === "open");
  const monthDiff = shifts.data
    .filter(
      (x) => x.closed_at && vietnamDay(Date.parse(x.closed_at)).startsWith(month) && lagging(x),
    )
    .reduce((s, x) => s + Number(x.difference?.amount ?? 0), 0);
  const rows = shifts.data
    .filter((x) => !chip || (chip === "diff" ? lagging(x) : x.status === chip))
    .slice(0, chip ? 100 : 20);
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ chip: chip ?? "", ...change })) if (v) next.set(k, v);
    const q = next.toString();
    return q ? `/sales/stores/shifts?${q}` : "/sales/stores/shifts";
  };
  return (
    <div className="blocks">
      <section className="block" aria-label={t("shifts.kpis")}>
        <div className="kpis">
          <div className="card kpi">
            <span className="kpi-label">{t("shifts.kpiOpen")}</span>
            <b className="kpi-value">{formatCount(opened.length, locale)}</b>
            <span className="kpi-sub">{t("shifts.kpiOpenSub")}</span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("shifts.kpiCash")}</span>
            <b className="kpi-value">
              {money(opened.reduce((s, x) => s + Number(x.expected_cash.amount), 0))}
            </b>
            <span className="kpi-sub">{t("shifts.kpiCashSub", { n: opened.length })}</span>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{t("shifts.kpiDiff")}</span>
            <b className="kpi-value">{money(monthDiff)}</b>
            <span className="kpi-sub">
              {t("shifts.kpiDiffSub", { n: shifts.data.filter(lagging).length })}
            </span>
          </div>
        </div>
      </section>
      <section className="block" aria-labelledby="shifts-h">
        <div className="block-head">
          <h2 id="shifts-h" className="h2">
            {t("shifts.title")}
          </h2>
        </div>
        <p className="fhint">{t("shifts.about")}</p>
        <nav className="chips" aria-label={t("shifts.filter")}>
          <Link className={chip ? "chip" : "chip on"} href={href({ chip: null, open: null })}>
            {t("shifts.recent")}
          </Link>
          {CHIPS.map((c) => (
            <Link
              key={c}
              className={chip === c ? "chip on" : "chip"}
              href={href({ chip: c, open: null })}
            >
              {t(`shifts.chips.${c}`)}{" "}
              <span className="cnt">
                {shifts.data.filter((x) => (c === "diff" ? lagging(x) : x.status === c)).length}
              </span>
            </Link>
          ))}
        </nav>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("shifts.shift")}</Th>
                <Th>{t("shifts.by")}</Th>
                <Th className="text-right">{t("shifts.openingCash")}</Th>
                <Th className="text-right">{t("shifts.expected")}</Th>
                <Th className="text-right">{t("shifts.countedCash")}</Th>
                <Th>{t("shifts.state")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => {
                const isOpen = open === x.id;
                return [
                  <tr key={x.id} data-current={isOpen ? "" : undefined}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <Link
                          className="open"
                          href={isOpen ? href({ open: null }) : `${href({ open: x.id })}#shifts-h`}
                          scroll={false}
                          aria-expanded={isOpen}
                        >
                          {x.org_name} · {x.register_code}
                        </Link>
                        <span className="sub">
                          <Time value={x.opened_at} />
                          {x.closed_at ? " → " : ""}
                          {x.closed_at ? <Time value={x.closed_at} /> : null}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("shifts.by")}>{x.opened_by.name}</Td>
                    <Td label={t("shifts.openingCash")} className="text-right num">
                      {money(x.opening_cash.amount)}
                    </Td>
                    <Td label={t("shifts.expected")} className="text-right num">
                      {money(x.expected_cash.amount)}
                    </Td>
                    <Td label={t("shifts.countedCash")} className="text-right num">
                      {x.counted_cash ? money(x.counted_cash.amount) : "—"}
                    </Td>
                    <Td label={t("shifts.state")}>
                      <span
                        className={
                          x.status === "open"
                            ? "badge b-info"
                            : lagging(x)
                              ? "badge b-warn"
                              : "badge b-arch"
                        }
                      >
                        <span className="dot" />
                        {x.status === "open"
                          ? t("shifts.chips.open")
                          : lagging(x)
                            ? t("shifts.closedDiff")
                            : t("shifts.chips.closed")}
                      </span>
                    </Td>
                  </tr>,
                  isOpen ? (
                    <tr key={`${x.id}-open`} className="cat-detail-row">
                      <td colSpan={6}>
                        <div className="cat-detail">
                          <h3 className="h2">{t("shifts.cashTitle")}</h3>
                          <ul className="cat-lines">
                            <li>
                              <span>{t("shifts.openingCash")}</span>
                              <b className="num">{money(x.opening_cash.amount)}</b>
                            </li>
                            <li>
                              <span>
                                {t("shifts.cashSales", { n: x.cash_order_numbers.length })}
                                {x.cash_order_numbers.length > 0 && x.cash_order_numbers.length <= 6
                                  ? ` · ${x.cash_order_numbers.join(", ")}`
                                  : ""}
                              </span>
                              <b className="num">{money(x.cash_sales.amount)}</b>
                            </li>
                            <li>
                              <span>{t("shifts.cashRefunds")}</span>
                              <b className="num">−{money(x.cash_refunds.amount)}</b>
                            </li>
                            <li>
                              <span>{t("shifts.expected")}</span>
                              <b className="num">{money(x.expected_cash.amount)}</b>
                            </li>
                            {x.counted_cash ? (
                              <li>
                                <span>{t("shifts.countedCash")}</span>
                                <b className="num">{money(x.counted_cash.amount)}</b>
                              </li>
                            ) : null}
                            {x.difference && Number(x.difference.amount) !== 0 ? (
                              <li>
                                <span>{t("shifts.difference")}</span>
                                <b className="num cat-neg">{money(x.difference.amount)}</b>
                              </li>
                            ) : null}
                          </ul>
                          {x.difference_reason ? (
                            <p>
                              {t("shifts.reasonGiven")}: {x.difference_reason}
                            </p>
                          ) : null}
                          <p className="fhint">
                            {t("shifts.otherOrders", {
                              n: x.order_numbers.length - x.cash_order_numbers.length,
                            })}
                          </p>
                          {x.status === "open" ? (
                            <span className="row-acts">
                              <Link className="btn sm" href="/sales/orders/pos">
                                {t("shifts.sell")}
                              </Link>
                              <CloseShiftDialog
                                id={x.id}
                                expected={money(x.expected_cash.amount)}
                              />
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </Table>
        </div>
        <p className="fhint">{t("shifts.foot")}</p>
      </section>
    </div>
  );
}
