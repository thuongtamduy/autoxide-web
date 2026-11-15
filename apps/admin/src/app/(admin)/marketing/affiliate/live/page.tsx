import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { endAction, startAction } from "@/app/(admin)/marketing/affiliate/actions";
import { PinDialog } from "@/components/affiliate/forms";
import { ConfirmButton } from "@/components/engage/actions";
import {
  BlockHead,
  DetailRow,
  hrefWith,
  Kpis,
  KV,
  Lines,
  OpenLink,
  param,
  Status,
  Timeline,
} from "@/components/growth/blocks";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { AFFILIATE_LIVE_MANAGE } from "@/lib/affiliate";
import { formatCount, formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import { listPartners, listSessions, type SessionStatus } from "@/sample/affiliate";
import { AFFILIATE_TABS, productOptions } from "../shared";

const TONE: Record<SessionStatus, string> = {
  live: "b-bad",
  scheduled: "b-sched",
  ended: "b-arch",
};

// Tab "Livestream": Autoxide không phát video; phiên trỏ tới nền tảng phát. Người phát phải đã xác thực
// danh tính cho mục đích livestream và xác thực SĐT (Luật TMĐT 2025, NĐ 147/2024). Giữ sản phẩm gắn, giá công
// bố và nhật ký phiên (chỉ thêm; thời hạn lưu là cấu hình — cần đối chiếu nghị định hướng dẫn).
export default async function LivePage(props: PageProps<"/marketing/affiliate/live">) {
  if (!(await can(AFFILIATE_TABS.live))) notFound();
  const [t, locale, params, sessions, partners, products, manage] = await Promise.all([
    getTranslations("affiliate"),
    getLocale(),
    props.searchParams,
    listSessions(),
    listPartners(),
    productOptions(),
    can(AFFILIATE_LIVE_MANAGE),
  ]);
  const open = param(params, "open");
  const money = (amount: string | number) => formatMoney(amount, "VND", locale);
  const live = sessions.data.filter((s) => s.status === "live");
  const scheduled = sessions.data.filter((s) => s.status === "scheduled");
  const recent = sessions.data.filter(
    (s) => s.started_at && Date.parse(s.started_at) >= Date.now() - 7 * 86_400_000,
  );
  return (
    <div className="blocks">
      <Kpis
        label={t("live.kpis")}
        items={[
          {
            label: t("live.kpiLive"),
            value: formatCount(live.length, locale),
            sub: live[0]
              ? t("live.kpiLiveSub", {
                  host: live[0].host_name,
                  platform: t(`platforms.${live[0].platform}`),
                })
              : "—",
          },
          {
            label: t("live.kpiScheduled"),
            value: formatCount(scheduled.length, locale),
            sub: t("live.kpiScheduledSub"),
          },
          {
            label: t("live.kpiOrders"),
            value: formatCount(
              recent.reduce((s, x) => s + x.report.orders, 0),
              locale,
            ),
            sub: t("live.kpiOrdersSub", { n: recent.length }),
          },
          {
            label: t("live.kpiRevenue"),
            value: money(recent.reduce((s, x) => s + Number(x.report.revenue.amount), 0)),
            sub: t("live.kpiRevenueSub"),
          },
        ]}
      />
      <p className="note">
        <b>{t("live.noVideoTitle")}</b> {t("live.noVideoText")}
      </p>
      <section className="block" aria-labelledby="live-h">
        <BlockHead id="live-h" title={t("live.title")} />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("live.session")}</Th>
                <Th>{t("live.host")}</Th>
                <Th>{t("live.time")}</Th>
                <Th className="text-right">{t("live.products")}</Th>
                <Th className="text-right">{t("live.orders")}</Th>
                <Th>{t("live.state")}</Th>
              </tr>
            </thead>
            <tbody>
              {sessions.data.map((s) => {
                const isOpen = open === s.id;
                const host = partners.data.find((p) => p.id === s.host_partner_id);
                return [
                  <tr key={s.id} data-current={isOpen ? "" : undefined}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <OpenLink
                          open={isOpen}
                          href={hrefWith(
                            "/marketing/affiliate/live",
                            {},
                            { open: s.id },
                            "#live-h",
                          )}
                          closeHref="/marketing/affiliate/live"
                        >
                          {s.title}
                        </OpenLink>
                        <span className="sub">
                          {t(`platforms.${s.platform}`)} · {s.org_name}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("live.host")}>{s.host_name}</Td>
                    <Td label={t("live.time")}>
                      {(s.started_at ?? s.scheduled_at) ? (
                        <Time value={s.started_at ?? s.scheduled_at ?? ""} />
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td label={t("live.products")} className="text-right num">
                      {formatCount(s.products.filter((p) => !p.unpinned_at).length, locale)}
                    </Td>
                    <Td label={t("live.orders")} className="text-right num">
                      {s.status === "scheduled" ? "—" : formatCount(s.report.orders, locale)}
                    </Td>
                    <Td label={t("live.state")}>
                      <Status tone={TONE[s.status]}>{t(`sessionState.${s.status}`)}</Status>
                    </Td>
                  </tr>,
                  isOpen ? (
                    <DetailRow key={`${s.id}-open`} cols={6}>
                      <h3 className="h2">{s.title}</h3>
                      <KV
                        items={[
                          [
                            t("live.host"),
                            s.host_kind === "staff"
                              ? t("live.staffHost", { name: s.host_name })
                              : host?.kyc.livestream
                                ? t("live.hostKyc", {
                                    name: s.host_name,
                                    until: host.kyc.livestream.expires_at.slice(0, 7),
                                  })
                                : s.host_name,
                          ],
                          [t("live.phone"), t("live.phoneVerified")],
                          [
                            t("live.platform"),
                            `${t(`platforms.${s.platform}`)} · ${t("live.urlHidden")}`,
                          ],
                          [t("live.store"), s.org_name],
                          s.ended_at
                            ? [t("live.ended"), <Time key="e" value={s.ended_at} />]
                            : null,
                        ]}
                      />
                      {s.products.length > 0 ? (
                        <>
                          <h4 className="h3">{t("live.pinned")}</h4>
                          <Lines
                            items={s.products.map(
                              (p) =>
                                [
                                  `${p.name}${p.promotion_code ? ` · ${t("live.withCode", { code: p.promotion_code })}` : ""}`,
                                  money(p.price_shown.amount),
                                ] as const,
                            )}
                          />
                        </>
                      ) : null}
                      {s.status !== "scheduled" ? (
                        <>
                          <h4 className="h3">{t("live.report")}</h4>
                          <Lines
                            total
                            items={[
                              ...s.report.lines.map(
                                (l) =>
                                  [`${l.name} × ${l.quantity}`, money(l.revenue.amount)] as const,
                              ),
                              [
                                t("live.reportOrders", { n: s.report.orders }),
                                money(s.report.revenue.amount),
                              ],
                              [t("live.reportCommission"), money(s.report.commission.amount)],
                            ]}
                          />
                        </>
                      ) : null}
                      {s.log.length > 0 ? (
                        <>
                          <h4 className="h3">{t("live.log")}</h4>
                          <Timeline
                            items={[...s.log].reverse().map(
                              (e) =>
                                [
                                  <span key={e.at + e.kind}>
                                    <Time value={e.at} /> · {e.actor}
                                  </span>,
                                  `${t(`logKind.${e.kind}`)}${e.details ? `: ${e.details}` : ""}`,
                                ] as const,
                            )}
                          />
                        </>
                      ) : null}
                      <p className="fhint">{t("live.priceNote")}</p>
                      {manage && s.status !== "ended" ? (
                        <span className="row-acts">
                          {s.status === "scheduled" ? (
                            <ConfirmButton
                              action={startAction}
                              fields={{ id: s.id }}
                              label={t("live.start")}
                              title={t("live.startTitle", { title: s.title })}
                              points={[t("live.start1"), t("live.start2")]}
                              submit={t("live.startSubmit")}
                              done={t("live.started")}
                              danger={false}
                            />
                          ) : null}
                          <PinDialog id={s.id} title={s.title} products={products} />
                          {s.status === "live" ? (
                            <ConfirmButton
                              action={endAction}
                              fields={{ id: s.id }}
                              label={t("live.end")}
                              title={t("live.endTitle", { title: s.title })}
                              points={[t("live.end1"), t("live.end2")]}
                              submit={t("live.endSubmit")}
                              done={t("live.endedDone")}
                            />
                          ) : null}
                        </span>
                      ) : null}
                    </DetailRow>
                  ) : null,
                ];
              })}
            </tbody>
          </Table>
        </div>
      </section>
    </div>
  );
}
