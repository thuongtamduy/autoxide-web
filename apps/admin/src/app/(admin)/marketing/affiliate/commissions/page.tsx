import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Chips } from "@/components/engage/common";
import { BlockHead, Cell2, hrefWith, Kpis, param, Status } from "@/components/growth/blocks";
import { Pager } from "@/components/ui/pager";
import { RowMenu } from "@/components/ui/row-menu";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { PER_PAGE, readPage, readSort, slicePage, sortRows } from "@/lib/table";
import { can } from "@/lib/viewer";
import {
  type CommissionChip,
  type CommissionStatus,
  commissionStats,
  listAdjustments,
  listCommissions,
} from "@/sample/affiliate";
import { AFFILIATE_TABS } from "../shared";

const CHIPS: readonly CommissionChip[] = ["pending", "approved", "paid", "void"];
const TONE: Record<CommissionStatus, string> = {
  pending: "b-info",
  approved: "b-violet",
  paid: "b-ok",
  void: "b-arch",
};
const BASE = "/marketing/affiliate/commissions";

// Tab "Hoa hồng": một dòng hoa hồng cho mỗi dòng đơn được ghi nhận (đơn thật của bộ mẫu). Đơn đặt → chờ
// hoàn tất; đơn huỷ → huỷ; đơn hoàn tất (qua hạn đổi trả) → đã duyệt, ghi sổ cái; vào lệnh chi → đã chi.
// Cơ sở tính: tiền sau giảm, chưa thuế (chụp trong dòng đơn). Tự mua qua link của mình không được ghi nhận.
// Trạng thái đi theo đơn và lệnh chi, không đổi tay: không có thao tác hàng loạt; "⋯" dẫn sang đơn, người
// tiếp thị, lệnh chi. Sắp theo tiền và phân trang có tổng (dữ liệu mẫu có đủ danh sách).
export default async function CommissionsPage(
  props: PageProps<"/marketing/affiliate/commissions">,
) {
  if (!(await can(AFFILIATE_TABS.commissions))) notFound();
  const [t, tt, locale, params, stats, all, adjustments] = await Promise.all([
    getTranslations("affiliate"),
    getTranslations("table"),
    getLocale(),
    props.searchParams,
    commissionStats(),
    listCommissions(),
    listAdjustments(),
  ]);
  const chip = CHIPS.find((c) => c === param(params, "chip")) ?? null;
  const filtered = all.data.filter((c) => !chip || c.status === chip);
  // Dữ liệu mẫu có đủ danh sách: sắp theo cột (tiền) và phân trang có tổng ngay ở đây.
  const sort = readSort(params, ["base", "amount"], { field: "placed", dir: "desc" });
  const sorted =
    sort.field === "placed"
      ? filtered
      : sortRows(
          filtered,
          (c) => Number(sort.field === "base" ? c.base.amount : c.amount.amount),
          sort.dir,
        );
  const paging = readPage(params);
  const shown = slicePage(sorted, paging.page, paging.per);
  const rows = shown.data;
  const keep = {
    chip: chip ?? undefined,
    ...(sort.field === "placed" ? {} : { sort: sort.field, dir: sort.dir }),
    per: paging.per === PER_PAGE[0] ? undefined : paging.per,
  };
  const sortKeep = { chip: chip ?? undefined };
  const money = (amount: string | number) => formatMoney(amount, "VND", locale);
  return (
    <div className="blocks">
      <Kpis
        label={t("commissions.kpis")}
        items={[
          {
            label: t("commissions.kpiPending"),
            value: money(stats.pending.amount),
            sub: t("commissions.kpiPendingSub", { n: stats.pending_lines }),
          },
          {
            label: t("commissions.kpiApproved"),
            value: money(stats.approved.amount),
            sub: t("commissions.kpiApprovedSub"),
          },
          {
            label: t("commissions.kpiPaid"),
            value: money(stats.paid_year.amount),
            sub: t("commissions.kpiPaidSub"),
          },
          {
            label: t("commissions.kpiVoid"),
            value: money(stats.void_month.amount),
            sub: t("commissions.kpiVoidSub"),
          },
        ]}
      />
      <section className="block" aria-labelledby="commissions-h">
        <BlockHead
          id="commissions-h"
          title={t("commissions.title")}
          about={t("commissions.about")}
        />
        <Chips
          label={t("commissions.filter")}
          chips={[
            {
              href: "/marketing/affiliate/commissions",
              label: t("commissions.all"),
              on: !chip,
              count: all.data.length,
            },
            ...CHIPS.map((c) => ({
              href: hrefWith("/marketing/affiliate/commissions", {}, { chip: c }),
              label: t(`commissionState.${c}`),
              on: chip === c,
              count: all.data.filter((x) => x.status === c).length,
            })),
          ]}
        />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("commissions.order")}</Th>
                <Th>{t("commissions.partner")}</Th>
                <Th>{t("commissions.source")}</Th>
                <SortTh
                  field="base"
                  sort={sort}
                  base={BASE}
                  keep={sortKeep}
                  first="desc"
                  className="text-right"
                >
                  {t("commissions.base")}
                </SortTh>
                <SortTh
                  field="amount"
                  sort={sort}
                  base={BASE}
                  keep={sortKeep}
                  first="desc"
                  className="text-right"
                >
                  {t("commissions.amount")}
                </SortTh>
                <Th>{t("commissions.state")}</Th>
                <Th>
                  <span className="vh">{t("actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <Td className="rt-title">
                    <Cell2
                      main={
                        <Link className="mono" href={`/sales/orders/${c.order_id}`}>
                          {c.order_number}
                        </Link>
                      }
                      sub={c.product_name}
                    />
                  </Td>
                  <Td label={t("commissions.partner")}>{c.partner_name}</Td>
                  <Td label={t("commissions.source")}>{t(`sources.${c.source}`)}</Td>
                  <Td label={t("commissions.base")} className="text-right num">
                    {money(c.base.amount)}
                  </Td>
                  <Td label={t("commissions.amount")} className="text-right">
                    <Cell2
                      main={<span className="num">{money(c.amount.amount)}</span>}
                      sub={`${c.rate_bp / 100}% · ${c.rule_label === "default" ? t("rule.scopes.default") : c.rule_label}${c.capped ? ` · ${t("commissions.capped")}` : ""}`}
                    />
                  </Td>
                  <Td label={t("commissions.state")}>
                    <Status tone={TONE[c.status]}>{t(`commissionState.${c.status}`)}</Status>
                  </Td>
                  <Td label={t("actions")}>
                    {/* Trạng thái của hoa hồng đi theo đơn (hoàn tất, huỷ) và lệnh chi: không có lệnh
                        đổi tay, nên "⋯" chỉ dẫn sang đơn, người tiếp thị và lệnh chi. */}
                    <RowMenu
                      label={tt("moreFor", { name: `${c.order_number} · ${c.product_name}` })}
                      items={[
                        { label: t("commissions.openOrder"), href: `/sales/orders/${c.order_id}` },
                        {
                          label: t("commissions.openPartner"),
                          href: hrefWith(
                            "/marketing/affiliate",
                            {},
                            { open: c.partner_id },
                            "#partners-h",
                          ),
                        },
                        ...(c.payout_id
                          ? [
                              {
                                label: t("commissions.openPayout"),
                                href: hrefWith(
                                  "/marketing/affiliate/payouts",
                                  {},
                                  { open: c.payout_id },
                                  "#payouts-h",
                                ),
                              },
                            ]
                          : []),
                      ]}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <Pager total={shown.total} page={shown.page} per={paging.per} base={BASE} keep={keep} />
      </section>
      <section className="block" aria-labelledby="adjust-h">
        <BlockHead
          id="adjust-h"
          title={t("commissions.adjustTitle")}
          about={t("commissions.adjustAbout")}
        />
        {adjustments.data.length === 0 ? (
          <p className="note">{t("commissions.noAdjust")}</p>
        ) : (
          <div className="card tcard">
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("commissions.partner")}</Th>
                  <Th>{t("commissions.reason")}</Th>
                  <Th className="text-right">{t("commissions.amount")}</Th>
                </tr>
              </thead>
              <tbody>
                {adjustments.data.map((a) => (
                  <tr key={a.id}>
                    <Td className="rt-title">{a.partner_name}</Td>
                    <Td label={t("commissions.reason")}>{a.reason}</Td>
                    <Td label={t("commissions.amount")} className="text-right num cat-neg">
                      {money(a.amount.amount)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
        <p className="fhint">{t("commissions.ledgerNote")}</p>
      </section>
    </div>
  );
}
