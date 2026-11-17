import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Chips, Facts } from "@/components/engage/common";
import { EXCEPTION_BADGE, StatusBadge } from "@/components/finance/badges";
import { SampleBadge } from "@/components/sample-badge";
import { type BulkActionSpec, BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { InlineAction } from "@/components/ui/confirm";
import { FormDialog } from "@/components/ui/form-dialog";
import { Pager } from "@/components/ui/pager";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { formatDay } from "@/lib/catalog";
import { LEDGER_READ, LEDGER_RECONCILE } from "@/lib/finance";
import { formatMoney } from "@/lib/format";
import { readPage, readSort, slicePage, sortRows } from "@/lib/table";
import { can } from "@/lib/viewer";
import {
  type ExceptionFilter,
  type LedgerException,
  lastFour,
  listBankAccounts,
  listExceptions,
  listReconciliations,
  paymentsWithAmount,
  RESOLVE_ACTIONS,
} from "@/sample/finance";
import { vietnamDay } from "@/sample/tax";
import { bulkIgnoreExceptionsAction, reconcileAction, resolveExceptionAction } from "../actions";
import { tabGate } from "../gate";
import { ENDPOINTS } from "../shared";

const CHIPS: ExceptionFilter[] = [
  "open",
  "amount_mismatch",
  "unmatched_credit",
  "late_payment",
  "resolved",
];

/** Ngày hôm qua theo giờ Việt Nam (ngày sao kê mặc định của "Đối soát ngay"). */
function yesterday(): string {
  return vietnamDay(Date.now() - 86_400_000);
}

// Tab "Hàng chờ sai lệch": tiền vào không khớp thanh toán nào thì hệ thống không tự đoán mà đưa vào
// đây; người có `ledger.reconcile` chọn cách xử lý và ghi lý do. Đối soát COD với hãng vận chuyển nằm
// ở màn Vận chuyển (phân hệ Bán hàng), ở đây chỉ dẫn sang. Bộ bảng (W-058): chọn nhiều mục đang mở để
// bỏ qua với một lý do (lặp lệnh từng cái của hàm mẫu), "⋯" trên dòng (chi tiết, xử lý), sắp theo lúc
// phát hiện / số tiền, phân trang có tổng (hàm mẫu trả đủ danh sách).
const BASE = "/finance/exceptions";

export default async function ExceptionsPage(props: PageProps<"/finance/exceptions">) {
  const gate = await tabGate(LEDGER_READ);
  if (gate) return gate;
  const [t, tt, locale, params] = await Promise.all([
    getTranslations("finance.exceptions"),
    getTranslations("table"),
    getLocale(),
    props.searchParams,
  ]);
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const filter = CHIPS.find((c) => c === one("f"));
  const open = one("open");
  const [{ data: listed }, { data: all }, { data: banks }, { data: runs }, reconcile] =
    await Promise.all([
      listExceptions(filter),
      listExceptions(),
      listBankAccounts(),
      listReconciliations(),
      can(LEDGER_RECONCILE),
    ]);
  const money = (m: { amount: string; currency: string }) =>
    formatMoney(m.amount, m.currency, locale);
  const sort = readSort(params, ["found", "amount"], { field: "found", dir: "desc" });
  const paging = readPage(params);
  // Không chọn cách sắp: giữ thứ tự của hàng chờ (mục đang mở trước).
  const page = slicePage(
    one("sort")
      ? sortRows(
          listed,
          (x) => (sort.field === "amount" ? Number(x.details.received.amount) : x.created_at),
          sort.dir,
        )
      : listed,
    paging.page,
    paging.per,
  );
  const rows = page.data;
  const keep = {
    f: filter ?? null,
    ...(one("sort") ? { sort: sort.field, dir: sort.dir } : {}),
  };
  const bankLabel = (id: string | null) => {
    const b = banks.find((x) => x.id === id);
    return b ? `${b.org_name} · •••• ${lastFour(b.account_number)}` : "—";
  };
  const href = (over: { f?: string | null; open?: string | null }) => {
    const query = new URLSearchParams();
    const f = over.f === undefined ? (filter ?? null) : over.f;
    if (f) query.set("f", f);
    if (over.f === undefined) {
      if (one("sort")) query.set("sort", sort.field);
      if (one("sort")) query.set("dir", sort.dir);
      if (paging.page > 1) query.set("page", String(paging.page));
      if (paging.per !== 25) query.set("per", String(paging.per));
    }
    if (over.open) query.set("open", over.open);
    const text = query.toString();
    return text ? `/finance/exceptions?${text}` : "/finance/exceptions";
  };
  const count = (f: ExceptionFilter) =>
    all.filter((x) =>
      f === "open" ? x.status === "open" : f === "resolved" ? x.status !== "open" : x.kind === f,
    ).length;
  const opened = rows.find((x) => x.id === open);
  const candidates =
    opened && opened.kind === "unmatched_credit"
      ? await paymentsWithAmount(
          opened.details.received,
          banks.find((b) => b.id === opened.details.bank_account_id)?.org_id ?? "",
        )
      : [];
  const facts = (x: LedgerException): [string, ReactNode][] => {
    const d = x.details;
    const list: [string, ReactNode][] = [];
    if (d.bank_account_id) list.push([t("facts.account"), bankLabel(d.bank_account_id)]);
    if (d.provider) list.push([t("facts.provider"), d.provider]);
    if (d.memo)
      list.push([
        t("facts.memo"),
        <span key="m" className="mono">
          {d.memo}
        </span>,
      ]);
    if (d.expected) list.push([t("facts.expected"), money(d.expected)]);
    list.push([t("facts.received"), money(d.received)]);
    if (d.expected && d.expected.amount !== d.received.amount) {
      list.push([
        t("facts.short"),
        formatMoney(Number(d.expected.amount) - Number(d.received.amount), "VND", locale),
      ]);
    }
    list.push([t("facts.booked"), <Time key="b" value={d.booked_at} />]);
    if (d.order_cancelled_at)
      list.push([t("facts.cancelled"), <Time key="c" value={d.order_cancelled_at} />]);
    if (d.payment_succeeded_at)
      list.push([t("facts.succeeded"), <Time key="s" value={d.payment_succeeded_at} />]);
    if (d.statement_date) list.push([t("facts.statement"), formatDay(d.statement_date, locale)]);
    return list;
  };
  const resolveDialog = (x: LedgerException) => (
    <FormDialog
      action={resolveExceptionAction}
      label={t("resolve.button")}
      title={t("resolve.title")}
      intro={t("resolve.intro")}
      submit={t("resolve.submit")}
      done={t("resolve.done")}
      triggerClass="btn sm pri"
      fields={[
        { kind: "hidden", name: "id", value: x.id },
        {
          kind: "select",
          name: "action",
          label: t("resolve.action"),
          defaultValue: x.kind === "late_payment" ? "refunded_outside" : "match",
          options: RESOLVE_ACTIONS.map((a) => ({
            value: a,
            label: t(`actions.${a}`),
          })),
        },
        {
          kind: "text",
          name: "payment_code",
          label: t("resolve.code"),
          hint: t("resolve.codeHint"),
          mono: true,
          defaultValue: x.details.payment_code ?? "",
        },
        {
          kind: "textarea",
          name: "note",
          label: t("resolve.note"),
          hint: t("resolve.noteHint"),
        },
      ]}
    />
  );
  // Chỉ mục còn mở mới xử lý được (cả hàng loạt lẫn trên dòng).
  const selectable = reconcile ? rows.filter((x) => x.status === "open").map((x) => x.id) : [];
  const bulk: BulkActionSpec[] = [
    {
      key: "ignore",
      label: t("bulkIgnore"),
      run: bulkIgnoreExceptionsAction,
      confirm: {
        title: t("bulkIgnoreTitle"),
        points: [t("bulkIgnoreNoEntry"), t("bulkIgnoreAudit")],
        submit: t("bulkIgnore"),
      },
      field: { label: t("resolve.note") },
    },
  ];
  const menu = (x: LedgerException): RowMenuItem[] => [
    {
      label: open === x.id ? t("close") : t("details"),
      href: open === x.id ? href({}) : `${href({ open: x.id })}#fin-x-h`,
    },
    ...(reconcile && x.status === "open"
      ? [{ label: t("resolve.button"), dialog: resolveDialog(x) }]
      : []),
  ];
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="fin-x-h">
        <div className="block-head">
          <h2 id="fin-x-h" className="h2">
            {t("title")}
          </h2>
          <SampleBadge step="36" endpoint={ENDPOINTS.exceptions} />
          {reconcile ? (
            <InlineAction
              action={reconcileAction}
              id={yesterday()}
              label={t("reconcileNow")}
              done={t("reconcileQueued", { date: formatDay(yesterday(), locale) })}
            />
          ) : null}
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
              count: count(c),
            })),
          ]}
        />
        <div className="card tcard">
          {rows.length === 0 ? (
            <p className="empty">{t("empty")}</p>
          ) : (
            <BulkTable ids={selectable} actions={bulk}>
              <Table cards>
                <thead>
                  <tr>
                    {selectable.length > 0 ? <SelectAllTh /> : null}
                    <Th>{t("item")}</Th>
                    <Th>{t("related")}</Th>
                    <SortTh
                      field="amount"
                      sort={sort}
                      base={BASE}
                      keep={keep}
                      first="desc"
                      className="text-right"
                    >
                      {t("amount")}
                    </SortTh>
                    <SortTh field="found" sort={sort} base={BASE} keep={keep} first="desc">
                      {t("found")}
                    </SortTh>
                    <Th>{t("state")}</Th>
                    <Th>
                      <span className="vh">{t("rowActions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((x) => {
                    const isOpen = open === x.id;
                    return [
                      <tr key={x.id} data-current={isOpen ? "" : undefined}>
                        {selectable.length > 0 ? (
                          selectable.includes(x.id) ? (
                            <SelectTd
                              id={x.id}
                              name={`${t(`kinds.${x.kind}`)} · ${x.details.order_ref ?? x.id}`}
                            />
                          ) : (
                            <Td className="t-sel" />
                          )
                        ) : null}
                        <Td className="rt-title">
                          <span className="cell2">
                            <Link
                              className="open"
                              href={isOpen ? href({}) : `${href({ open: x.id })}#fin-x-h`}
                              scroll={false}
                              aria-expanded={isOpen}
                            >
                              {t(`kinds.${x.kind}`)}
                            </Link>
                            <span className="sub ell">
                              {x.details.payment_code
                                ? t("viaCode", { code: x.details.payment_code })
                                : x.details.memo
                                  ? t("memo", { memo: x.details.memo })
                                  : t(`kindHints.${x.kind}`)}
                            </span>
                          </span>
                        </Td>
                        <Td label={t("related")}>{x.details.order_ref ?? t("unknown")}</Td>
                        <Td label={t("amount")} className="text-right">
                          <span className="cell2">
                            <span className="mono">
                              {t("received", { amount: money(x.details.received) })}
                            </span>
                            {x.details.expected &&
                            x.details.expected.amount !== x.details.received.amount ? (
                              <span className="sub mono">
                                {t("expected", { amount: money(x.details.expected) })}
                              </span>
                            ) : null}
                          </span>
                        </Td>
                        <Td label={t("found")}>
                          <Time value={x.created_at} />
                        </Td>
                        <Td label={t("state")}>
                          <StatusBadge className={EXCEPTION_BADGE[x.status]}>
                            {t(`status.${x.status}`)}
                          </StatusBadge>
                        </Td>
                        <Td className="rt-acts">
                          <RowMenu
                            label={tt("moreFor", { name: t(`kinds.${x.kind}`) })}
                            items={menu(x)}
                          />
                        </Td>
                      </tr>,
                      isOpen ? (
                        <tr key={`${x.id}-open`} className="cat-detail-row">
                          <td colSpan={selectable.length > 0 ? 7 : 6}>
                            <div className="cat-detail">
                              <h3 className="h2">
                                {t(`kinds.${x.kind}`)}
                                {x.details.order_ref ? ` · ${x.details.order_ref}` : ""}
                              </h3>
                              <Facts items={facts(x)} />
                              <p className="fhint">{t(`advice.${x.kind}`)}</p>
                              {x.kind === "unmatched_credit" && x.status === "open" ? (
                                <p className="fhint">
                                  {candidates.length === 0
                                    ? t("noCandidates", { amount: money(x.details.received) })
                                    : t("candidates", {
                                        codes: candidates
                                          .map((p) => `${p.transfer_code ?? ""} (${p.source_id})`)
                                          .join(", "),
                                      })}
                                </p>
                              ) : null}
                              {x.resolution ? (
                                <p className="fhint">
                                  {t("resolvedBy", {
                                    who: x.resolved_by ?? "",
                                    action: t(`actions.${x.resolution.action}`),
                                    note: x.resolution.note,
                                  })}{" "}
                                  <Time value={x.updated_at} />
                                </p>
                              ) : null}
                              {reconcile && x.status === "open" ? (
                                <div className="eg-acts">
                                  {x.kind === "missing_in_statement" && x.details.statement_date ? (
                                    <InlineAction
                                      action={reconcileAction}
                                      id={vietnamDay(
                                        Date.parse(`${x.details.statement_date}T12:00:00Z`) +
                                          86_400_000,
                                      )}
                                      label={t("reconcileNext")}
                                      done={t("reconcileQueued", {
                                        date: formatDay(
                                          vietnamDay(
                                            Date.parse(`${x.details.statement_date}T12:00:00Z`) +
                                              86_400_000,
                                          ),
                                          locale,
                                        ),
                                      })}
                                    />
                                  ) : null}
                                  {resolveDialog(x)}
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
            </BulkTable>
          )}
        </div>
        <Pager total={page.total} page={page.page} per={paging.per} base={BASE} keep={keep} />
        <p className="note">
          <b>{t("noCustodyStrong")}</b> {t("noCustody")}{" "}
          <Link className="open" href="/sales/shipping">
            {t("codLink")}
          </Link>
        </p>
      </section>

      <section className="block" aria-labelledby="fin-runs-h">
        <div className="block-head">
          <h2 id="fin-runs-h" className="h2">
            {t("runs.title")}
          </h2>
        </div>
        <p className="fhint">{t("runs.about")}</p>
        <div className="card tcard">
          <Table cards>
            <thead>
              <tr>
                <Th>{t("runs.statement")}</Th>
                <Th>{t("runs.provider")}</Th>
                <Th>{t("runs.by")}</Th>
                <Th>{t("runs.state")}</Th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 5).map((r) => (
                <tr key={r.id}>
                  <Td className="rt-title">{formatDay(r.statement_date, locale)}</Td>
                  <Td label={t("runs.provider")}>{r.provider}</Td>
                  <Td label={t("runs.by")}>
                    <span className="cell2">
                      {r.requested_by}
                      <span className="sub">
                        <Time value={r.created_at} />
                      </span>
                    </span>
                  </Td>
                  <Td label={t("runs.state")}>
                    <span className="cell2">
                      <StatusBadge
                        className={
                          r.status === "done"
                            ? "badge b-ok"
                            : r.status === "running"
                              ? "badge b-info"
                              : "badge b-draft"
                        }
                      >
                        {t(`runs.status.${r.status}`)}
                      </StatusBadge>
                      {r.exceptions_opened !== null ? (
                        <span className="sub">
                          {t("runs.opened", { count: r.exceptions_opened })}
                        </span>
                      ) : null}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>
    </div>
  );
}
