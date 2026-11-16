import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ChangeButtons } from "@/components/engage/actions";
import { Facts } from "@/components/engage/common";
import { FEED_BADGE, StatusBadge } from "@/components/finance/badges";
import { TaxBasis } from "@/components/finance/basis";
import { VietQrForm } from "@/components/finance/forms";
import { SampleBadge } from "@/components/sample-badge";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { LEDGER_READ, LEDGER_SETTINGS_MANAGE } from "@/lib/finance";
import { can } from "@/lib/viewer";
import {
  FINANCE_ORDER_REFS,
  lastFour,
  listBankAccounts,
  listPayments,
  PAYMENT_EXPIRY_MINUTES,
  SAMPLE_BANKS,
} from "@/sample/finance";
import { listUnits } from "@/sample/org";
import { listTaxRules, taxRuleOn } from "@/sample/tax";
import { bankFeedAction, createBankAccountAction } from "../actions";
import { tabGate } from "../gate";
import { ENDPOINTS } from "../shared";

// Tab "Tài khoản ngân hàng": chuyển khoản VietQR đi thẳng vào tài khoản của cửa hàng; hệ thống đọc
// biến động số dư qua đối tác đọc sao kê để tự khớp với thanh toán. Không có tài khoản nào của nền
// tảng nhận tiền người mua (D-187 của core).
export default async function BankPage(props: PageProps<"/finance/bank">) {
  const gate = await tabGate(LEDGER_READ);
  if (gate) return gate;
  const [t, params] = await Promise.all([getTranslations("finance.bank"), props.searchParams]);
  const open = typeof params.open === "string" ? params.open : "";
  const [{ data: accounts }, { data: units }, { data: payments }, { data: rules }, manage] =
    await Promise.all([
      listBankAccounts(),
      listUnits(),
      listPayments(),
      listTaxRules(),
      can(LEDGER_SETTINGS_MANAGE),
    ]);
  const stores = units.filter((u) => u.unit_type === "store" && u.status === "active");
  const sample = payments.find((p) => p.source_id === FINANCE_ORDER_REFS.mismatch);
  const active = accounts.filter((a) => a.status !== "not_connected");
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="fin-bank-h">
        <div className="block-head">
          <h2 id="fin-bank-h" className="h2">
            {t("title")}
          </h2>
          <SampleBadge step="36" endpoint={ENDPOINTS.bank} />
          {manage ? (
            <FormDialog
              action={createBankAccountAction}
              label={t("add.button")}
              title={t("add.title")}
              intro={t("add.intro")}
              submit={t("add.submit")}
              done={t("add.done")}
              triggerClass="btn sm"
              fields={[
                {
                  kind: "text",
                  name: "bank_bin",
                  label: t("add.bin"),
                  mono: true,
                  placeholder: "970xxx",
                  hint: t("add.binHint", {
                    banks: SAMPLE_BANKS.map((b) => `${b.bin} ${b.name}`).join(", "),
                  }),
                },
                { kind: "text", name: "account_number", label: t("add.number"), mono: true },
                {
                  kind: "text",
                  name: "account_name",
                  label: t("add.name"),
                  placeholder: "BẾP MỘC CN QUẬN 3",
                },
                {
                  kind: "select",
                  name: "org_id",
                  label: t("add.unit"),
                  options: stores.map((u) => ({ value: u.id, label: u.name })),
                },
              ]}
            />
          ) : null}
        </div>
        <p className="fhint">{t("about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("account")}</Th>
                <Th>{t("unit")}</Th>
                <Th>{t("feed")}</Th>
                <Th>{t("lastRead")}</Th>
                <Th>{t("state")}</Th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const isOpen = open === a.id;
                return [
                  <tr key={a.id} data-current={isOpen ? "" : undefined}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <Link
                          className="open"
                          href={isOpen ? "/finance/bank" : `/finance/bank?open=${a.id}#fin-bank-h`}
                          scroll={false}
                          aria-expanded={isOpen}
                        >
                          {a.bank_name} · •••• {lastFour(a.account_number)}
                        </Link>
                        <span className="sub ell">{a.account_name}</span>
                      </span>
                    </Td>
                    <Td label={t("unit")}>{a.org_name}</Td>
                    <Td label={t("feed")}>
                      <span className="cell2">
                        {t(`modes.${a.feed_mode}`)}
                        <span className="sub">
                          {a.feed_mode === "poll"
                            ? t("everySeconds", { seconds: a.poll_seconds ?? 60 })
                            : t("signed")}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("lastRead")}>
                      {a.last_read_at ? <Time value={a.last_read_at} /> : t("never")}
                    </Td>
                    <Td label={t("state")}>
                      <StatusBadge className={FEED_BADGE[a.status]}>
                        {t(`status.${a.status}`)}
                      </StatusBadge>
                    </Td>
                  </tr>,
                  isOpen ? (
                    <tr key={`${a.id}-open`} className="cat-detail-row">
                      <td colSpan={5}>
                        <div className="cat-detail">
                          <Facts
                            items={[
                              [
                                t("facts.bin"),
                                <span key="b" className="mono">
                                  {a.bank_bin}
                                </span>,
                              ],
                              [t("facts.holder"), a.account_name],
                              [t("facts.provider"), a.feed_provider ?? t("facts.noProvider")],
                              [
                                t("facts.matched"),
                                t("facts.matchedCount", { count: a.matched_this_month }),
                              ],
                              [t("facts.queued"), t("facts.queuedCount", { count: a.queued })],
                              ...(a.status === "paused" && a.pause_reason
                                ? ([
                                    [t("facts.pauseReason"), t(`pauseReasons.${a.pause_reason}`)],
                                    [
                                      t("facts.since"),
                                      a.paused_at ? <Time key="s" value={a.paused_at} /> : "—",
                                    ],
                                  ] as [string, ReactNode][])
                                : []),
                            ]}
                          />
                          <p className="fhint">
                            {a.status === "paused"
                              ? t("pausedNote", { unit: a.org_name })
                              : a.status === "not_connected"
                                ? t("notConnectedNote")
                                : t("activeNote")}
                          </p>
                          {manage && a.status !== "not_connected" ? (
                            <ChangeButtons
                              action={bankFeedAction}
                              id={a.id}
                              expect=""
                              undo={{ label: t("undo"), done: t("undone") }}
                              moves={
                                a.status === "active"
                                  ? [
                                      {
                                        value: "paused",
                                        label: t("pause"),
                                        done: t("paused"),
                                        tone: "danger",
                                      },
                                    ]
                                  : [
                                      {
                                        value: "active",
                                        label: t("resume"),
                                        done: t("resumed"),
                                        tone: "pri",
                                      },
                                    ]
                              }
                            />
                          ) : null}
                          {a.status === "not_connected" ? (
                            <Link className="btn sm" href="/settings/connections">
                              {t("connect")}
                            </Link>
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
      </section>

      <section className="block half" aria-labelledby="fin-qr-h">
        <div className="block-head">
          <h2 id="fin-qr-h" className="h2">
            {t("qr.title")}
          </h2>
        </div>
        <p className="fhint">{t("qr.about")}</p>
        {manage && active.length > 0 ? (
          <VietQrForm
            accounts={active.map((a) => ({
              value: a.id,
              label: `•••• ${lastFour(a.account_number)} · ${a.org_name}`,
            }))}
            defaults={{
              bank_account_id:
                active.find((a) => a.org_name === sample?.org_name)?.id ?? active[0]?.id ?? "",
              amount: sample?.amount.amount ?? "660000",
              memo: sample?.transfer_code ?? "AXK7Q2M9TP",
            }}
          />
        ) : (
          <p className="empty card">{t("qr.cannot")}</p>
        )}
      </section>

      <section className="block half" aria-labelledby="fin-due-h">
        <h2 id="fin-due-h" className="h2">
          {t("due.title")}
        </h2>
        <p className="note">
          <b>{t("due.strong")}</b> {t("due.text", { minutes: PAYMENT_EXPIRY_MINUTES })}
        </p>
        <TaxBasis rule={taxRuleOn(rules, "payments.vietqr_standard")} />
        <TaxBasis rule={taxRuleOn(rules, "payments.no_custody")} lead={t("due.custody")} />
      </section>
    </div>
  );
}
