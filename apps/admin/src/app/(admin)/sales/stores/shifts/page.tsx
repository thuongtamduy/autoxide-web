import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CloseShiftDialog } from "@/components/orders/forms";
import { Pager } from "@/components/ui/pager";
import { RowMenu } from "@/components/ui/row-menu";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatCount, formatMoney } from "@/lib/format";
import { readPage, readSort, slicePage } from "@/lib/table";
import { can } from "@/lib/viewer";
import {
  listShifts,
  SHIFT_CHIPS,
  SHIFT_SORTS,
  type ShiftChip,
  shiftLagging,
  shiftMatches,
} from "@/sample/stores";
import { vietnamDay } from "@/sample/tax";
import { STORE_TABS } from "../../orders/shared";

const BASE = "/sales/stores/shifts";

// Tab "Ca thu ngân": mỗi quầy một ca mở. Tiền mặt dự kiến = tiền đầu ca + tiền mặt thu − tiền mặt hoàn
// trong ca (thẻ, VietQR không vào két). Đóng ca đếm tiền trong két; lệch thì phải ghi lý do. Mặc định
// hiện ca cần để ý (đang mở và ca lệch); cột "Lệch"; "Đóng ca" ngay trên dòng ca đang mở, còn lại trong
// "⋯". Không có thao tác hàng loạt: đóng ca cần đếm tiền từng két. Sắp theo giờ mở ca và số lệch;
// phân trang có tổng (nguồn mẫu có đủ danh sách).
export default async function ShiftsPage(props: PageProps<"/sales/stores/shifts">) {
  if (!(await can(STORE_TABS.shifts))) notFound();
  const [t, tt, locale, params] = await Promise.all([
    getTranslations("stores"),
    getTranslations("table"),
    getLocale(),
    props.searchParams,
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const chip: ShiftChip = SHIFT_CHIPS.find((c) => c === one("chip")) ?? "attention";
  const open = one("open");
  const sorted = typeof params.sort === "string";
  const sort = readSort(params, SHIFT_SORTS, { field: "opened", dir: "desc" });
  const paging = readPage(params);
  const [shifts, all] = await Promise.all([listShifts(sorted ? sort : null), listShifts()]);
  const money = (amount: string | number) => formatMoney(amount, "VND", locale);
  const month = vietnamDay().slice(0, 7);
  const opened = all.data.filter((x) => x.status === "open");
  const monthDiff = all.data
    .filter(
      (x) =>
        x.closed_at && vietnamDay(Date.parse(x.closed_at)).startsWith(month) && shiftLagging(x),
    )
    .reduce((s, x) => s + Number(x.difference?.amount ?? 0), 0);
  const page = slicePage(
    shifts.data.filter((x) => shiftMatches(x, chip)),
    paging.page,
    paging.per,
  );
  // Tham số giữ khi sắp, đổi trang, mở một ca: bộ lọc (mặc định thì bỏ), cách sắp, số dòng mỗi trang.
  const keep = {
    chip: chip === "attention" ? null : chip,
    ...(sorted ? { sort: sort.field, dir: sort.dir } : {}),
  };
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = {
      ...keep,
      page: page.page > 1 ? String(page.page) : "",
      per: params.per ? String(paging.per) : "",
      ...change,
    };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, String(v));
    const q = next.toString();
    return q ? `${BASE}?${q}` : BASE;
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
              {t("shifts.kpiDiffSub", { n: all.data.filter(shiftLagging).length })}
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
          {SHIFT_CHIPS.map((c) => (
            <Link
              key={c}
              className={chip === c ? "chip on" : "chip"}
              href={href({ chip: c === "attention" ? null : c, open: null, page: null })}
              aria-current={chip === c ? "page" : undefined}
            >
              {t(`shifts.chips.${c}`)}{" "}
              <span className="cnt">{all.data.filter((x) => shiftMatches(x, c)).length}</span>
            </Link>
          ))}
        </nav>
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">{t("shifts.empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <SortTh field="opened" sort={sort} base={BASE} keep={keep} first="desc">
                    {t("shifts.shift")}
                  </SortTh>
                  <Th>{t("shifts.by")}</Th>
                  <Th className="text-right">{t("shifts.openingCash")}</Th>
                  <Th className="text-right">{t("shifts.expected")}</Th>
                  <Th className="text-right">{t("shifts.countedCash")}</Th>
                  <SortTh
                    field="difference"
                    sort={sort}
                    base={BASE}
                    keep={keep}
                    className="text-right"
                  >
                    {t("shifts.difference")}
                  </SortTh>
                  <Th>{t("shifts.state")}</Th>
                  <Th>
                    <span className="vh">{t("shifts.actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((x) => {
                  const isOpen = open === x.id;
                  const name = `${x.org_name} · ${x.register_code}`;
                  const lagging = shiftLagging(x);
                  return [
                    <tr key={x.id} data-current={isOpen ? "" : undefined}>
                      <Td className="rt-title">
                        <span className="cell2">
                          <Link
                            className="open"
                            href={
                              isOpen ? href({ open: null }) : `${href({ open: x.id })}#shifts-h`
                            }
                            scroll={false}
                            aria-expanded={isOpen}
                          >
                            {name}
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
                      <Td
                        label={t("shifts.difference")}
                        className={lagging ? "text-right num cat-neg" : "text-right num"}
                      >
                        {x.difference ? money(x.difference.amount) : "—"}
                      </Td>
                      <Td label={t("shifts.state")}>
                        <span
                          className={
                            x.status === "open"
                              ? "badge b-info"
                              : lagging
                                ? "badge b-warn"
                                : "badge b-arch"
                          }
                        >
                          <span className="dot" />
                          {x.status === "open"
                            ? t("shifts.chips.open")
                            : lagging
                              ? t("shifts.closedDiff")
                              : t("shifts.chips.closed")}
                        </span>
                      </Td>
                      <Td className="rt-acts">
                        <span className="row-acts">
                          {x.status === "open" ? (
                            <CloseShiftDialog id={x.id} expected={money(x.expected_cash.amount)} />
                          ) : null}
                          <RowMenu
                            label={tt("moreFor", { name })}
                            items={[
                              {
                                label: isOpen ? t("shifts.hideDetail") : t("shifts.openDetail"),
                                href: isOpen
                                  ? href({ open: null })
                                  : `${href({ open: x.id })}#shifts-h`,
                              },
                              ...(x.status === "open"
                                ? [{ label: t("shifts.sell"), href: "/sales/orders/pos" }]
                                : []),
                            ]}
                          />
                        </span>
                      </Td>
                    </tr>,
                    isOpen ? (
                      <tr key={`${x.id}-open`} className="cat-detail-row">
                        <td colSpan={8}>
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
                                  {x.cash_order_numbers.length > 0 &&
                                  x.cash_order_numbers.length <= 6
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
                              {lagging && x.difference ? (
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
        <Pager total={page.total} page={page.page} per={paging.per} base={BASE} keep={keep} />
        <p className="fhint">{t("shifts.foot")}</p>
      </section>
    </div>
  );
}
