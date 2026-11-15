import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Chips, Pager } from "@/components/engage/common";
import { BlockHead, Cell2, hrefWith, Kpis, param, Status } from "@/components/growth/blocks";
import { Table, Td, Th } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
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
const PAGE = 25;

// Tab "Hoa hồng": một dòng hoa hồng cho mỗi dòng đơn được ghi nhận (đơn thật của bộ mẫu). Đơn đặt → chờ
// hoàn tất; đơn huỷ → huỷ; đơn hoàn tất (qua hạn đổi trả) → đã duyệt, ghi sổ cái; vào lệnh chi → đã chi.
// Cơ sở tính: tiền sau giảm, chưa thuế (chụp trong dòng đơn). Tự mua qua link của mình không được ghi nhận.
export default async function CommissionsPage(
  props: PageProps<"/marketing/affiliate/commissions">,
) {
  if (!(await can(AFFILIATE_TABS.commissions))) notFound();
  const [t, locale, params, stats, all, adjustments] = await Promise.all([
    getTranslations("affiliate"),
    getLocale(),
    props.searchParams,
    commissionStats(),
    listCommissions(),
    listAdjustments(),
  ]);
  const chip = CHIPS.find((c) => c === param(params, "chip")) ?? null;
  const from = Math.max(0, Number(param(params, "from")) || 0);
  const filtered = all.data.filter((c) => !chip || c.status === chip);
  const rows = filtered.slice(from, from + PAGE);
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
                <Th className="text-right">{t("commissions.base")}</Th>
                <Th className="text-right">{t("commissions.amount")}</Th>
                <Th>{t("commissions.state")}</Th>
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
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <p className="fhint">
          {t("commissions.shown", {
            from: filtered.length ? from + 1 : 0,
            to: from + rows.length,
            total: filtered.length,
          })}
        </p>
        <Pager
          first={
            from > 0 ? hrefWith("/marketing/affiliate/commissions", { chip: chip ?? "" }, {}) : null
          }
          next={
            from + PAGE < filtered.length
              ? hrefWith(
                  "/marketing/affiliate/commissions",
                  { chip: chip ?? "" },
                  { from: String(from + PAGE) },
                )
              : null
          }
        />
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
