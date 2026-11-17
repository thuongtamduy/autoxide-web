import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Chips, Facts } from "@/components/engage/common";
import { ENTRY_BADGE, StatusBadge } from "@/components/finance/badges";
import { SampleBadge } from "@/components/sample-badge";
import { FormDialog } from "@/components/ui/form-dialog";
import { Pager } from "@/components/ui/pager";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatDay } from "@/lib/catalog";
import { formatMonth, LEDGER_READ, LEDGER_REVERSE } from "@/lib/finance";
import { formatMoney } from "@/lib/format";
import { readPage, readSort, slicePage, sortRows } from "@/lib/table";
import { can } from "@/lib/viewer";
import {
  type EntryFilter,
  entryState,
  getEntry,
  type LedgerEntry,
  listAccounts,
  listEntries,
  listPeriods,
  monthBalance,
  monthOf,
  trialBalance,
} from "@/sample/finance";
import { vietnamDay } from "@/sample/tax";
import { reverseEntryAction } from "./actions";
import { accountNamer, bookOf, ENDPOINTS, FINANCE_TABS } from "./shared";

const FILTERS: EntryFilter[] = ["manual", "reversed"];

/** Tiêu đề của bút toán: mã chứng từ nguồn và lúc ghi; bút toán tay là diễn giải người ghi gõ. */
function entryTitle(
  e: LedgerEntry,
  kind: (key: string, values?: Record<string, string>) => string,
  locale: string,
) {
  if (e.source_module === "ledger" && (e.source_kind === "manual" || e.source_kind === "reversal"))
    return e.description;
  if (e.source_kind === "gateway_fee")
    return kind("gateway_fee", { date: formatDay(e.source_id ?? "", locale) });
  return `${e.source_id ?? ""} · ${kind(e.source_kind)}`;
}

const total = (e: LedgerEntry) =>
  e.lines.filter((l) => l.side === "debit").reduce((n, l) => n + Number(l.amount.amount), 0);

