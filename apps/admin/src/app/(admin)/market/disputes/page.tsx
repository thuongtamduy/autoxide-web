import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Chips, Forbidden } from "@/components/engage/common";
import { DisputeBadge, DisputeThread, DueIn } from "@/components/market/common";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { MARKETPLACE_DISPUTES_RESOLVE } from "@/lib/market";
import { can } from "@/lib/viewer";
import { type DisputeStatus, listDisputes, RESOLUTIONS } from "@/sample/market";
import { resolveDisputeAction } from "../actions";
import { param } from "../shared";

const FILTERS: DisputeStatus[] = ["open", "seller_responded", "escalated", "resolved"];

// Tab "Tranh chấp": người mua mở trong hạn đổi trả; đơn tạm chưa hoàn tất nên tiền chưa chi cho người
// bán. Người bán có hạn trả lời; quá hạn hay hai bên chưa thống nhất thì sàn phân xử. Quyết định hoàn
// tiền đi qua đối tác thu hộ và không đảo được, nên hộp phân xử nêu từng hệ quả và cần xác nhận.
export default async function DisputesTab(props: PageProps<"/market/disputes">) {
  if (!(await can(MARKETPLACE_DISPUTES_RESOLVE))) {
    return <Forbidden permission={MARKETPLACE_DISPUTES_RESOLVE} />;
  }
  const [t, locale, params] = await Promise.all([
    getTranslations("market"),
    getLocale(),
    props.searchParams,
  ]);
  const status = FILTERS.find((s) => s === param(params, "status"));
  const open = param(params, "open");
  const [{ data: disputes }, { data: all }] = await Promise.all([
    listDisputes(status ? { status } : {}),
    listDisputes(),
  ]);
  const money = (amount: string) => formatMoney(amount, "VND", locale);
  const href = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = { status: status ?? "", ...change };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/market/disputes?${query}` : "/market/disputes";
  };
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="mk-disputes-h">
        <h2 id="mk-disputes-h" className="h2">
          {t("disputes.title")}
        </h2>
        <p className="fhint">{t("disputes.about")}</p>
        <Chips
          label={t("disputes.filter")}
          chips={[
            {
              href: href({ status: null, open: null }),
              label: t("all"),
              on: !status,
              count: all.length,
            },
            ...FILTERS.map((s) => ({
              href: href({ status: s, open: null }),
              label: t(`disputeStatus.${s}`),
              on: status === s,
              count: all.filter((d) => d.status === s).length,
            })),
          ]}
        />
        <div className="card tcard">
          {disputes.length === 0 ? (
            <p className="empty">{t("disputes.empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("disputes.number")}</Th>
                  <Th>{t("disputes.seller")}</Th>
                  <Th>{t("disputes.reason")}</Th>
                  <Th>{t("disputes.due")}</Th>
                  <Th>{t("disputes.state")}</Th>
                  <Th>
                    <span className="vh">{t("actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {disputes.map((d) => {
                  const isOpen = open === d.id;
                  const due =
                    d.status === "escalated"
                      ? { who: t("disputes.duePlatform"), at: d.platform_due_at }
                      : d.status === "open"
                        ? { who: t("disputes.dueSeller"), at: d.seller_due_at }
                        : d.status === "seller_responded"
                          ? { who: t("disputes.dueBuyer"), at: d.seller_due_at }
                          : null;
                  return [
                    <tr key={d.id} data-current={isOpen ? "" : undefined}>
                      <Td className="rt-title">
                        <span className="cell2">
                          <Link
                            className="open mono"
                            href={
                              isOpen
                                ? href({ open: null })
                                : `${href({ open: d.id })}#mk-disputes-h`
                            }
                            scroll={false}
                            aria-expanded={isOpen}
                          >
                            {d.number}
                          </Link>
                          <span className="sub">
                            {t("disputes.order", { number: d.order_number })}
                          </span>
                        </span>
                      </Td>
                      <Td label={t("disputes.seller")}>{d.seller_name}</Td>
                      <Td label={t("disputes.reason")}>
                        <span className="cell2">
                          <span>{t(`disputeReason.${d.reason_code}`)}</span>
                          <span className="sub">
                            {t("disputes.claim", { amount: money(d.claim.amount) })}
                          </span>
                        </span>
                      </Td>
                      <Td label={t("disputes.due")}>
                        {due ? (
                          <span className="cell2">
                            <span>{due.who}</span>
                            <DueIn until={due.at} />
                          </span>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td label={t("disputes.state")}>
                        <span className="cell2">
                          <DisputeBadge status={d.status} />
                          {d.resolution ? (
                            <span className="sub">
                              {t(`resolution.${d.resolution}`)}
                              {d.resolution_amount && Number(d.resolution_amount.amount) > 0
                                ? ` · ${money(d.resolution_amount.amount)}`
                                : ""}
                            </span>
                          ) : null}
                        </span>
                      </Td>
                      <Td className="rt-acts">
                        {d.status === "escalated" ? (
                          <FormDialog
                            action={resolveDisputeAction}
                            label={t("disputes.resolve")}
                            title={t("disputes.resolveTitle", { number: d.number })}
                            points={[
                              t("disputes.resolvePoint1"),
                              t("disputes.resolvePoint2"),
                              t("disputes.resolvePoint3"),
                            ]}
                            submit={t("disputes.resolveSubmit")}
                            done={t("disputes.resolved")}
                            triggerClass="btn sm pri"
                            fields={[
                              { kind: "hidden", name: "id", value: d.id },
                              {
                                kind: "select",
                                name: "resolution",
                                label: t("disputes.decision"),
                                options: [
                                  { value: "", label: t("disputes.choose") },
                                  ...RESOLUTIONS.map((r) => ({
                                    value: r,
                                    label:
                                      r === "refund_full"
                                        ? t("disputes.refundFull", {
                                            amount: money(d.claim.amount),
                                          })
                                        : t(`resolution.${r}`),
                                  })),
                                ],
                              },
                              {
                                kind: "text",
                                name: "amount",
                                label: t("disputes.amount"),
                                mono: true,
                                hint: t("disputes.amountHint", { paid: money(d.paid.amount) }),
                              },
                              {
                                kind: "textarea",
                                name: "reason",
                                label: t("disputes.decisionReason"),
                                hint: t("disputes.decisionReasonHint"),
                              },
                              { kind: "check", name: "acknowledged", label: t("disputes.ack") },
                            ]}
                          />
                        ) : null}
                      </Td>
                    </tr>,
                    isOpen ? (
                      <tr key={`${d.id}-open`} className="cat-detail-row">
                        <td colSpan={6}>
                          <div className="cat-detail">
                            <h3 className="h2">
                              {d.number} · {d.seller_name}
                            </h3>
                            <p className="fhint">
                              {t("disputes.paid", { amount: money(d.paid.amount) })} ·{" "}
                              {t("disputes.claim", { amount: money(d.claim.amount) })}
                            </p>
                            <DisputeThread d={d} />
                            <p className="fhint">{t("disputes.note")}</p>
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
        <p className="fhint">{t("disputes.foot")}</p>
      </section>
    </div>
  );
}
