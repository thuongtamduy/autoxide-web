import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { resolveAction, retryInboundAction } from "@/app/(admin)/sales/channels/actions";
import { MapDialog, ResolveConflictDialog } from "@/components/channels/forms";
import { ConfirmButton } from "@/components/engage/actions";
import { Chips } from "@/components/engage/common";
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
} from "@/components/growth/blocks";
import { MoneyConfirm } from "@/components/orders/forms";
import { InlineAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { CHANNELS_ORDERS_MANAGE } from "@/lib/channels";
import { formatCount, formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import {
  INBOUND_OPEN,
  type InboundChip,
  type InboundStatus,
  inboundStats,
  listInbound,
} from "@/sample/channels";
import { CHANNEL_TABS, variantOptions } from "../shared";

const CHIPS: readonly InboundChip[] = [
  "needs_mapping",
  "oversold",
  "conflict",
  "failed",
  "imported",
];
const TONE: Record<InboundStatus, string> = {
  received: "b-info",
  needs_mapping: "b-warn",
  imported: "b-ok",
  oversold: "b-bad",
  conflict: "b-violet",
  failed: "b-bad",
};

// Tab "Đơn cần xử lý": đơn từ kênh về qua thông báo đẩy và kéo định kỳ; kênh gửi lại cùng đơn nhiều lần vẫn
// chỉ tạo một đơn. Đơn thiếu ánh xạ, bán quá tồn, xung đột trạng thái hay nhập lỗi chờ người xử lý; đơn đã
// nhập nằm ở màn Đơn hàng (cột Kênh). SĐT người mua do kênh che, không dùng chống bom hàng.
export default async function InboundPage(props: PageProps<"/sales/channels/inbound">) {
  if (!(await can(CHANNEL_TABS.inbound))) notFound();
  const [t, locale, params, stats, all, variants, manage] = await Promise.all([
    getTranslations("channels"),
    getLocale(),
    props.searchParams,
    inboundStats(),
    listInbound(),
    variantOptions(),
    can(CHANNELS_ORDERS_MANAGE),
  ]);
  const chip = CHIPS.find((c) => c === param(params, "chip")) ?? null;
  const open = param(params, "open");
  const base = { chip: chip ?? "" };
  const rows = (chip ? all.data.filter((r) => r.status === chip) : all.data).slice(
    0,
    chip ? 100 : 15,
  );
  const money = (amount: string | number) => formatMoney(amount, "VND", locale);
  return (
    <div className="blocks">
      <Kpis
        label={t("inbound.kpis")}
        items={[
          {
            label: t("inbound.kpiToday"),
            value: formatCount(stats.today, locale),
            sub: t("inbound.kpiTodaySub", { n: stats.imported_today }),
          },
          {
            label: t("inbound.kpiMapping"),
            value: formatCount(stats.needs_mapping, locale),
            sub: t("inbound.kpiMappingSub"),
          },
          {
            label: t("inbound.kpiOversold"),
            value: formatCount(stats.oversold, locale),
            sub: t("inbound.kpiOversoldSub"),
          },
          {
            label: t("inbound.kpiConflict"),
            value: formatCount(stats.conflict_failed, locale),
            sub: t("inbound.kpiConflictSub"),
          },
        ]}
      />
      <section className="block" aria-labelledby="inbound-h">
        <BlockHead id="inbound-h" title={t("inbound.title")} about={t("inbound.about")} />
        <Chips
          label={t("inbound.filter")}
          chips={[
            {
              href: "/sales/channels/inbound",
              label: t("inbound.needAction"),
              on: !chip,
              count: stats.open,
            },
            ...CHIPS.map((c) => ({
              href: hrefWith("/sales/channels/inbound", {}, { chip: c }),
              label: t(`inboundState.${c}`),
              on: chip === c,
              count: all.data.filter((r) => r.status === c).length,
            })),
          ]}
        />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("inbound.external")}</Th>
                <Th>{t("inbound.order")}</Th>
                <Th>{t("inbound.problem")}</Th>
                <Th>{t("inbound.received")}</Th>
                <Th>{t("inbound.state")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = open === r.id;
                const unmapped = r.lines.filter((l) => !l.sku);
                const problem =
                  r.status === "needs_mapping"
                    ? t("inbound.pUnmapped", {
                        sku: unmapped.map((l) => l.external_sku).join(", "),
                        n: unmapped.length,
                        total: r.lines.length,
                      })
                    : r.status === "oversold"
                      ? t("inbound.pOversold")
                      : r.status === "conflict"
                        ? t("inbound.pConflict", { status: r.external_status })
                        : r.status === "failed"
                          ? t("inbound.pFailed", { n: r.attempts })
                          : r.resolution
                            ? t(`inbound.resolved.${r.resolution.action}`)
                            : "—";
                return [
                  <tr key={r.id} data-current={isOpen ? "" : undefined}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <OpenLink
                          open={isOpen}
                          href={hrefWith(
                            "/sales/channels/inbound",
                            base,
                            { open: r.id },
                            "#inbound-h",
                          )}
                          closeHref={hrefWith("/sales/channels/inbound", base, {})}
                        >
                          <span className="mono">{r.external_order_id}</span>
                        </OpenLink>
                        <span className="sub">{r.account_name}</span>
                      </span>
                    </Td>
                    <Td label={t("inbound.order")}>
                      {r.order_id ? (
                        <Link className="mono" href={`/sales/orders/${r.order_id}`}>
                          {r.order_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td label={t("inbound.problem")}>{problem}</Td>
                    <Td label={t("inbound.received")}>
                      <Time value={r.received_at} />
                    </Td>
                    <Td label={t("inbound.state")}>
                      <Status tone={TONE[r.status]}>{t(`inboundState.${r.status}`)}</Status>
                    </Td>
                  </tr>,
                  isOpen ? (
                    <DetailRow key={`${r.id}-open`} cols={5}>
                      <h3 className="h2">
                        {r.external_order_id} · {r.account_name}
                      </h3>
                      <KV
                        items={[
                          [
                            t("inbound.buyer"),
                            <span key="b" className="gr-mask">
                              {r.buyer_masked}
                            </span>,
                          ],
                          [
                            t("inbound.channelStatus"),
                            <span key="s" className="mono">
                              {r.external_status}
                            </span>,
                          ],
                          [t("inbound.attempts"), formatCount(r.attempts, locale)],
                          r.last_error
                            ? [
                                t("inbound.lastError"),
                                t(`codes.${r.last_error.replaceAll(".", "_")}`, {
                                  detail: unmapped.map((l) => l.external_sku).join(", "),
                                }),
                              ]
                            : null,
                          r.status === "oversold"
                            ? [t("inbound.autoCancel"), t("inbound.autoCancelOff")]
                            : null,
                          r.resolution
                            ? [
                                t("inbound.resolvedBy"),
                                `${r.resolution.by.name}${r.resolution.note ? ` · ${r.resolution.note}` : ""}`,
                              ]
                            : null,
                        ]}
                      />
                      <Lines
                        total
                        items={[
                          ...r.lines.map(
                            (l) =>
                              [
                                <span key={l.external_sku}>
                                  <span className="mono">{l.external_sku}</span> ·{" "}
                                  {l.sku ? l.title : t("inbound.notLinked")} × {l.quantity}
                                </span>,
                                money(Number(l.unit_price.amount) * l.quantity),
                              ] as const,
                          ),
                          [t("inbound.total"), money(r.total.amount)] as const,
                        ]}
                      />
                      <p className="fhint">{t(`inboundNote.${r.status}`)}</p>
                      {manage && INBOUND_OPEN.includes(r.status) ? (
                        <span className="row-acts">
                          {r.status === "needs_mapping"
                            ? unmapped.map((l, i) => (
                                <MapDialog
                                  key={l.external_sku}
                                  id={r.id}
                                  externalSku={l.external_sku}
                                  title={l.title}
                                  variants={variants}
                                  primary={i === 0}
                                />
                              ))
                            : null}
                          {r.status === "failed" ? (
                            <InlineAction
                              action={retryInboundAction}
                              id={r.id}
                              label={t("inbound.retry")}
                              done={t("inbound.retried")}
                            />
                          ) : null}
                          {r.status === "conflict" ? (
                            <ResolveConflictDialog id={r.id} number={r.order_number ?? ""} />
                          ) : null}
                          {r.status === "oversold" ? (
                            <>
                              <ConfirmButton
                                action={resolveAction}
                                fields={{ id: r.id, resolution: "keep" }}
                                label={t("inbound.keep")}
                                title={t("inbound.keepTitle", { number: r.order_number ?? "" })}
                                points={[t("inbound.keep1"), t("inbound.keep2")]}
                                submit={t("inbound.keepSubmit")}
                                done={t("inbound.kept")}
                                danger={false}
                              />
                              <MoneyConfirm
                                action={resolveAction}
                                fields={{ id: r.id, resolution: "cancel_on_channel" }}
                                label={t("inbound.cancel")}
                                title={t("inbound.cancelTitle", { number: r.order_number ?? "" })}
                                rows={[
                                  [
                                    t("inbound.cancelOrder"),
                                    `${r.order_number} · ${r.external_order_id}`,
                                  ],
                                  [t("inbound.cancelAmount"), money(r.total.amount)],
                                  [
                                    t("inbound.cancelWhere"),
                                    t("inbound.cancelWhereText", { account: r.account_name }),
                                  ],
                                  [t("inbound.cancelReason"), t("inbound.cancelReasonText")],
                                ]}
                                warn={t("inbound.cancelWarn")}
                                submit={t("inbound.cancelSubmit")}
                                done={t("inbound.cancelled")}
                                triggerClass="btn sm danger"
                              />
                            </>
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
        <p className="fhint">{t("inbound.foot")}</p>
      </section>
    </div>
  );
}