// Tab "Sổ cái": bút toán kép chỉ thêm (không sửa, không xoá; sai thì ghi bút toán đảo), niêm phong
// vào chuỗi băm mười giây một lần, cân đối thử theo kỳ. Bút toán do module khác sinh (đơn hàng, sàn)
// sửa ở module nguồn; chỉ bút toán tay đảo được ở đây. Bộ bảng (W-058): sắp theo ngày / số tiền, phân
// trang có tổng (hàm mẫu trả đủ danh sách), "⋯" trên dòng (xem chi tiết, đảo bút toán tay). Sổ chỉ thêm
// nên không có thao tác hàng loạt.
export default async function LedgerPage(props: PageProps<"/finance">) {
  if (!(await can(LEDGER_READ))) {
    // Màn mở tab đầu tiên người xem được dùng.
    for (const [, href, permission] of FINANCE_TABS) {
      if (permission !== LEDGER_READ && (await can(permission))) redirect(href);
    }
  }
  const [t, locale, params] = await Promise.all([
    getTranslations("finance.ledger"),
    getLocale(),
    props.searchParams,
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const bookParam = one("book");
  const book = bookParam === "main" || bookParam === "market" ? bookParam : undefined;
  const filter = FILTERS.find((f) => f === one("f"));
  const open = one("open");
  const today = vietnamDay();
  const sort = readSort(params, ["date", "amount"], { field: "date", dir: "desc" });
  const paging = readPage(params);
  const tbBook = bookOf(one("tb"));
  const [
    listed,
    name,
    { data: main },
    { data: market },
    { data: periods },
    reverse,
    kinds,
    sources,
    channels,
    notes,
    tf,
  ] = await Promise.all([
    listEntries({ book, filter, limit: 100_000 }),
    accountNamer(),
    listAccounts("main"),
    listAccounts("market"),
    listPeriods(tbBook),
    can(LEDGER_REVERSE),
    getTranslations("finance.kinds"),
    getTranslations("finance.sources"),
    getTranslations("finance.channels"),
    getTranslations("finance.notes"),
    getTranslations("finance"),
  ]);
  const tt = await getTranslations("table");
  const accounts = [...main, ...market];
  // Bút toán gốc giữ thứ tự của sổ (ngày hiệu lực rồi lúc ghi) khi cùng giá trị sắp.
  const page = slicePage(
    sortRows(listed.data, (e) => (sort.field === "amount" ? total(e) : e.effective_date), sort.dir),
    paging.page,
    paging.per,
  );
  // Bút toán gốc / bút toán đảo của dòng đang mở (có thể nằm ở trang khác của danh sách).
  const opened = page.data.find((e) => e.id === open);
  const [original, reversal] = await Promise.all([
    opened?.reverses_entry_id ? getEntry(opened.reverses_entry_id) : null,
    opened?.reversed_by_entry_id ? getEntry(opened.reversed_by_entry_id) : null,
  ]);
  const month = periods.some((p) => monthOf(p.starts_on) === one("month"))
    ? one("month")
    : monthOf(today);
  const [{ data: tb }, kpiGateway, kpiCod, kpiPrepaid, kpiVat] = await Promise.all([
    trialBalance(tbBook, month),
    monthBalance("main", "clearing.gateway", monthOf(today)),
    monthBalance("main", "clearing.carrier_cod", monthOf(today)),
    monthBalance("main", "orders.buyer_prepayments", monthOf(today)),
    monthBalance("main", "tax.vat_output", monthOf(today)),
  ]);
  const money = (m: { amount: string; currency: string }) =>
    formatMoney(m.amount, m.currency, locale);
  const base = (over: Record<string, string | null>) => {
    const query = new URLSearchParams();
    const merged: Record<string, string | null> = {
      book: book ?? null,
      f: filter ?? null,
      tb: tbBook === "market" ? "market" : null,
      month: one("month") || null,
      sort: one("sort") ? sort.field : null,
      dir: one("sort") ? sort.dir : null,
      page: paging.page > 1 ? String(paging.page) : null,
      per: paging.per !== 25 ? String(paging.per) : null,
      ...over,
    };
    for (const [k, v] of Object.entries(merged)) if (v) query.set(k, v);
    const text = query.toString();
    return text ? `/finance?${text}` : "/finance";
  };
  const thisMonth = formatMonth(monthOf(today), locale);
  // Tham số giữ khi sắp / đổi trang (không gồm trang và dòng đang mở).
  const keep = {
    book: book ?? null,
    f: filter ?? null,
    tb: tbBook === "market" ? "market" : null,
    month: one("month") || null,
    ...(one("sort") ? { sort: sort.field, dir: sort.dir } : {}),
  };
  const canReverse = (e: LedgerEntry) =>
    reverse &&
    entryState(e) !== "reversed" &&
    e.source_module === "ledger" &&
    e.source_kind === "manual";
  const reverseDialog = (e: LedgerEntry) => (
    <FormDialog
      action={reverseEntryAction}
      label={t("reverse.button")}
      title={t("reverse.title", { reference: e.reference })}
      intro={t("reverse.intro")}
      points={[t("reverse.once"), t("reverse.period")]}
      submit={t("reverse.submit")}
      done={t("reverse.done")}
      danger
      triggerClass="btn sm danger"
      fields={[
        { kind: "hidden", name: "id", value: e.id },
        {
          kind: "textarea",
          name: "reason",
          label: t("reverse.reason"),
          hint: t("reverse.reasonHint"),
        },
        {
          kind: "date",
          name: "effective_date",
          label: t("reverse.date"),
          defaultValue: today,
        },
      ]}
    />
  );
  // "⋯" của một dòng: xem / đóng chi tiết, đảo bút toán tay.
  const menu = (e: LedgerEntry): RowMenuItem[] => [
    {
      label: open === e.id ? t("close") : t("details"),
      href: open === e.id ? base({}) : `${base({ open: e.id })}#fin-entries-h`,
    },
    ...(canReverse(e)
      ? [{ label: t("reverse.button"), danger: true, dialog: reverseDialog(e) }]
      : []),
  ];
  const kpis = [
    { label: t("kpis.gateway"), value: money(kpiGateway), sub: t("kpis.gatewaySub") },
    { label: t("kpis.cod"), value: money(kpiCod), sub: t("kpis.codSub"), href: "/sales/shipping" },
    { label: t("kpis.prepaid"), value: money(kpiPrepaid), sub: t("kpis.prepaidSub") },
    { label: t("kpis.vat", { month: thisMonth }), value: money(kpiVat), sub: t("kpis.vatSub") },
  ];
  return (
    <div className="blocks">
      <section className="block" aria-label={t("kpis.label")}>
        <div className="kpis">
          {kpis.map((k) => (
            <div key={k.label} className="card kpi">
              <span className="kpi-label">{k.label}</span>
              <b className="kpi-value">{k.value}</b>
              <span className="kpi-sub">
                {k.href ? (
                  <Link className="open" href={k.href}>
                    {k.sub}
                  </Link>
                ) : (
                  k.sub
                )}
              </span>
            </div>
          ))}
        </div>
        <p className="fhint">{t("kpis.about", { month: thisMonth })}</p>
      </section>

      <section className="block" aria-labelledby="fin-entries-h">
        <div className="block-head">
          <h2 id="fin-entries-h" className="h2">
            {t("title")}
          </h2>
          <SampleBadge step="36" endpoint={ENDPOINTS.ledger} />
        </div>
        <p className="fhint">{t("about")}</p>
        <Chips
          label={t("filter")}
          chips={[
            {
              href: base({ book: null, f: null, page: null }),
              label: t("all"),
              on: !book && !filter,
            },
            {
              href: base({ book: "main", f: null, page: null }),
              label: tf("books.main"),
              on: book === "main" && !filter,
            },
            {
              href: base({ book: "market", f: null, page: null }),
              label: tf("books.market"),
              on: book === "market" && !filter,
            },
            ...FILTERS.map((f) => ({
              href: base({ book: null, f, page: null }),
              label: t(`filters.${f}`),
              on: filter === f,
            })),
          ]}
        />
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">{t("empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("entry")}</Th>
                  <Th>{t("book")}</Th>
                  <SortTh field="date" sort={sort} base="/finance" keep={keep} first="desc">
                    {t("date")}
                  </SortTh>
                  <SortTh
                    field="amount"
                    sort={sort}
                    base="/finance"
                    keep={keep}
                    first="desc"
                    className="text-right"
                  >
                    {t("amount")}
                  </SortTh>
                  <Th>{t("state")}</Th>
                  <Th>
                    <span className="vh">{t("actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((e) => {
                  const isOpen = open === e.id;
                  const state = entryState(e);
                  const bookName =
                    e.book_id === main[0]?.book_id ? tf("books.main") : tf("books.market");
                  const noteKey =
                    e.source_kind === "reversal"
                      ? null
                      : `${e.source_module}_${e.source_kind}${e.book_id === main[0]?.book_id ? "" : "_market"}`;
                  return [
                    <tr key={e.id} data-current={isOpen ? "" : undefined}>
                      <Td className="rt-title">
                        <span className="cell2">
                          <Link
                            className="open"
                            href={isOpen ? base({}) : `${base({ open: e.id })}#fin-entries-h`}
                            scroll={false}
                            aria-expanded={isOpen}
                          >
                            {entryTitle(e, kinds, locale)}
                          </Link>
                          <span className="sub mono ell">{e.reference}</span>
                        </span>
                      </Td>
                      <Td label={t("book")}>{bookName}</Td>
                      <Td label={t("date")}>{formatDay(e.effective_date, locale)}</Td>
                      <Td label={t("amount")} className="text-right mono">
                        {formatMoney(total(e), "VND", locale)}
                      </Td>
                      <Td label={t("state")}>
                        <StatusBadge className={ENTRY_BADGE[state]}>
                          {t(`states.${state}`)}
                        </StatusBadge>
                      </Td>
                      <Td className="rt-acts">
                        <RowMenu
                          label={tt("moreFor", { name: entryTitle(e, kinds, locale) })}
                          items={menu(e)}
                        />
                      </Td>
                    </tr>,
                    isOpen ? (
                      <tr key={`${e.id}-open`} className="cat-detail-row">
                        <td colSpan={6}>
                          <div className="cat-detail">
                            <h3 className="h2">{entryTitle(e, kinds, locale)}</h3>
                            <Facts
                              items={[
                                [t("book"), bookName],
                                [
                                  t("source"),
                                  `${sources(e.source_module)} · ${channels(e.channel)}`,
                                ],
                                [t("date"), formatDay(e.effective_date, locale)],
                                [t("period"), formatMonth(monthOf(e.effective_date), locale)],
                                [t("posted"), <Time key="p" value={e.posted_at} />],
                                [
                                  t("actor"),
                                  e.actor.kind === "system" ? t("system") : e.actor.name,
                                ],
                                [
                                  t("seal"),
                                  e.seal ? (
                                    <span key="s" className="mono">
                                      #{e.seal.sequence} · {e.seal.chain_hash.slice(0, 16)}…
                                    </span>
                                  ) : (
                                    t("sealPending")
                                  ),
                                ],
                                ...(e.attachment
                                  ? ([[t("attachment"), e.attachment]] as [string, string][])
                                  : []),
                              ]}
                            />
                            <h4 className="lab">{t("lines")}</h4>
                            <ul className="cat-lines">
                              {e.lines.map((l) => (
                                <li key={l.line_no}>
                                  <span>
                                    {l.side === "debit" ? t("debit") : t("credit")} ·{" "}
                                    {name(accounts.find((a) => a.id === l.account_id))}
                                    {l.tax ? ` (${l.tax.rate_percent}%)` : ""}
                                  </span>
                                  <b className="mono">{money(l.amount)}</b>
                                </li>
                              ))}
                            </ul>
                            {e.reverses_entry_id ? (
                              <p className="fhint">
                                {t("reversesNote", {
                                  reference: original?.reference ?? "",
                                  reason: e.reason ?? "",
                                })}
                              </p>
                            ) : null}
                            {e.reversed_by_entry_id ? (
                              <p className="fhint">
                                {t("reversedNote", { reference: reversal?.reference ?? "" })}
                              </p>
                            ) : null}
                            {noteKey && notes.has(noteKey) ? (
                              <p className="fhint">{notes(noteKey)}</p>
                            ) : null}
                            {canReverse(e) ? (
                              <div className="eg-acts">{reverseDialog(e)}</div>
                            ) : null}
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
        <Pager total={page.total} page={page.page} per={paging.per} base="/finance" keep={keep} />
        <p className="fhint">{t("bookNote")}</p>
      </section>

      <section className="block" aria-labelledby="fin-tb-h">
        <div className="block-head">
          <h2 id="fin-tb-h" className="h2">
            {t("trial.title", { book: tf(`books.${tbBook}`) })}
          </h2>
        </div>
        <p className="fhint">
          {t("trial.range", {
            from: formatDay(tb.from, locale),
            to: formatDay(month === monthOf(today) ? today : tb.to, locale),
          })}{" "}
          {t("trial.about")}
        </p>
        <Chips
          label={t("trial.filter")}
          chips={[
            {
              href: `${base({ tb: null, month: null })}#fin-tb-h`,
              label: tf("books.main"),
              on: tbBook === "main",
            },
            {
              href: `${base({ tb: "market", month: null })}#fin-tb-h`,
              label: tf("books.market"),
              on: tbBook === "market",
            },
            ...periods.map((p) => ({
              href: `${base({ month: monthOf(p.starts_on) })}#fin-tb-h`,
              label: formatMonth(monthOf(p.starts_on), locale),
              on: month === monthOf(p.starts_on),
            })),
          ]}
        />
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("trial.account")}</Th>
                <Th className="text-right">{t("trial.debit")}</Th>
                <Th className="text-right">{t("trial.credit")}</Th>
              </tr>
            </thead>
            <tbody>
              {tb.rows.map((r) => (
                <tr key={r.account_id}>
                  <Td className="rt-title">
                    <span className="cell2">
                      <b>{name(accounts.find((a) => a.id === r.account_id))}</b>
                      <span className="sub mono">{r.purpose}</span>
                    </span>
                  </Td>
                  <Td label={t("trial.debit")} className="text-right mono">
                    {r.debit.amount === "0" ? "" : money(r.debit)}
                  </Td>
                  <Td label={t("trial.credit")} className="text-right mono">
                    {r.credit.amount === "0" ? "" : money(r.credit)}
                  </Td>
                </tr>
              ))}
              <tr className="fin-total">
                <Td className="rt-title">
                  <b>{t("trial.total")}</b>
                </Td>
                <Td label={t("trial.debit")} className="text-right mono">
                  <b>{money(tb.totals.debit)}</b>
                </Td>
                <Td label={t("trial.credit")} className="text-right mono">
                  <b>{money(tb.totals.credit)}</b>
                </Td>
              </tr>
            </tbody>
          </Table>
        </div>
        <p className={tb.totals.debit.amount === tb.totals.credit.amount ? "fhint" : "note warn"}>
          {tb.totals.debit.amount === tb.totals.credit.amount
            ? t("trial.balanced")
            : t("trial.unbalanced")}{" "}
          {t("trial.foot")}
        </p>
      </section>
    </div>
  );
}
