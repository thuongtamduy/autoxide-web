import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { disableLinkAction } from "@/app/(admin)/marketing/affiliate/actions";
import { LinkCreateDialog } from "@/components/affiliate/forms";
import { ConfirmButton } from "@/components/engage/actions";
import { BlockHead, Cell2, Kpis, Status, Tiles } from "@/components/growth/blocks";
import { Table, Td, Th } from "@/components/ui/table";
import { formatCount, formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import { getProgram, listLinks, portalStats } from "@/sample/affiliate";
import { AFFILIATE_TABS, productOptions } from "../shared";

// Tab "Góc người tiếp thị": xem trước màn người tiếp thị thấy khi đăng nhập (vd Hằng Bếp Vui), với quyền
// `affiliate.partner` — chỉ dữ liệu của chính mình (phạm vi `Own`). Lượt bấm chỉ lưu IP đã băm và loại trình
// duyệt, xoá sau 90 ngày (Luật BVDLCN 91/2025).
export default async function PortalPage() {
  if (!(await can(AFFILIATE_TABS.portal))) notFound();
  const [t, locale, stats, links, products, program] = await Promise.all([
    getTranslations("affiliate"),
    getLocale(),
    portalStats(),
    listLinks(),
    productOptions(),
    getProgram(),
  ]);
  if (!stats) notFound();
  const money = (amount: string | number) => formatMoney(amount, "VND", locale);
  const year = new Date().getUTCFullYear();
  return (
    <div className="blocks">
      <p className="note">{t("portal.preview", { name: stats.partner.name })}</p>
      <Kpis
        label={t("portal.kpis")}
        items={[
          {
            label: t("portal.kpiClicks"),
            value: formatCount(stats.clicks_30d, locale),
            sub: t("portal.kpiClicksSub", { n: links.data.length }),
          },
          {
            label: t("portal.kpiOrders"),
            value: formatCount(stats.orders_30d, locale),
            sub: t("portal.kpiOrdersSub", { link: stats.by_link, live: stats.by_live }),
          },
          {
            label: t("portal.kpiPending"),
            value: money(stats.pending.amount),
            sub: t("portal.kpiPendingSub"),
          },
          {
            label: t("portal.kpiReceived", { year }),
            value: money(stats.received_year.amount),
            sub: t("portal.kpiReceivedSub"),
          },
        ]}
      />
      <section className="block" aria-labelledby="links-h">
        <BlockHead
          id="links-h"
          title={t("portal.linksTitle")}
          about={t("portal.linksAbout", { days: program.attribution_days })}
          actions={<LinkCreateDialog products={products} days={program.attribution_days} />}
        />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("portal.code")}</Th>
                <Th>{t("portal.target")}</Th>
                <Th className="text-right">{t("portal.clicks")}</Th>
                <Th className="text-right">{t("portal.orders")}</Th>
                <Th>{t("portal.state")}</Th>
                <Th>
                  <span className="vh">{t("actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {links.data.map((l) => (
                <tr key={l.id}>
                  <Td className="rt-title mono">{l.code}</Td>
                  <Td label={t("portal.target")}>
                    <Cell2 main={l.target_name} sub={`bepmoc.vn/r/${l.code}`} />
                  </Td>
                  <Td label={t("portal.clicks")} className="text-right num">
                    {formatCount(l.clicks_30d, locale)}
                  </Td>
                  <Td label={t("portal.orders")} className="text-right num">
                    {formatCount(l.orders, locale)}
                  </Td>
                  <Td label={t("portal.state")}>
                    <Status tone={l.disabled_at ? "b-arch" : "b-ok"}>
                      {l.disabled_at ? t("portal.off") : t("portal.on")}
                    </Status>
                  </Td>
                  <Td className="rt-acts">
                    {!l.disabled_at ? (
                      <ConfirmButton
                        action={disableLinkAction}
                        fields={{ id: l.id }}
                        label={t("portal.disable")}
                        title={t("portal.disableTitle", { code: l.code })}
                        points={[t("portal.disable1"), t("portal.disable2")]}
                        submit={t("portal.disableSubmit")}
                        done={t("portal.disabled")}
                      />
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <p className="gr-legal">{t("portal.privacy")}</p>
      </section>
      <section className="block" aria-labelledby="taxdocs-h">
        <BlockHead
          id="taxdocs-h"
          title={t("portal.taxTitle", { year })}
          about={t("portal.taxAbout")}
        />
        <Tiles
          items={[
            {
              title: t("portal.taxGross"),
              big: money(stats.year.gross.amount),
              text: t("portal.taxPayouts", { n: stats.year.payouts }),
            },
            {
              title: t("portal.taxWithheld"),
              big: money(stats.year.withheld.amount),
              text: t("portal.taxCerts", { n: stats.year.certificates }),
              meta: t("portal.taxForm"),
            },
            {
              title: t("portal.taxNet"),
              big: money(stats.year.net.amount),
              text: t("portal.taxStatement"),
            },
          ]}
        />
      </section>
    </div>
  );
}
