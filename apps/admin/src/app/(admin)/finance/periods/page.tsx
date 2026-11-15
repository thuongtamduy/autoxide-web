import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Chips, Facts } from "@/components/engage/common";
import { PERIOD_BADGE, StatusBadge } from "@/components/finance/badges";
import { TaxBasis } from "@/components/finance/basis";
import { SampleBadge } from "@/components/sample-badge";
import { FormDialog } from "@/components/ui/form-dialog";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatDay } from "@/lib/catalog";
import { formatMonth, LEDGER_PERIODS_CLOSE, LEDGER_READ } from "@/lib/finance";
import { formatCount } from "@/lib/format";
import { can } from "@/lib/viewer";
import { checkPeriod, listPeriods, monthOf, verifyChain } from "@/sample/finance";
import { listTaxRules, taxRuleOn } from "@/sample/tax";
import { closePeriodAction } from "../actions";
import { tabGate } from "../gate";
import { bookOf, ENDPOINTS } from "../shared";

// Tab "Kỳ kế toán": khoá sổ theo thứ tự tháng; khoá rồi không mở lại, bút toán mới có ngày trong kỳ
// đã khoá bị từ chối, sai sót sửa bằng bút toán đảo ở kỳ đang mở. Kèm kiểm toàn vẹn chuỗi băm.
export default async function PeriodsPage(props: PageProps<"/finance/periods">) {
  const gate = await tabGate(LEDGER_READ);
  if (gate) return gate;
  const [t, locale, params] = await Promise.all([
    getTranslations("finance.periods"),
    getLocale(),
    props.searchParams,
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const book = bookOf(one("book"));
  const open = one("open");
  const [{ data: periods }, { data: chain }, { data: rules }, close, tf] = await Promise.all([
    listPeriods(book),
    verifyChain(book),
    listTaxRules(),
    can(LEDGER_PERIODS_CLOSE),
    getTranslations("finance"),
  ]);
  const opened = periods.find((p) => p.id === open);
  const check = opened && opened.status === "open" ? await checkPeriod(opened.id) : null;
  const href = (over: { book?: string | null; open?: string | null }) => {
    const query = new URLSearchParams();
    const b = over.book === undefined ? (book === "market" ? "market" : null) : over.book;
    if (b) query.set("book", b);
    if (over.open) query.set("open", over.open);
    const text = query.toString();
    return text ? `/finance/periods?${text}` : "/finance/periods";
  };
  const retention = taxRuleOn(rules, "accounting.retention");
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="fin-periods-h">
        <div className="block-head">
          <h2 id="fin-periods-h" className="h2">
            {t("title", { book: tf(`books.${book}`) })}
          </h2>
          <SampleBadge step="36" endpoint={ENDPOINTS.periods} />
        </div>
        <p className="fhint">{t("about")}</p>
        <Chips
          label={t("book")}
          chips={[
            { href: href({ book: null }), label: tf("books.main"), on: book === "main" },
            { href: href({ book: "market" }), label: tf("books.market"), on: book === "market" },
          ]}
        />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("period")}</Th>
                <Th className="text-right">{t("entries")}</Th>
                <Th>{t("sealed")}</Th>
                <Th>{t("closedBy")}</Th>
                <Th>{t("state")}</Th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p, index) => {
                const isOpen = open === p.id;
                const month = monthOf(p.starts_on);
                const label = formatMonth(month, locale);
                const confirmText = `${month.slice(5, 7)}/${month.slice(0, 4)}`;
                return [
                  <tr key={p.id} data-current={isOpen ? "" : undefined}>
                    <Td className="rt-title">
                      <span className="cell2">
                        <Link
                          className="open"
                          href={isOpen ? href({}) : `${href({ open: p.id })}#fin-periods-h`}
                          scroll={false}
                          aria-expanded={isOpen}
                        >
                          {t("month", { month: label })}
                        </Link>
                        <span className="sub">
                          {index === 0 && p.status === "open"
                            ? t("current")
                            : p.status === "open"
                              ? t("notClosed")
                              : ""}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("entries")} className="text-right mono">
                      {formatCount(p.entry_count, locale)}
                    </Td>
                    <Td label={t("sealed")}>
                      {p.sealed_count === p.entry_count
                        ? t("allSealed")
                        : t("someSealed", {
                            sealed: formatCount(p.sealed_count, locale),
                            total: formatCount(p.entry_count, locale),
                          })}
                    </Td>
                    <Td label={t("closedBy")}>
                      {p.closed_by && p.closed_at ? (
                        <span className="cell2">
                          {p.closed_by}
                          <span className="sub">
                            <Time value={p.closed_at} />
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td label={t("state")}>
                      <StatusBadge className={PERIOD_BADGE[p.status]}>
                        {t(`status.${p.status}`)}
                      </StatusBadge>
                    </Td>
                  </tr>,
                  isOpen ? (
                    <tr key={`${p.id}-open`} className="cat-detail-row">
                      <td colSpan={5}>
                        <div className="cat-detail">
                          <Facts
                            items={[
                              [
                                t("range"),
                                `${formatDay(p.starts_on, locale)} – ${formatDay(p.ends_on, locale)}`,
                              ],
                              [t("entries"), formatCount(p.entry_count, locale)],
                            ]}
                          />
                          {check ? (
                            <>
                              <h4 className="lab">{t("check.title")}</h4>
                              <ul className="fin-checks">
                                <li data-ok={check.previous_closed}>
                                  {check.previous_closed ? "✓" : "✗"}{" "}
                                  {check.previous_closed
                                    ? t("check.previousOk")
                                    : t("check.previous", {
                                        month: formatMonth(check.previous_month ?? "", locale),
                                      })}
                                </li>
                                <li data-ok={check.ended}>
                                  {check.ended ? "✓" : "✗"}{" "}
                                  {check.ended ? t("check.endedOk") : t("check.ended")}
                                </li>
                                <li data-ok={check.unsealed === 0}>
                                  {check.unsealed === 0 ? "✓" : "…"}{" "}
                                  {check.unsealed === 0
                                    ? t("check.sealedOk")
                                    : t("check.sealed", { count: check.unsealed })}
                                </li>
                                <li data-ok={check.balanced}>
                                  {check.balanced ? "✓" : "✗"}{" "}
                                  {check.balanced ? t("check.balancedOk") : t("check.balanced")}
                                </li>
                                <li data-ok={check.open_exceptions === 0}>
                                  {check.open_exceptions === 0 ? "✓" : "!"}{" "}
                                  {check.open_exceptions === 0
                                    ? t("check.exceptionsOk")
                                    : t("check.exceptions", { count: check.open_exceptions })}
                                </li>
                              </ul>
                              <p className="fhint">{t("check.note")}</p>
                              {close ? (
                                <div className="eg-acts">
                                  <FormDialog
                                    action={closePeriodAction}
                                    label={t("close.button", { month: label })}
                                    title={t("close.title", { month: label })}
                                    intro={t("close.intro")}
                                    points={[
                                      t("close.noReopen"),
                                      t("close.rejected", { month: label }),
                                      t("close.reverse"),
                                      t("close.snapshot"),
                                    ]}
                                    submit={t("close.submit")}
                                    done={t("close.done", { month: label })}
                                    danger
                                    triggerClass="btn sm danger"
                                    fields={[
                                      { kind: "hidden", name: "id", value: p.id },
                                      { kind: "hidden", name: "book", value: book },
                                      {
                                        kind: "text",
                                        name: "confirm",
                                        label: t("close.confirm", { text: confirmText }),
                                        mono: true,
                                        placeholder: confirmText,
                                      },
                                    ]}
                                  />
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <p className="fhint">{t("closedNote")}</p>
                          )}
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

      <section className="block" aria-labelledby="fin-chain-h">
        <h2 id="fin-chain-h" className="h2">
          {t("integrity.title")}
        </h2>
        <div className="fin-tiles">
          <div className="card fin-tile">
            <div className="fin-tile-head">
              <b>{t("integrity.chain")}</b>
              <span className={chain.first_broken ? "badge b-bad" : "badge b-ok"}>
                {chain.first_broken ? t("integrity.broken") : t("integrity.intact")}
              </span>
            </div>
            <span className="fhint">
              {chain.first_broken
                ? t("integrity.brokenText")
                : t("integrity.chainText", {
                    count: chain.checked,
                    minutes: chain.oldest_pending_minutes,
                  })}{" "}
              <Time value={chain.checked_at} />
            </span>
          </div>
          <div className="card fin-tile">
            <div className="fin-tile-head">
              <b>{t("integrity.balances")}</b>
              <span className="badge b-ok">{t("integrity.match")}</span>
            </div>
            <span className="fhint">{t("integrity.balancesText")}</span>
          </div>
          <div className="card fin-tile">
            <div className="fin-tile-head">
              <b>{t("integrity.retention")}</b>
            </div>
            <span className="fhint">
              {t("integrity.retentionText", { years: retention?.value.years ?? 10 })}
            </span>
          </div>
        </div>
        <TaxBasis rule={retention} />
      </section>
    </div>
  );
}
