import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Chips } from "@/components/engage/common";
import { PERIOD_BADGE, StatusBadge } from "@/components/finance/badges";
import { TaxBasis } from "@/components/finance/basis";
import { TaxQuoteForm } from "@/components/finance/forms";
import { SampleBadge } from "@/components/sample-badge";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDay } from "@/lib/catalog";
import { formatMonth, formatPercent, TAX_PROFILES_MANAGE, TAX_READ } from "@/lib/finance";
import { formatCount, formatMoney } from "@/lib/format";
import { can } from "@/lib/viewer";
import { productStats } from "@/sample/catalog";
import { vatSummary } from "@/sample/finance";
import { listUnits } from "@/sample/org";
import {
  currentTaxPack,
  effectiveTaxProfile,
  expiringRates,
  listTaxCategories,
  listTaxProfiles,
  listTaxRates,
  listTaxRules,
  listWithholdingRates,
  rateOn,
  TAX_REGIMES,
  taxRuleOn,
  vietnamDay,
} from "@/sample/tax";
import { saveTaxProfileAction } from "../actions";
import { tabGate } from "../gate";
import { bookOf, ENDPOINTS } from "../shared";

const LINES = ["goods", "services", "production_transport"] as const;

// Tab "Thuế": thuế suất là dữ liệu có ngày hiệu lực trong gói "vn" (không viết cứng); hoá đơn và bút
// toán lưu thuế suất lúc tính nên đổi biểu thuế không làm sai chứng từ cũ. GTGT đầu ra / đầu vào theo
// kỳ đọc từ sổ cái; kê khai nộp cơ quan thuế không thuộc bước 36.
export default async function TaxPage(props: PageProps<"/finance/tax">) {
  const gate = await tabGate(TAX_READ);
  if (gate) return gate;
  const [t, locale, params] = await Promise.all([
    getTranslations("finance.tax"),
    getLocale(),
    props.searchParams,
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const book = bookOf(one("book"));
  const open = one("open");
  const today = vietnamDay();
  const [
    { data: categories },
    { data: rates },
    { data: withholding },
    { data: rules },
    { data: pack },
    { data: profiles },
    { data: units },
    { data: vat },
    { data: stats },
    manage,
    tf,
  ] = await Promise.all([
    listTaxCategories(),
    listTaxRates(),
    listWithholdingRates(),
    listTaxRules(),
    currentTaxPack(),
    listTaxProfiles(),
    listUnits(),
    vatSummary(book),
    productStats(),
    can(TAX_PROFILES_MANAGE),
    getTranslations("finance"),
  ]);
  const money = (m: { amount: string; currency: string }) =>
    formatMoney(m.amount, m.currency, locale);
  const categoryName = (code: string) => {
    const c = categories.find((x) => x.code === code);
    return c ? (locale === "vi" ? c.name_vi : c.name_en) : code;
  };
  const expiring = expiringRates(rates, today);
  const stateOf = (r: (typeof rates)[number]) => {
    if (r.effective_from > today) return "scheduled";
    if (r.effective_to !== null && r.effective_to <= today) return "past";
    return expiring.some((x) => x.rate.id === r.id) ? "expiring" : "current";
  };
  const shownRates = rates.filter((r) => stateOf(r) !== "past");
  const parents = new Map(units.map((u) => [u.id, u.parent_id]));
  const profileUnits = units.filter((u) => u.status !== "archived" && u.unit_type !== "region");
  const register = taxRuleOn(rules, "einvoice.cash_register_required", today);
  const vatHref = (over: { book?: string | null; open?: string | null }) => {
    const query = new URLSearchParams();
    const b = over.book === undefined ? (book === "market" ? "market" : null) : over.book;
    if (b) query.set("book", b);
    if (over.open) query.set("open", over.open);
    const text = query.toString();
    return text ? `/finance/tax?${text}` : "/finance/tax";
  };
  return (
    <div className="blocks">
      {expiring.map(({ rate, successor }) => (
        <p key={rate.id} className="note warn" role="note">
          <b>
            {t("expiring.strong", {
              rate: formatPercent(rate.rate_percent, locale),
              date: formatDay(rate.effective_to ?? "", locale),
            })}
          </b>{" "}
          {t("expiring.products", { count: stats.by_tax[rate.category_code] ?? 0 })}{" "}
          {successor
            ? t("expiring.successor", {
                pack: pack.version,
                rate: formatPercent(successor.rate_percent, locale),
                date: formatDay(successor.effective_from, locale),
              })
            : t("expiring.none")}{" "}
          {t("expiring.extend")}
        </p>
      ))}

      <section className="block" aria-labelledby="fin-vat-h">
        <div className="block-head">
          <h2 id="fin-vat-h" className="h2">
            {t("vat.title")}
          </h2>
          <SampleBadge step="36" endpoint={`${ENDPOINTS.tax}; GET /api/v1/tax/vat-summary`} />
        </div>
        <p className="fhint">{t("vat.about")}</p>
        <Chips
          label={t("vat.book")}
          chips={[
            { href: vatHref({ book: null }), label: tf("books.main"), on: book === "main" },
            { href: vatHref({ book: "market" }), label: tf("books.market"), on: book === "market" },
          ]}
        />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("vat.period")}</Th>
                <Th className="text-right">{t("vat.output")}</Th>
                <Th className="text-right">{t("vat.input")}</Th>
                <Th className="text-right">{t("vat.net")}</Th>
                <Th>{t("vat.state")}</Th>
              </tr>
            </thead>
            <tbody>
              {vat.map((p) => {
                const isOpen = open === p.period_id;
                const net = Number(p.net.amount);
                return [
                  <tr key={p.period_id} data-current={isOpen ? "" : undefined}>
                    <Td className="rt-title">
                      <Link
                        className="open"
                        href={isOpen ? vatHref({}) : `${vatHref({ open: p.period_id })}#fin-vat-h`}
                        scroll={false}
                        aria-expanded={isOpen}
                      >
                        {t("vat.month", { month: formatMonth(p.month, locale) })}
                      </Link>
                    </Td>
                    <Td label={t("vat.output")} className="text-right mono">
                      {money(p.output_total)}
                    </Td>
                    <Td label={t("vat.input")} className="text-right mono">
                      {money(p.input_total)}
                    </Td>
                    <Td label={t("vat.net")} className="text-right">
                      <span className="cell2">
                        <b className="mono">{formatMoney(Math.abs(net), "VND", locale)}</b>
                        <span className="sub">{net >= 0 ? t("vat.payable") : t("vat.carry")}</span>
                      </span>
                    </Td>
                    <Td label={t("vat.state")}>
                      <StatusBadge className={PERIOD_BADGE[p.status]}>
                        {p.status === "open" ? t("vat.provisional") : t("vat.closed")}
                      </StatusBadge>
                    </Td>
                  </tr>,
                  isOpen ? (
                    <tr key={`${p.period_id}-open`} className="cat-detail-row">
                      <td colSpan={5}>
                        <div className="cat-detail">
                          {(["output", "input"] as const).map((side) => (
                            <div key={side}>
                              <h4 className="lab">{t(`vat.${side}ByRate`)}</h4>
                              {p[side].length === 0 ? (
                                <p className="fhint">{t("vat.none")}</p>
                              ) : (
                                <ul className="cat-lines">
                                  {p[side].map((l) => (
                                    <li key={`${l.category}-${l.rate_percent}`}>
                                      <span>
                                        {categoryName(l.category)} ·{" "}
                                        {formatPercent(l.rate_percent, locale)} ·{" "}
                                        {t("vat.base", { amount: money(l.base) })}
                                      </span>
                                      <b className="mono">{money(l.tax)}</b>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                          <p className="fhint">{t("vat.snapshot")}</p>
                        </div>
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </Table>
        </div>
        <p className="fhint">{t("vat.foot")}</p>
      </section>

      <section className="block" aria-labelledby="fin-rates-h">
        <div className="block-head">
          <h2 id="fin-rates-h" className="h2">
            {t("rates.title", { pack: pack.version })}
          </h2>
        </div>
        <p className="fhint">{t("rates.about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("rates.category")}</Th>
                <Th className="text-right">{t("rates.rate")}</Th>
                <Th>{t("rates.valid")}</Th>
                <Th>{t("rates.state")}</Th>
              </tr>
            </thead>
            <tbody>
              {shownRates.map((r) => {
                const state = stateOf(r);
                return (
                  <tr key={r.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b>{categoryName(r.category_code)}</b>
                        <span className="sub mono">{r.category_code}</span>
                        <span className="sub">{r.legal_basis}</span>
                      </span>
                    </Td>
                    <Td label={t("rates.rate")} className="text-right">
                      {formatPercent(r.rate_percent, locale)}
                    </Td>
                    <Td label={t("rates.valid")}>
                      {r.effective_to
                        ? t("rates.range", {
                            from: formatDay(r.effective_from, locale),
                            to: formatDay(r.effective_to, locale),
                          })
                        : t("rates.since", { from: formatDay(r.effective_from, locale) })}
                    </Td>
                    <Td label={t("rates.state")}>
                      <StatusBadge
                        className={
                          state === "expiring"
                            ? "badge b-warn"
                            : state === "scheduled"
                              ? "badge b-sched"
                              : "badge b-ok"
                        }
                      >
                        {t(`rates.states.${state}`)}
                      </StatusBadge>
                    </Td>
                  </tr>
                );
              })}
              {categories
                .filter((c) => !rates.some((r) => r.category_code === c.code))
                .map((c) => (
                  <tr key={c.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b>{categoryName(c.code)}</b>
                        <span className="sub mono">{c.code}</span>
                      </span>
                    </Td>
                    <Td label={t("rates.rate")} className="text-right">
                      —
                    </Td>
                    <Td label={t("rates.valid")}>{t("rates.exempt")}</Td>
                    <Td label={t("rates.state")}>
                      <StatusBadge className="badge b-ok">{t("rates.states.current")}</StatusBadge>
                    </Td>
                  </tr>
                ))}
            </tbody>
          </Table>
        </div>
        <p className="fhint">{t("rates.foot")}</p>
      </section>

      <section className="block half" aria-labelledby="fin-wh-h">
        <h2 id="fin-wh-h" className="h2">
          {t("withholding.title")}
        </h2>
        <p className="fhint">{t("withholding.about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("withholding.line")}</Th>
                <Th className="text-right">{t("withholding.vat")}</Th>
                <Th className="text-right">{t("withholding.pit")}</Th>
              </tr>
            </thead>
            <tbody>
              {LINES.map((line) => {
                const of = (kind: "vat" | "pit") =>
                  withholding.find((w) => w.business_line === line && w.tax_kind === kind);
                return (
                  <tr key={line}>
                    <Td className="rt-title">{t(`withholding.lines.${line}`)}</Td>
                    <Td label={t("withholding.vat")} className="text-right">
                      {formatPercent(of("vat")?.rate_percent ?? "0", locale)}
                    </Td>
                    <Td label={t("withholding.pit")} className="text-right">
                      {formatPercent(of("pit")?.rate_percent ?? "0", locale)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
        <p className="fhint">{withholding[0]?.legal_basis}</p>
      </section>

      <section className="block half" aria-labelledby="fin-quote-h">
        <h2 id="fin-quote-h" className="h2">
          {t("quote.title")}
        </h2>
        <TaxQuoteForm
          categories={categories
            .filter((c) => rateOn(rates, c.code, today))
            .map((c) => ({ value: c.code, label: categoryName(c.code) }))}
          defaults={{ category: "vat.standard_reducible", gross: "690000", tax_point: today }}
        />
      </section>

      <section className="block" aria-labelledby="fin-profiles-h">
        <h2 id="fin-profiles-h" className="h2">
          {t("profiles.title")}
        </h2>
        <p className="fhint">{t("profiles.about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("profiles.unit")}</Th>
                <Th>{t("profiles.taxCode")}</Th>
                <Th>{t("profiles.regime")}</Th>
                <Th>{t("profiles.source")}</Th>
                {manage ? (
                  <Th>
                    <span className="vh">{t("profiles.actions")}</span>
                  </Th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {profileUnits.map((u) => {
                // Người bán trên sàn là pháp nhân riêng: không kế thừa hồ sơ thuế của sàn hay của khách.
                const found =
                  u.unit_type === "seller"
                    ? effectiveTaxProfile(profiles, new Map(), u.id)
                    : effectiveTaxProfile(profiles, parents, u.id);
                const sourceName = units.find((x) => x.id === found?.source_org_id)?.name ?? "";
                return (
                  <tr key={u.id}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <b>{u.name}</b>
                        <span className="sub">{tf(`unitTypes.${u.unit_type}`)}</span>
                      </span>
                    </Td>
                    <Td label={t("profiles.taxCode")} className="mono">
                      {found
                        ? found.inherited
                          ? t("profiles.fromParent", { unit: sourceName })
                          : found.profile.tax_code
                        : "—"}
                    </Td>
                    <Td label={t("profiles.regime")}>
                      {found
                        ? t(`profiles.regimes.${found.profile.regime}`)
                        : t("profiles.missing")}
                    </Td>
                    <Td label={t("profiles.source")}>
                      <StatusBadge
                        className={
                          found?.inherited
                            ? "badge b-draft"
                            : found
                              ? "badge b-info"
                              : "badge b-bad"
                        }
                      >
                        {found
                          ? found.inherited
                            ? t("profiles.inherited")
                            : t("profiles.own")
                          : t("profiles.none")}
                      </StatusBadge>
                    </Td>
                    {manage ? (
                      <Td className="rt-acts">
                        <FormDialog
                          action={saveTaxProfileAction}
                          label={
                            found && !found.inherited ? t("profiles.edit") : t("profiles.create")
                          }
                          title={t("profiles.title2", { unit: u.name })}
                          intro={
                            found?.inherited
                              ? t("profiles.createIntro", { unit: sourceName })
                              : t("profiles.editIntro")
                          }
                          submit={t("profiles.save")}
                          done={t("profiles.saved")}
                          fields={[
                            { kind: "hidden", name: "org_id", value: u.id },
                            {
                              kind: "text",
                              name: "tax_code",
                              label: t("profiles.taxCode"),
                              mono: true,
                              defaultValue: found && !found.inherited ? found.profile.tax_code : "",
                              hint: t("profiles.taxCodeHint"),
                            },
                            {
                              kind: "text",
                              name: "legal_name",
                              label: t("profiles.legalName"),
                              defaultValue:
                                found && !found.inherited ? found.profile.legal_name : "",
                            },
                            {
                              kind: "select",
                              name: "regime",
                              label: t("profiles.regime"),
                              defaultValue: found?.profile.regime ?? "vat_credit",
                              options: TAX_REGIMES.map((r) => ({
                                value: r,
                                label: t(`profiles.regimes.${r}`),
                              })),
                            },
                          ]}
                        />
                      </Td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
        <p className="fhint">{t("profiles.foot")}</p>
      </section>

      <section className="block" aria-label={t("tiles.label")}>
        <div className="fin-tiles">
          <div className="card fin-tile">
            <div className="fin-tile-head">
              <b>{t("tiles.pack")}</b>
              <span className="badge b-ok">{t("tiles.latest")}</span>
            </div>
            <span className="fin-tile-big">{t("tiles.version", { version: pack.version })}</span>
            <span className="fhint">
              {t("tiles.packText", {
                imported: formatDay(pack.imported_at.slice(0, 10), locale),
                checked: formatDay(pack.checked_on, locale),
                rates: pack.counts.rates,
                withholding: pack.counts.withholding,
                rules: pack.counts.rules,
              })}
            </span>
            <span className="fhint">{pack.source_note}</span>
            <span className="fhint">{t("tiles.packWho")}</span>
          </div>
          <div className="card fin-tile">
            <div className="fin-tile-head">
              <b>{t("tiles.register")}</b>
            </div>
            <span className="fin-tile-big">
              {register?.value.threshold
                ? t("tiles.perYear", {
                    amount: formatMoney(
                      register.value.threshold.amount,
                      register.value.threshold.currency,
                      locale,
                    ),
                  })
                : "—"}
            </span>
            <span className="fhint">
              {t("tiles.registerText", {
                from: formatDay(register?.effective_from ?? today, locale),
              })}
            </span>
            <span className="fhint">{register?.legal_basis}</span>
          </div>
          <div className="card fin-tile">
            <div className="fin-tile-head">
              <b>{t("tiles.products")}</b>
            </div>
            <span className="fin-tile-big">
              {formatCount(stats.by_tax["vat.standard_reducible"] ?? 0, locale)}
            </span>
            <span className="fhint">{t("tiles.productsText")}</span>
            <Link className="open" href="/catalog/tax">
              {t("tiles.productsLink")}
            </Link>
          </div>
        </div>
        <TaxBasis
          rule={taxRuleOn(rules, "accounting.chart_mapping", today)}
          lead={t("tiles.mapping")}
        />
      </section>
    </div>
  );
}
