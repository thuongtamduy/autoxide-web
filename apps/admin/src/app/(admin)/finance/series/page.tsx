import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Facts } from "@/components/engage/common";
import { MANDATE_BADGE, SERIES_BADGE, StatusBadge } from "@/components/finance/badges";
import { TaxBasis } from "@/components/finance/basis";
import { SampleBadge } from "@/components/sample-badge";
import { ConfirmAction } from "@/components/ui/confirm";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDay } from "@/lib/catalog";
import { INVOICES_MANDATES_MANAGE, INVOICES_READ, INVOICES_SERIES_MANAGE } from "@/lib/finance";
import { can } from "@/lib/viewer";
import {
  DOCUMENT_KINDS,
  listMandates,
  listSeries,
  mandateState,
  numberText,
} from "@/sample/finance-invoices";
import { listUnits } from "@/sample/org";
import { listTaxRules, taxRuleOn, vietnamDay } from "@/sample/tax";
import {
  createMandateAction,
  createSeriesAction,
  deactivateSeriesAction,
  revokeMandateAction,
} from "../actions";
import { tabGate } from "../gate";
import { ENDPOINTS } from "../shared";

// Tab "Ký hiệu và uỷ nhiệm": mỗi ký hiệu một dãy số riêng theo năm (sang năm dùng ký hiệu mới); người
// bán trên sàn uỷ nhiệm cho sàn lập hoá đơn thay — không có uỷ nhiệm còn hiệu lực thì không lập được.
export default async function SeriesPage(props: PageProps<"/finance/series">) {
  const gate = await tabGate(INVOICES_READ);
  if (gate) return gate;
  const [t, locale, params] = await Promise.all([
    getTranslations("finance.series"),
    getLocale(),
    props.searchParams,
  ]);
  const open = typeof params.open === "string" ? params.open : "";
  const [
    { data: series },
    { data: mandates },
    { data: units },
    { data: rules },
    manageSeries,
    manageMandates,
  ] = await Promise.all([
    listSeries(),
    listMandates(),
    listUnits(),
    listTaxRules(),
    can(INVOICES_SERIES_MANAGE),
    can(INVOICES_MANDATES_MANAGE),
  ]);
  const kinds = await getTranslations("finance.einvoices.kinds");
  const today = vietnamDay();
  const issuers = units.filter(
    (u) =>
      u.status === "active" &&
      (u.unit_type === "tenant" || u.unit_type === "marketplace" || u.unit_type === "seller"),
  );
  const sellers = units.filter((u) => u.unit_type === "seller" && u.status === "active");
  const nextYear = String(Number(today.slice(0, 4)) + 1);
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="fin-series-h">
        <div className="block-head">
          <h2 id="fin-series-h" className="h2">
            {t("title")}
          </h2>
          <SampleBadge step="36" endpoint={ENDPOINTS.series} />
          {manageSeries ? (
            <FormDialog
              action={createSeriesAction}
              label={t("add.button")}
              title={t("add.title")}
              intro={t("add.intro")}
              submit={t("add.submit")}
              done={t("add.done")}
              triggerClass="btn sm"
              fields={[
                {
                  kind: "select",
                  name: "org_id",
                  label: t("add.unit"),
                  options: issuers.map((u) => ({ value: u.id, label: u.name })),
                },
                {
                  kind: "select",
                  name: "kind",
                  label: t("add.kind"),
                  options: DOCUMENT_KINDS.map((k) => ({ value: k, label: kinds(k) })),
                },
                {
                  kind: "text",
                  name: "symbol",
                  label: t("add.symbol"),
                  mono: true,
                  placeholder: `1C${nextYear.slice(2)}TBM`,
                  hint: t("add.symbolHint"),
                },
                {
                  kind: "number",
                  name: "year",
                  label: t("add.year"),
                  defaultValue: nextYear,
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
                <Th>{t("symbol")}</Th>
                <Th>{t("kind")}</Th>
                <Th>{t("unit")}</Th>
                <Th className="text-right">{t("last")}</Th>
                <Th>{t("state")}</Th>
              </tr>
            </thead>
            <tbody>
              {series.map((s) => {
                const isOpen = open === s.id;
                return [
                  <tr key={s.id} data-current={isOpen ? "" : undefined}>
                    <Td className="rt-title">
                      <Link
                        className="open mono"
                        href={
                          isOpen ? "/finance/series" : `/finance/series?open=${s.id}#fin-series-h`
                        }
                        scroll={false}
                        aria-expanded={isOpen}
                      >
                        {s.symbol}
                      </Link>
                    </Td>
                    <Td label={t("kind")}>{kinds(s.kind)}</Td>
                    <Td label={t("unit")}>{s.org_name}</Td>
                    <Td label={t("last")} className="text-right mono">
                      {s.last_number === 0 ? "—" : numberText(s.last_number)}
                    </Td>
                    <Td label={t("state")}>
                      <StatusBadge className={SERIES_BADGE[s.status]}>
                        {t(`status.${s.status}`)}
                      </StatusBadge>
                    </Td>
                  </tr>,
                  isOpen ? (
                    <tr key={`${s.id}-open`} className="cat-detail-row">
                      <td colSpan={5}>
                        <div className="cat-detail">
                          <Facts
                            items={[
                              [t("facts.provider"), s.einvoice_provider ?? t("facts.internal")],
                              [t("facts.year"), String(s.year)],
                              [t("facts.next"), numberText(s.last_number + 1)],
                            ]}
                          />
                          <p className="fhint">{t("gapless")}</p>
                          {manageSeries && s.status === "active" ? (
                            <div className="eg-acts">
                              <ConfirmAction
                                action={deactivateSeriesAction}
                                id={s.id}
                                label={t("deactivate.button")}
                                title={t("deactivate.title", { symbol: s.symbol })}
                                points={[t("deactivate.new"), t("deactivate.keep")]}
                                submit={t("deactivate.submit")}
                                done={t("deactivate.done", { symbol: s.symbol })}
                              />
                            </div>
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
        <p className="fhint">{t("foot")}</p>
      </section>

      <section className="block" aria-labelledby="fin-mandates-h">
        <div className="block-head">
          <h2 id="fin-mandates-h" className="h2">
            {t("mandates.title")}
          </h2>
          {manageMandates ? (
            <FormDialog
              action={createMandateAction}
              label={t("mandates.add.button")}
              title={t("mandates.add.title")}
              intro={t("mandates.add.intro")}
              submit={t("mandates.add.submit")}
              done={t("mandates.add.done")}
              triggerClass="btn sm"
              fields={[
                {
                  kind: "select",
                  name: "principal_org_id",
                  label: t("mandates.add.seller"),
                  options: sellers.map((u) => ({ value: u.id, label: u.name })),
                },
                {
                  kind: "select",
                  name: "kind",
                  label: t("mandates.add.kind"),
                  options: (["vat_invoice", "sales_invoice"] as const).map((k) => ({
                    value: k,
                    label: kinds(k),
                  })),
                },
                {
                  kind: "date",
                  name: "valid_from",
                  label: t("mandates.add.from"),
                  defaultValue: today,
                },
                { kind: "date", name: "valid_to", label: t("mandates.add.to") },
                {
                  kind: "check",
                  name: "signed",
                  label: t("mandates.add.signed"),
                  hint: t("mandates.add.signedHint"),
                },
              ]}
            />
          ) : null}
        </div>
        <p className="fhint">{t("mandates.about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("mandates.principal")}</Th>
                <Th>{t("mandates.kind")}</Th>
                <Th>{t("mandates.valid")}</Th>
                <Th>{t("mandates.state")}</Th>
                {manageMandates ? (
                  <Th>
                    <span className="vh">{t("mandates.actions")}</span>
                  </Th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {mandates.map((m) => {
                const state = mandateState(m, today);
                return (
                  <tr key={m.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b>{m.principal_name}</b>
                        <span className="sub">
                          <span className="mono">{m.number}</span> ·{" "}
                          {t(`mandates.entities.${m.principal_entity}`)}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("mandates.kind")}>{m.kinds.map((k) => kinds(k)).join(", ")}</Td>
                    <Td label={t("mandates.valid")}>
                      {t("mandates.range", {
                        from: formatDay(m.valid_from, locale),
                        to: formatDay(m.valid_to, locale),
                      })}
                    </Td>
                    <Td label={t("mandates.state")}>
                      <StatusBadge className={MANDATE_BADGE[state]}>
                        {t(`mandates.status.${state}`)}
                      </StatusBadge>
                    </Td>
                    {manageMandates ? (
                      <Td className="rt-acts">
                        {state === "valid" || state === "scheduled" ? (
                          <ConfirmAction
                            action={revokeMandateAction}
                            id={m.id}
                            label={t("mandates.revoke.button")}
                            title={t("mandates.revoke.title", { seller: m.principal_name })}
                            points={[t("mandates.revoke.stop"), t("mandates.revoke.issued")]}
                            submit={t("mandates.revoke.submit")}
                            done={t("mandates.revoke.done", { seller: m.principal_name })}
                          />
                        ) : null}
                      </Td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
        <TaxBasis rule={taxRuleOn(rules, "einvoice.mandate")} lead={t("mandates.basis")} />
      </section>
    </div>
  );
}
