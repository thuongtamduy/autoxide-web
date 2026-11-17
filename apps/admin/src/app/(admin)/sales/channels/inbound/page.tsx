import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  bulkRetryInboundAction,
  resolveAction,
  retryInboundAction,
} from "@/app/(admin)/sales/channels/actions";
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
import { BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { InlineAction } from "@/components/ui/confirm";
import { Pager } from "@/components/ui/pager";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { CHANNELS_ORDERS_MANAGE } from "@/lib/channels";
import { formatCount, formatMoney } from "@/lib/format";
import { readPage, slicePage } from "@/lib/table";
import { can } from "@/lib/viewer";
import {
  INBOUND_OPEN,
  type InboundChip,
  type InboundStatus,
  inboundMatches,
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
// nhập nằm ở màn Đơn hàng (cột Kênh). SĐT người mua do kênh che, không dùng chống bom hàng. Chip mặc
// định "Cần xử lý" chỉ giữ đơn chờ người xử lý; "Tất cả" có cả đơn đã nhập. Dòng hiện một nút cho việc
// cần làm, còn lại trong "⋯"; chọn nhiều để nhập lại đơn lỗi (lặp lệnh từng đơn, gom lỗi). Phân trang có
// tổng (nguồn mẫu có đủ danh sách).
export default async function InboundPage(props: PageProps<"/sales/channels/inbound">) {
  if (!(await can(CHANNEL_TABS.inbound))) notFound();
  const [t, tt, locale, params, stats, all, variants, manage] = await Promise.all([
    getTranslations("channels"),
    getTranslations("table"),
    getLocale(),
    props.searchParams,
    inboundStats(),
    listInbound(),
    variantOptions(),
    can(CHANNELS_ORDERS_MANAGE),
  ]);
  const wanted = param(params, "chip");
  const chip: InboundChip | "all" | null =
    wanted === "all" ? "all" : (CHIPS.find((c) => c === wanted) ?? null);
  const open = param(params, "open");
  const paging = readPage(params);
  const page = slicePage(
    all.data.filter((r) => inboundMatches(r, chip ?? "open")),
    paging.page,
    paging.per,
  );
  const rows = page.data;
  const keep = {
    chip: chip ?? null,
    page: page.page > 1 ? page.page : null,
    per: params.per ? paging.per : null,
  };
  const base = {
    chip: chip ?? "",
    page: keep.page ? String(keep.page) : "",
    per: keep.per ? String(keep.per) : "",
  };
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
            {
              href: hrefWith("/sales/channels/inbound", {}, { chip: "all" }),
              label: t("inbound.all"),
              on: chip === "all",
              count: all.data.length,
            },
          ]}
        />
        <div className="card tcard">
          {rows.length === 0 ? (
            <p className="empty">{t("inbound.empty")}</p>
          ) : (
            <BulkTable
              ids={rows.map((r) => r.id)}
              actions={
                manage
                  ? [{ key: "retry", label: t("inbound.retry"), run: bulkRetryInboundAction }]
                  : []
              }
            >
              <Table cards>
                <thead>
                  <tr>
                    {manage ? <SelectAllTh /> : null}
                    <Th>{t("inbound.external")}</Th>
                    <Th>{t("inbound.order")}</Th>
                    <Th>{t("inbound.problem")}</Th>
                    <Th>{t("inbound.received")}</Th>
                    <Th>{t("inbound.state")}</Th>
                    <Th>
                      <span className="vh">{t("actions")}</span>
                    </Th>
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
                    const handle = manage && INBOUND_OPEN.includes(r.status);
                    const menu: RowMenuItem[] = [
                      {
                        label: isOpen ? t("inbound.hideDetail") : t("inbound.openDetail"),
                        href: isOpen
                          ? hrefWith("/sales/channels/inbound", base, {})
                          : hrefWith("/sales/channels/inbound", base, { open: r.id }, "#inbound-h"),
                      },
                    ];
                    if (r.order_id) {
                      menu.push({
                        label: t("inbound.openOrder"),
                        href: `/sales/orders/${r.order_id}`,
                      });
                    }
                    if (handle && r.status === "needs_mapping") {
                      for (const l of unmapped.slice(1)) {
                        menu.push({
                          label: t("map.button", { sku: l.external_sku }),
                          dialog: (
                            <MapDialog
                              id={r.id}
                              externalSku={l.external_sku}
                              title={l.title}
                              variants={variants}
                            />
                          ),
                        });
                      }
                    }
                    if (handle && r.status === "oversold") {
                      menu.push({
                        label: t("inbound.cancel"),
                        danger: true,
                        dialog: (
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
                        ),
                      });
                    }
                    const first = unmapped[0];
                    return [
                      <tr key={r.id} data-current={isOpen ? "" : undefined}>
                        {manage ? <SelectTd id={r.id} name={r.external_order_id} /> : null}
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
                        <Td className="rt-acts">
                          <span className="row-acts">
                            {handle && r.status === "needs_mapping" && first ? (
                              <MapDialog
                                id={r.id}
                                externalSku={first.external_sku}
                                title={first.title}
                                variants={variants}
                              />
                            ) : null}
                            {handle && r.status === "failed" ? (
                              <InlineAction
                                action={retryInboundAction}
                                id={r.id}
                                label={t("inbound.retry")}
                                ariaLabel={`${t("inbound.retry")} ${r.external_order_id}`}
                                done={t("inbound.retried")}
                              />
                            ) : null}
                            {handle && r.status === "conflict" ? (
                              <ResolveConflictDialog id={r.id} number={r.order_number ?? ""} />
                            ) : null}
                            {handle && r.status === "oversold" ? (
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
                            ) : null}
                            <RowMenu
                              label={tt("moreFor", { name: r.external_order_id })}
                              items={menu}
                            />
                          </span>
                        </Td>
                      </tr>,
                      isOpen ? (
                        <DetailRow key={`${r.id}-open`} cols={manage ? 7 : 6}>
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
                        </DetailRow>
                      ) : null,
                    ];
                  })}
                </tbody>
              </Table>
            </BulkTable>
          )}
        </div>
        <Pager
          total={page.total}
          page={page.page}
          per={paging.per}
          base="/sales/channels/inbound"
          keep={keep}
        />
        <p className="fhint">{t("inbound.foot")}</p>
      </section>
    </div>
  );
}
