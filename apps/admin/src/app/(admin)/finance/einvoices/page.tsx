import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Chips, Facts } from "@/components/engage/common";
import { DOCUMENT_BADGE, StatusBadge } from "@/components/finance/badges";
import { TaxBasis } from "@/components/finance/basis";
import { SampleBadge } from "@/components/sample-badge";
import { ConfirmAction, InlineAction } from "@/components/ui/confirm";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatDay } from "@/lib/catalog";
import { INVOICES_CORRECT, INVOICES_ISSUE, INVOICES_READ } from "@/lib/finance";
import { formatCount, formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import {
  CORRECTION_KINDS,
  type DocumentFilter,
  einvoiceStats,
  type InvoiceDocument,
  listDocuments,
  numberText,
} from "@/sample/finance-invoices";
import { listConnections } from "@/sample/settings";
import { listTaxRules, taxRuleOn } from "@/sample/tax";
import {
  correctDocumentAction,
  deleteDraftAction,
  issueDocumentAction,
  refreshDocumentAction,
  resubmitDocumentAction,
} from "../actions";
import { tabGate } from "../gate";
import { ENDPOINTS } from "../shared";

const CHIPS: DocumentFilter[] = ["rejected", "submitting", "accepted", "draft", "corrected"];

// Tab "Hoá đơn điện tử": hoá đơn lập khi giao hàng; số cấp tuần tự theo ký hiệu, không nhảy số (nháp
// chưa có số). Bị nhà cung cấp trả lỗi thì sửa trường bị báo và gửi lại cùng số; hoá đơn đã có mã của
// cơ quan thuế chỉ sửa bằng chứng từ điều chỉnh / thay thế, hay huỷ theo thông báo sai sót.
export default async function EinvoicesPage(props: PageProps<"/finance/einvoices">) {
  const gate = await tabGate(INVOICES_READ);
  if (gate) return gate;
  const [t, locale, params] = await Promise.all([
    getTranslations("finance.einvoices"),
    getLocale(),
    props.searchParams,
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const filter = CHIPS.find((c) => c === one("f"));
  const open = one("open");
  const [
    { data: docs },
    { data: all },
    stats,
    { data: connections },
    { data: rules },
    issue,
    correct,
  ] = await Promise.all([
    listDocuments(filter),
    listDocuments(),
    einvoiceStats(),
    listConnections(),
    listTaxRules(),
    can(INVOICES_ISSUE),
    can(INVOICES_CORRECT),
  ]);
  const money = (m: { amount: string; currency: string }) =>
    formatMoney(m.amount, m.currency, locale);
  const href = (over: { f?: string | null; open?: string | null }) => {
    const query = new URLSearchParams();
    const f = over.f === undefined ? (filter ?? null) : over.f;
    if (f) query.set("f", f);
    if (over.open) query.set("open", over.open);
    const text = query.toString();
    return text ? `/finance/einvoices?${text}` : "/finance/einvoices";
  };
  const connection = connections.find((c) => c.id === "einvoice");
  const label = (d: InvoiceDocument) =>
    d.number === null ? t("noNumber") : `${numberText(d.number)}`;
  const related = (d: InvoiceDocument) => all.find((x) => x.id === d.related_document_id);
  const facts = (d: InvoiceDocument): [string, ReactNode][] => {
    const list: [string, ReactNode][] = [
      [t("facts.kind"), t(`kinds.${d.kind}`)],
      [t("facts.issuer"), d.org_name],
    ];
    if (d.on_behalf_of)
      list.push([
        t("facts.onBehalf"),
        t("facts.onBehalfValue", {
          seller: d.on_behalf_of.name,
          mandate: d.on_behalf_of.mandate_number,
        }),
      ]);
    list.push([
      t("facts.buyer"),
      `${d.buyer.name}${d.buyer.tax_code ? ` · ${t("facts.taxCode", { code: d.buyer.tax_code })}` : ` · ${t("facts.noTaxCode")}`}`,
    ]);
    if (d.authority_code)
      list.push([
        d.kind === "cash_register_invoice" ? t("facts.softwareCode") : t("facts.authority"),
        <span key="a" className="mono">
          {d.authority_code}
        </span>,
      ]);
    if (d.lookup_code)
      list.push([
        t("facts.lookup"),
        <span key="l" className="mono">
          {d.lookup_code}
        </span>,
      ]);
    if (d.related_document_id) {
      const r = related(d);
      list.push([
        t(`facts.${d.correction ?? "adjustment"}Of`),
        r ? `${numberText(r.number)} · ${r.symbol}` : "—",
      ]);
    }
    if (d.retention_until) list.push([t("facts.retention"), formatDay(d.retention_until, locale)]);
    return list;
  };
  const kpis = [
    {
      label: t("kpis.issued", { symbol: stats.vat?.symbol ?? "" }),
      value: formatCount(stats.vat?.last_number ?? 0, locale),
      sub: t("kpis.last", { number: numberText(stats.vat?.last_number ?? 0) }),
    },
    { label: t("kpis.rejected"), value: String(stats.rejected), sub: t("kpis.rejectedSub") },
    { label: t("kpis.submitting"), value: String(stats.submitting), sub: t("kpis.submittingSub") },
    {
      label: t("kpis.register", { symbol: stats.register?.symbol ?? "" }),
      value: formatCount(stats.register?.last_number ?? 0, locale),
      sub: t("kpis.registerSub"),
    },
  ];
  return (
    <div className="blocks">
      <section className="block" aria-label={t("kpis.label")}>
        <div className="kpis">
          {kpis.map((k) => (
            <div key={k.label} className="card kpi">
              <span className="kpi-label">{k.label}</span>
              <b className="kpi-value">{k.value}</b>
              <span className="kpi-sub">{k.sub}</span>
            </div>
          ))}
        </div>
      </section>
      {stats.rejected > 0 ? (
        <p className="note warn" role="note">
          <b>{t("rejectedStrong", { count: stats.rejected })}</b> {t("rejectedText")}
        </p>
      ) : null}
      {connection?.last_check && !connection.last_check.ok ? (
        <p className="note warn" role="note">
          <b>{t("connectionStrong")}</b> {connection.last_check.error ?? ""}{" "}
          <Link className="open" href="/settings/connections">
            {t("connectionLink")}
          </Link>
        </p>
      ) : null}

      <section className="block" aria-labelledby="fin-inv-h">
        <div className="block-head">
          <h2 id="fin-inv-h" className="h2">
            {t("title")}
          </h2>
          <SampleBadge step="36" endpoint={ENDPOINTS.einvoices} />
        </div>
        <p className="fhint">{t("about")}</p>
        <Chips
          label={t("filter")}
          chips={[
            { href: href({ f: null }), label: t("all"), on: !filter, count: all.length },
            ...CHIPS.map((c) => ({
              href: href({ f: c }),
              label: t(`chips.${c}`),
              on: filter === c,
            })),
          ]}
        />
        <div className="card tcard">
          {docs.length === 0 ? (
            <p className="empty">{t("empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("number")}</Th>
                  <Th>{t("buyer")}</Th>
                  <Th>{t("order")}</Th>
                  <Th className="text-right">{t("total")}</Th>
                  <Th>{t("date")}</Th>
                  <Th>{t("state")}</Th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => {
                  const isOpen = open === d.id;
                  return [
                    <tr key={d.id} data-current={isOpen ? "" : undefined}>
                      <Td className="rt-title">
                        <span className="cell2">
                          <Link
                            className={d.number === null ? "open" : "open mono"}
                            href={isOpen ? href({}) : `${href({ open: d.id })}#fin-inv-h`}
                            scroll={false}
                            aria-expanded={isOpen}
                          >
                            {label(d)}
                          </Link>
                          <span className="sub">
                            <span className="mono">{d.symbol}</span> · {t(`kindsShort.${d.kind}`)}
                            {d.correction ? ` · ${t(`corrections.${d.correction}`)}` : ""}
                          </span>
                        </span>
                      </Td>
                      <Td label={t("buyer")}>
                        <span className="cell2">
                          <span className="ell">{d.buyer.name}</span>
                          <span className="sub">
                            {d.buyer.kind === "business" ? t("business") : t("consumer")}
                          </span>
                        </span>
                      </Td>
                      <Td label={t("order")} className="mono">
                        {d.source_id}
                      </Td>
                      <Td label={t("total")} className="text-right mono">
                        {money(d.total)}
                      </Td>
                      <Td label={t("date")}>
                        {d.issue_date ? formatDay(d.issue_date, locale) : "—"}
                      </Td>
                      <Td label={t("state")}>
                        <StatusBadge className={DOCUMENT_BADGE[d.status]}>
                          {t(`status.${d.status}`)}
                        </StatusBadge>
                      </Td>
                    </tr>,
                    isOpen ? (
                      <tr key={`${d.id}-open`} className="cat-detail-row">
                        <td colSpan={6}>
                          <div className="cat-detail">
                            <h3 className="h2">
                              {d.number === null
                                ? t("draftTitle", { symbol: d.symbol })
                                : t("detailTitle", {
                                    number: numberText(d.number),
                                    symbol: d.symbol,
                                  })}
                            </h3>
                            <Facts items={facts(d)} />
                            {d.provider_error ? (
                              <p className="note warn" role="note">
                                <b>{t("providerError")}</b> “{d.provider_error.message}” ·{" "}
                                <span className="mono">{d.provider_error.code}</span> ·{" "}
                                <Time value={d.provider_error.at} />
                              </p>
                            ) : null}
                            {d.lines.length > 0 ? (
                              <>
                                <h4 className="lab">{t("lines")}</h4>
                                <ul className="cat-lines">
                                  {d.lines.map((l) => (
                                    <li key={l.line_no}>
                                      <span>
                                        {l.description} × {l.quantity}
                                      </span>
                                      <b className="mono">{money(l.total)}</b>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            ) : null}
                            <ul className="cat-lines">
                              <li>
                                <span>{t("subtotal")}</span>
                                <b className="mono">{money(d.subtotal)}</b>
                              </li>
                              <li>
                                <span>{t("tax")}</span>
                                <b className="mono">{money(d.tax)}</b>
                              </li>
                              <li>
                                <span>{t("grand")}</span>
                                <b className="mono">{money(d.total)}</b>
                              </li>
                            </ul>
                            {d.history.length > 0 ? (
                              <>
                                <h4 className="lab">{t("history")}</h4>
                                <ol className="timeline">
                                  {[...d.history].reverse().map((h) => (
                                    <li key={`${h.at}-${h.event}`}>
                                      <span>
                                        {t(`events.${h.event}`)}
                                        {h.note ? ` · ${h.note}` : ""}
                                      </span>
                                      <span className="sub">
                                        <Time value={h.at} />
                                      </span>
                                    </li>
                                  ))}
                                </ol>
                              </>
                            ) : null}
                            <p className="fhint">{t(`notes.${d.status}`)}</p>
                            <div className="eg-acts">
                              {d.status === "rejected" && issue ? (
                                <FormDialog
                                  action={resubmitDocumentAction}
                                  label={t("fix.button")}
                                  title={t("fix.title")}
                                  intro={t("fix.intro")}
                                  submit={t("fix.submit")}
                                  done={t("fix.done")}
                                  triggerClass="btn sm pri"
                                  fields={[
                                    { kind: "hidden", name: "id", value: d.id },
                                    {
                                      kind: "text",
                                      name: "buyer_tax_code",
                                      label: t("fix.taxCode"),
                                      mono: true,
                                      placeholder: t("fix.taxCodePlaceholder"),
                                      hint: t("fix.taxCodeHint"),
                                    },
                                    {
                                      kind: "text",
                                      name: "buyer_name",
                                      label: t("fix.name"),
                                      defaultValue: d.buyer.name,
                                    },
                                    {
                                      kind: "text",
                                      name: "buyer_address",
                                      label: t("fix.address"),
                                      placeholder: t("fix.addressPlaceholder"),
                                    },
                                  ]}
                                />
                              ) : null}
                              {d.status === "submitting" && issue ? (
                                <InlineAction
                                  action={refreshDocumentAction}
                                  id={d.id}
                                  label={t("refresh")}
                                  done={t("refreshed")}
                                />
                              ) : null}
                              {d.status === "accepted" && correct ? (
                                <FormDialog
                                  action={correctDocumentAction}
                                  label={t("correct.button")}
                                  title={t("correct.title", { number: numberText(d.number) })}
                                  intro={t("correct.intro")}
                                  points={[
                                    t("correct.adjustment"),
                                    t("correct.replacement"),
                                    t("correct.cancel"),
                                  ]}
                                  submit={t("correct.submit")}
                                  done={t("correct.done")}
                                  fields={[
                                    { kind: "hidden", name: "id", value: d.id },
                                    {
                                      kind: "select",
                                      name: "how",
                                      label: t("correct.how"),
                                      options: CORRECTION_KINDS.map((k) => ({
                                        value: k,
                                        label: t(`correct.kinds.${k}`),
                                      })),
                                    },
                                    {
                                      kind: "textarea",
                                      name: "reason",
                                      label: t("correct.reason"),
                                      hint: t("correct.reasonHint"),
                                    },
                                  ]}
                                />
                              ) : null}
                              {d.status === "draft" && issue ? (
                                <>
                                  <ConfirmAction
                                    action={issueDocumentAction}
                                    id={d.id}
                                    label={t("issue.button")}
                                    title={t("issue.title", { symbol: d.symbol })}
                                    points={[t("issue.number"), t("issue.keep"), t("issue.send")]}
                                    submit={t("issue.submit")}
                                    done={t("issue.done")}
                                    danger={false}
                                  />
                                  <ConfirmAction
                                    action={deleteDraftAction}
                                    id={d.id}
                                    label={t("delete.button")}
                                    title={t("delete.title")}
                                    points={[t("delete.point")]}
                                    submit={t("delete.submit")}
                                    done={t("delete.done")}
                                  />
                                </>
                              ) : null}
                            </div>
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
        <TaxBasis rule={taxRuleOn(rules, "einvoice.issue_on_delivery")} lead={t("basisIssue")} />
        <TaxBasis rule={taxRuleOn(rules, "einvoice.correction")} lead={t("basisCorrection")} />
      </section>
    </div>
  );
}
